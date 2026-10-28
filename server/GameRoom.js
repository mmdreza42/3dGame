// Runtime-agnostic room: no ws, no Cloudflare, no timers. Adapters feed it events.
//   conn = { send(str), close(code, reason) }   (identity of the object is the key)
//   room.onConnect(conn); room.onMessage(conn, raw); room.onDisconnect(conn); room.onTick(nowMs)
// Step 3: positions are CLIENT-REPORTED (range-checked only). Step 4/5 make the server authoritative.
import {
  PROTOCOL_VERSION, T, ERR, CLOSE, RATES, LIMITS,
  decodeClient, encode, round, nextShard, seedFromRoom, makeToken,
} from '../shared/protocol.js'
import {
  PLAYER_HP, RESPAWN_MS, SPAWN_PROTECT_MS, MAX_HIT_DIST, BUDGET_CAP_MS, damageFor, hitCost, teamOf, pickSpawn, KILL_LIMIT, MATCH_END_MS,
} from '../shared/combat.js'
import { segmentClear } from '../shared/collide.js'
import { generateLayout } from '../shared/layout.js'
import { attachLadder, leaveLadder, startJump, stepHorizontalMovement, stepLadder, stepVerticalMovement } from '../shared/movement.js'

const SIM_STEP_MS = 1000 / RATES.TICK_HZ
const MAX_CATCH_UP_STEPS = 5
const MAX_INPUT_QUEUE = 12
const SNAP_MS = 1000 / RATES.SNAPSHOT_HZ
const NO_MOVE_INPUT = Object.freeze({ forward: 0, strafe: 0, sprint: false, jump: false, climb: 0, interact: false })

export class GameRoom {
  constructor(opts) {
    if (!opts || typeof opts.code !== 'string') throw new Error('GameRoom: code required')
    if (typeof opts.sanitizeName !== 'function') throw new Error('GameRoom: sanitizeName(raw, takenNames) required')
    this.code = opts.code
    this.seed = opts.seed ?? seedFromRoom(opts.code)
    this.maxPlayers = opts.maxPlayers ?? LIMITS.MAX_PLAYERS
    this.sanitizeName = opts.sanitizeName
    this.now = opts.now ?? Date.now
    this.makeToken = opts.makeToken ?? (() => makeToken())
    this.sessions = new Map() // conn -> session
    this.players = new Map() // id -> player (includes disconnected "ghosts" kept for reconnect)
    this.byToken = new Map() // token -> player
    this.nextId = 1
    this.tickN = 0
    this.simAcc = 0
    this.snapAcc = 0
    this.lastTickAt = null
    this.killsTotal = 0
    this.matchEndsAt = 0
    this._obstacles = opts.obstacles ?? null // AABB list; built lazily from the seed when not given
    this._layout = null // deterministic gameplay layout, initialized when a command client spawns
  }

  // ----- adapter-facing -----

  onConnect(conn) {
    const now = this.now()
    if (this.connectedCount() === 0) {
      this.lastTickAt = null
      this.simAcc = 0
      this.snapAcc = 0
    }
    this.sessions.set(conn, { conn, player: null, tokens: LIMITS.MAX_MSG_PER_SEC, refillAt: now, strikes: 0, connectedAt: now })
  }

  onMessage(conn, raw) {
    const s = this.sessions.get(conn)
    if (!s) return
    const now = this.now()
    s.tokens = Math.min(LIMITS.MAX_MSG_PER_SEC, s.tokens + ((now - s.refillAt) / 1000) * LIMITS.MAX_MSG_PER_SEC)
    s.refillAt = now
    if (s.tokens < 1) return this._kick(conn, ERR.RATE, CLOSE.POLICY)
    s.tokens -= 1

    const d = decodeClient(raw)
    if (!d.ok) return this._strike(s, ERR.BAD)
    const m = d.msg
    if (m.t === T.PING) return this._send(conn, { t: T.PONG, c: m.c, ts: now })
    if (m.t === T.HELLO) return s.player ? this._strike(s, ERR.BAD) : this._hello(s, m, now)
    if (m.t === T.HIT) return this._hit(s, m, now)
    // input
    if (!s.player) return this._strike(s, ERR.NO_HELLO)
    const p = s.player
    if (m.s <= p.lastSeq) return // stale or duplicate, ignore silently
    p.lastSeq = m.s
    if (!p.alive) return // dead: ignore input until respawn

    if (Array.isArray(m.p)) {
      // Legacy positions are directly applied and acknowledged immediately.
      p.pos = m.p
      p.moveInput = { ...NO_MOVE_INPUT }
      p.inputQueue = []
      p.movementMode = 'legacy'
      p.pendingSpawnSlot = null
      p.lastAppliedSeq = m.s
      p.yaw = m.y
      p.pitch = m.a
      p.weapon = m.w
    } else {
      // Command inputs are acknowledged only after a simulation step consumes them.
      const enteringCommandMode = p.movementMode !== 'commands'
      if (enteringCommandMode || !p.pos) {
        p.pendingSpawnSlot ??= p.slot
        this._spawnAt(p)
      }
      if (enteringCommandMode) {
        p.inputQueue = []
        p.lastAppliedSeq = m.s - 1
        p.moveInput = { ...NO_MOVE_INPUT }
        p.jumpWasDown = false
        p.interactWasDown = false
      }
      p.movementMode = 'commands'
      p.inputAt = now
      p.inputQueue ||= []
      p.inputQueue.push({
        seq: m.s,
        forward: m.f,
        strafe: m.d,
        sprint: m.r,
        jump: m.j,
        climb: m.c,
        interact: m.e,
        yaw: m.y,
        pitch: m.a,
        weapon: m.w,
      })
      while (p.inputQueue.length > MAX_INPUT_QUEUE) {
        const dropped = p.inputQueue.shift()
        p.lastAppliedSeq = Math.max(p.lastAppliedSeq ?? -1, dropped.seq)
      }
    }
  }

  onDisconnect(conn) {
    const s = this.sessions.get(conn)
    if (!s) return
    this.sessions.delete(conn)
    const p = s.player
    if (p && p.conn === conn) {
      p.conn = null
      p.goneAt = this.now()
      this._broadcast({ t: T.LEAVE, id: p.id }, p.id)
    }
  }

  onTick(now = this.now()) {
    const elapsed = this.lastTickAt === null ? 0 : Math.max(0, now - this.lastTickAt)
    this.lastTickAt = now

    // Wall-clock maintenance must run even when simulation time is capped.
    this._prune(now)
    this._respawns(now)
    for (const s of [...this.sessions.values()]) {
      if (!s.player && now - s.connectedAt > LIMITS.HELLO_TIMEOUT_MS) this._kick(s.conn, ERR.TIMEOUT, CLOSE.TIMEOUT)
    }

    // Fixed-step timing infrastructure. Gameplay remains client-reported for now.
    this.simAcc += Math.min(elapsed, SIM_STEP_MS * MAX_CATCH_UP_STEPS)
    let steps = 0
    while (this.simAcc + 1e-7 >= SIM_STEP_MS && steps < MAX_CATCH_UP_STEPS) {
      this.simAcc = Math.max(0, this.simAcc - SIM_STEP_MS)
      this.tickN++
      steps++
      for (const p of this.players.values()) {
        if (p.conn && p.alive && p.movementMode === 'commands' && p.pos) {
          this._stepCommandPlayer(p, SIM_STEP_MS / 1000, now)
        }
      }
    }

    // Preserve the existing no-burst snapshot policy after stalls.
    this.snapAcc += elapsed
    if (this.snapAcc >= SNAP_MS) {
      this.snapAcc -= SNAP_MS
      if (this.snapAcc >= SNAP_MS) this.snapAcc = 0
      this._snapshot(now)
    }
  }

  connectedCount() {
    let n = 0
    for (const p of this.players.values()) if (p.conn) n++
    return n
  }

  playerCount() { return this.players.size } // includes ghosts that still hold a slot

  // ----- internals -----

  _hello(s, m, now) {
    if (m.v !== PROTOCOL_VERSION) {
      this._send(s.conn, { t: T.ERROR, c: ERR.VERSION })
      return this._close(s.conn, CLOSE.PROTOCOL, ERR.VERSION)
    }
    this._prune(now)
    let p = m.k ? this.byToken.get(m.k) : null
    if (p && p.conn) p = null // token of a live player: treat as a new player, never steal the slot
    const resumed = !!p
    if (!p) {
      if (this.players.size >= this.maxPlayers) {
        this._send(s.conn, { t: T.FULL, r: this.code, x: nextShard(this.code) })
        return this._close(s.conn, CLOSE.FULL, 'full')
      }
      p = this._createPlayer(m.n)
    }
    p.conn = s.conn
    p.goneAt = null
    s.player = p
    this._send(s.conn, {
      t: T.WELCOME, v: PROTOCOL_VERSION, id: p.id, k: p.token, r: this.code, sd: this.seed, si: p.slot,
      hz: [RATES.INPUT_HZ, RATES.SNAPSHOT_HZ, RATES.TICK_HZ], ts: now,
      pl: [...this.players.values()].filter((q) => q.conn).map((q) => [q.id, q.name, q.slot]),
    })
    this._broadcast({ t: T.JOIN, id: p.id, n: p.name, si: p.slot }, p.id)
    if (this.killsTotal > 0) this._send(s.conn, this._scoresMsg())
    return resumed
  }

  _createPlayer(rawName) {
    const taken = [...this.players.values()].map((q) => q.name)
    let name = this.sanitizeName(rawName, taken)
    if (typeof name !== 'string' || !name) name = 'PLAYER'
    const used = new Set([...this.players.values()].map((q) => q.slot))
    let slot = 0
    while (used.has(slot)) slot++
    const p = {
      id: this.nextId++, name, token: this.makeToken(), slot, conn: null, goneAt: null,
      pos: null, yaw: 0, pitch: 0, weapon: 0, lastSeq: -1,
      moveInput: { ...NO_MOVE_INPUT }, movementMode: 'legacy', pendingSpawnSlot: slot,
      inputQueue: [], lastAppliedSeq: -1,
      verticalVel: 0, grounded: true, climbing: null,
      jumpWasDown: false, interactWasDown: false, inputAt: 0,
      hp: PLAYER_HP, alive: true, kills: 0, deaths: 0, respawnAt: 0, shieldUntil: 0, budget: BUDGET_CAP_MS, budgetAt: this.now(),
    }
    this.players.set(p.id, p)
    this.byToken.set(p.token, p)
    return p
  }

  _scoresMsg() {
    return { t: T.SCORES, p: [...this.players.values()].map((q) => [q.id, q.kills, q.deaths]) }
  }

  // Client-reported hit. Checks: alive, in range, not spawn-protected, and a time budget
  // (each hit costs fireInterval/pellets) so the sustained hit rate cannot beat the weapon's fire rate.
  // No wall check and no lag compensation yet.
  _hit(s, m, now) {
    const a = s.player
    if (!a) return this._strike(s, ERR.NO_HELLO)
    if (!a.alive || !a.pos || this.matchEndsAt) return
    const t = this.players.get(m.g)
    if (!t || t === a || !t.conn || !t.alive || !t.pos || now < t.shieldUntil) return
    if (teamOf(t.slot) === teamOf(a.slot)) return // no friendly fire
    if (Math.hypot(a.pos[0] - t.pos[0], a.pos[1] - t.pos[1], a.pos[2] - t.pos[2]) > MAX_HIT_DIST) return
    if (!this._canSee(a.pos, t.pos)) return
    a.budget = Math.min(BUDGET_CAP_MS, a.budget + (now - a.budgetAt))
    a.budgetAt = now
    const cost = hitCost(m.w)
    if (a.budget < cost) return
    a.budget -= cost
    t.hp = Math.max(0, t.hp - damageFor(m.w, m.h === 1))
    this._broadcast({ t: T.DMG, id: t.id, by: a.id, hp: t.hp, h: m.h })
    if (t.hp > 0) return
    t.alive = false
    t.pos = null
    t.moveInput = { ...NO_MOVE_INPUT }
    if (t.inputQueue) t.inputQueue.length = 0
    t.jumpWasDown = false
    t.interactWasDown = false
    t.moveInput = { ...NO_MOVE_INPUT }
    t.deaths++
    a.kills++
    this.killsTotal++
    t.respawnAt = now + RESPAWN_MS
    this._broadcast(this._scoresMsg())
    let tk = 0
    for (const q of this.players.values()) if (teamOf(q.slot) === teamOf(a.slot)) tk += q.kills
    if (tk >= KILL_LIMIT) {
      this.matchEndsAt = now + MATCH_END_MS
      this._broadcast({ t: T.MATCH, w: teamOf(a.slot), ms: MATCH_END_MS })
    }
  }

  _findNearbyLadder(state, ladders) {
    for (const ladder of ladders) {
      if (Math.abs(state.x - ladder.x) > 0.9) continue
      const dz = state.z - ladder.z
      if (state.feetY < 1.2 && dz > 0 && dz < 1.8) return { ladder, fromTop: false }
      if (Math.abs(state.feetY - ladder.top) < 0.7 && dz > -1.6 && dz < 0.4) {
        return { ladder, fromTop: true }
      }
    }
    return null
  }

  _stepCommandPlayer(p, dt, now) {
    if (this._layout === null) this._layout = generateLayout(this.seed)
    const layout = this._layout
    const stale = now - (p.inputAt ?? 0) > 250
    if (stale) {
      const lastQueued = p.inputQueue?.at(-1)
      if (lastQueued) p.lastAppliedSeq = Math.max(p.lastAppliedSeq ?? -1, lastQueued.seq)
      if (p.inputQueue) p.inputQueue.length = 0
      p.moveInput = { ...NO_MOVE_INPUT }
    } else if (p.inputQueue?.length) {
      const next = p.inputQueue.shift()
      p.lastAppliedSeq = next.seq
      p.moveInput = {
        forward: next.forward, strafe: next.strafe, sprint: next.sprint,
        jump: next.jump, climb: next.climb, interact: next.interact,
      }
      p.yaw = next.yaw
      p.pitch = next.pitch
      p.weapon = next.weapon
    }
    const input = stale ? NO_MOVE_INPUT : (p.moveInput || NO_MOVE_INPUT)
    let state = {
      x: p.pos[0],
      feetY: p.pos[1],
      z: p.pos[2],
      yaw: p.yaw,
      verticalVel: p.verticalVel ?? 0,
      grounded: p.grounded === true,
      climbing: p.climbing ?? null,
    }

    const jumpPressed = input.jump === true && p.jumpWasDown !== true
    const interactPressed = input.interact === true && p.interactWasDown !== true
    p.jumpWasDown = input.jump === true
    p.interactWasDown = input.interact === true

    if (interactPressed) {
      if (state.climbing) {
        state = leaveLadder(state, false)
      } else {
        const found = this._findNearbyLadder(state, layout.ladders || [])
        if (found) state = attachLadder(state, found.ladder, found.fromTop)
      }
    }

    // Match the existing client auto-attach when walking forward onto a ladder base.
    if (!state.climbing && !interactPressed && input.forward > 0 && Math.cos(state.yaw) > 0.35) {
      const found = this._findNearbyLadder(state, layout.ladders || [])
      if (found && !found.fromTop) state = attachLadder(state, found.ladder, false)
    }

    if (jumpPressed) state = startJump(state)

    if (state.climbing) {
      state = stepLadder(state, { climb: input.climb, sprint: input.sprint }, dt)
    } else {
      state = stepHorizontalMovement(state, {
        forward: input.forward,
        strafe: input.strafe,
        sprint: input.sprint,
        yaw: state.yaw,
      }, dt, {
        obstacles: layout.obstacles || [],
        platforms: layout.platforms || [],
        worldLimit: 99.5,
      })
      state = stepVerticalMovement(state, dt, layout.platforms || [])
    }

    p.pos = [state.x, state.feetY, state.z]
    p.yaw = state.yaw
    p.verticalVel = state.verticalVel ?? 0
    p.grounded = state.grounded === true
    p.climbing = state.climbing ?? null
  }

  _spawnAt(p) {
    if (this._layout === null) this._layout = generateLayout(this.seed)
    const slots = this._layout.playerSpawns || []
    if (!slots.length) return false

    const si = p.pendingSpawnSlot ?? p.slot
    const spawn = pickSpawn(slots, teamOf(p.slot), si)
    if (!spawn) return false

    p.pos = [spawn.x, 0, spawn.z]
    p.yaw = spawn.ry
    p.pitch = 0
    p.verticalVel = 0
    p.grounded = true
    p.climbing = null
    p.pendingSpawnSlot = null
    return true
  }

  // wire positions are FEET positions. Eye = feet + 1.6. Accept when the eye can see the target's chest OR head.
  _canSee(ap, tp) {
    if (this._obstacles === null) {
      try { this._obstacles = generateLayout(this.seed).obstacles || [] } catch { this._obstacles = [] }
    }
    const list = this._obstacles
    if (!list.length) return true
    for (const dy of [1.0, 1.6]) {
      if (segmentClear(ap[0], ap[1] + 1.6, ap[2], tp[0], tp[1] + dy, tp[2], list)) return true
    }
    return false
  }

  _respawns(now) {
    if (this.matchEndsAt) {
      if (now < this.matchEndsAt) return
      this.matchEndsAt = 0
      this.killsTotal = 0
      for (const p of this.players.values()) {
        const si = (p.slot * 2 + 1) % LIMITS.SPAWN_SLOTS
        p.kills = 0; p.deaths = 0; p.alive = true; p.hp = PLAYER_HP; p.pos = null
        p.moveInput = { ...NO_MOVE_INPUT }; p.pendingSpawnSlot = si
        p.inputQueue = []; p.jumpWasDown = false; p.interactWasDown = false
        p.verticalVel = 0; p.grounded = true; p.climbing = null
        p.shieldUntil = now + SPAWN_PROTECT_MS
      }
      this._broadcast(this._scoresMsg())
      for (const p of this.players.values()) this._broadcast({ t: T.RESPAWN, id: p.id, si: p.pendingSpawnSlot })
      return
    }
    for (const p of this.players.values()) {
      if (p.alive || now < p.respawnAt) continue
      p.alive = true
      p.hp = PLAYER_HP
      p.pos = null
      p.moveInput = { ...NO_MOVE_INPUT }
      p.inputQueue = []; p.jumpWasDown = false; p.interactWasDown = false
      p.verticalVel = 0; p.grounded = true; p.climbing = null
      const si = (p.slot + p.deaths * 7) % LIMITS.SPAWN_SLOTS
      p.pendingSpawnSlot = si
      p.shieldUntil = now + SPAWN_PROTECT_MS
      this._broadcast({ t: T.RESPAWN, id: p.id, si })
    }
  }

  _prune(now) {
    for (const p of this.players.values()) {
      if (!p.conn && p.goneAt !== null && now - p.goneAt > LIMITS.RECONNECT_MS) {
        this.players.delete(p.id)
        this.byToken.delete(p.token)
      }
    }
  }

  _snapshot(now) {
    const rows = []
    for (const p of this.players.values()) {
      if (!p.conn || !p.pos || !p.alive) continue
      const ackSeq = p.movementMode === 'commands' ? (p.lastAppliedSeq ?? -1) : p.lastSeq
      const row = [p.id, round(p.pos[0], 2), round(p.pos[1], 2), round(p.pos[2], 2), round(p.yaw, 3), round(p.pitch, 3), p.weapon, ackSeq]
      // Keep legacy rows unchanged; command clients also need vertical state for reconciliation.
      if (p.movementMode === 'commands') {
        if (this._layout === null) this._layout = generateLayout(this.seed)
        const climbIndex = p.climbing
          ? (this._layout.ladders || []).findIndex((ladder) =>
              ladder.x === p.climbing.x &&
              ladder.z === p.climbing.z &&
              ladder.bottom === p.climbing.bottom &&
              ladder.top === p.climbing.top)
          : -1
        row.push(round(p.verticalVel ?? 0, 3), p.grounded === true ? 1 : 0, climbIndex)
      }
      rows.push(row)
    }
    const str = encode({ t: T.SNAPSHOT, n: this.tickN, ts: now, p: rows })
    for (const p of this.players.values()) if (p.conn) this._sendRaw(p.conn, str)
  }

  _strike(s, code) {
    s.strikes++
    if (s.strikes >= LIMITS.MAX_STRIKES) return this._kick(s.conn, code, CLOSE.POLICY)
    if (s.strikes <= 3) this._send(s.conn, { t: T.ERROR, c: code })
  }

  _kick(conn, code, closeCode) {
    this._send(conn, { t: T.ERROR, c: code })
    this._close(conn, closeCode, code)
    this.onDisconnect(conn)
  }

  _close(conn, code, reason) {
    try { conn.close(code, reason) } catch { /* already closed */ }
    if (this.sessions.has(conn) && !this.sessions.get(conn).player) this.sessions.delete(conn)
  }

  _broadcast(obj, exceptId) {
    const str = encode(obj)
    for (const p of this.players.values()) if (p.conn && p.id !== exceptId) this._sendRaw(p.conn, str)
  }

  _send(conn, obj) { this._sendRaw(conn, encode(obj)) }

  _sendRaw(conn, str) {
    try { conn.send(str) } catch { /* socket gone; onDisconnect will follow */ }
  }
}
