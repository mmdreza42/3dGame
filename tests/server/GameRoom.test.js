import { describe, it, expect } from 'vitest'
import { GameRoom } from '../../server/GameRoom.js'
import { PROTOCOL_VERSION, LIMITS, encode, decodeServer } from '../../shared/protocol.js'
import { pickSpawn, teamOf } from '../../shared/combat.js'
import { generateLayout } from '../../shared/layout.js'

// simple sanitizer standing in for shared/names.js (the real one is covered by names-adapter.test.js)
const sanitizeName = (raw, taken) => {
  let n = (raw || '').trim().toUpperCase().slice(0, 16) || 'PLAYER'
  const lower = taken.map((t) => t.toLowerCase())
  let out = n; let i = 2
  while (lower.includes(out.toLowerCase())) out = `${n}${i++}`
  return out
}

function mkConn() {
  const c = { sent: [], closed: null, send(s) { c.sent.push(JSON.parse(s)) }, close(code, reason) { c.closed = { code, reason } } }
  c.of = (t) => c.sent.filter((m) => m.t === t)
  return c
}

function mkRoom(extra = {}) {
  let n = 0
  const clock = { t: 1000 }
  const room = new GameRoom({ code: 'abcd', sanitizeName, now: () => clock.t, makeToken: () => `tok${String(++n).padStart(20, '0')}`, ...extra })
  return { room, clock }
}

function join(room, name = 'Neo', extra = {}) {
  const c = mkConn()
  room.onConnect(c)
  room.onMessage(c, encode({ t: 'h', v: PROTOCOL_VERSION, n: name, ...extra }))
  return c
}

const input = (s, x = 0) => encode({ t: 'i', s, p: [x, 1, 2], y: 0.5, a: 0.1, w: 2 })

describe('join / welcome', () => {
  it('answers hello with welcome (seed, id, token, roster) and announces join', () => {
    const { room } = mkRoom()
    const a = join(room, 'Neo')
    const w = a.of('w')[0]
    expect(w.id).toBe(1)
    expect(w.sd).toBe(room.seed)
    expect(w.r).toBe('abcd')
    expect(w.k).toMatch(/^tok/)
    expect(w.hz).toEqual([30, 20, 30])
    expect(w.pl).toEqual([[1, 'NEO', 0]])
    expect(decodeServer(JSON.stringify(w)).ok).toBe(true)
    const b = join(room, 'Trin')
    expect(b.of('w')[0].si).toBe(1)
    expect(b.of('w')[0].pl.length).toBe(2)
    expect(a.of('j')).toEqual([{ t: 'j', id: 2, n: 'TRIN', si: 1 }])
  })

  it('dedupes names', () => {
    const { room } = mkRoom()
    join(room, 'Neo'); const b = join(room, 'neo'); const c = join(room, 'NEO')
    expect(b.of('w')[0].pl.map((p) => p[1])).toEqual(['NEO', 'NEO2'])
    expect(c.of('w')[0].pl.map((p) => p[1])).toEqual(['NEO', 'NEO2', 'NEO3'])
  })

  it('rejects a wrong protocol version', () => {
    const { room } = mkRoom()
    const c = mkConn(); room.onConnect(c)
    room.onMessage(c, encode({ t: 'h', v: 99, n: 'x' }))
    expect(c.of('e')[0].c).toBe('version')
    expect(c.closed.code).toBe(1002)
    expect(room.playerCount()).toBe(0)
  })

  it('answers "room full" with next public shard, and null for private rooms', () => {
    const { room } = mkRoom({ code: 'public-1' })
    for (let i = 0; i < LIMITS.MAX_PLAYERS; i++) join(room, `p${i}`)
    const x = join(room, 'late')
    expect(x.of('f')).toEqual([{ t: 'f', r: 'public-1', x: 'public-2' }])
    expect(x.closed.code).toBe(4001)
    expect(room.playerCount()).toBe(8)
    const { room: priv } = mkRoom({ code: 'abcd' })
    for (let i = 0; i < 8; i++) join(priv, `p${i}`)
    expect(join(priv, 'late').of('f')[0].x).toBe(null)
  })

  it('hello twice is a strike, input before hello is rejected', () => {
    const { room } = mkRoom()
    const a = join(room)
    room.onMessage(a, encode({ t: 'h', v: 1, n: 'again' }))
    expect(a.of('e').length).toBe(1)
    const c = mkConn(); room.onConnect(c)
    room.onMessage(c, input(1))
    expect(c.of('e')[0].c).toBe('nohello')
  })

  it('closes sockets that never say hello', () => {
    const { room, clock } = mkRoom()
    const c = mkConn(); room.onConnect(c)
    clock.t += LIMITS.HELLO_TIMEOUT_MS + 1
    room.onTick(clock.t)
    expect(c.closed.code).toBe(4002)
  })
})

describe('leave / reconnect', () => {
  it('broadcasts leave and frees the slot after 60 s', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A'); const b = join(room, 'B')
    room.onDisconnect(b)
    expect(a.of('l')).toEqual([{ t: 'l', id: 2 }])
    expect(room.connectedCount()).toBe(1)
    expect(room.playerCount()).toBe(2) // ghost keeps the slot
    clock.t += 59000; room.onTick(clock.t)
    expect(room.playerCount()).toBe(2)
    clock.t += 2000; room.onTick(clock.t)
    expect(room.playerCount()).toBe(1)
  })

  it('resumes the same player with the token inside 60 s', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A'); const b = join(room, 'B')
    const token = b.of('w')[0].k
    room.onDisconnect(b)
    clock.t += 30000
    const b2 = join(room, 'ignored', { k: token })
    const w = b2.of('w')[0]
    expect(w.id).toBe(2)
    expect(w.pl.map((p) => p[1])).toEqual(['A', 'B'])
    expect(a.of('j').pop()).toEqual({ t: 'j', id: 2, n: 'B', si: 1 })
  })

  it('a token older than 60 s starts a fresh player', () => {
    const { room, clock } = mkRoom()
    join(room, 'A'); const b = join(room, 'B')
    const token = b.of('w')[0].k
    room.onDisconnect(b)
    clock.t += 61000
    const b2 = join(room, 'B', { k: token })
    expect(b2.of('w')[0].id).toBe(3)
  })

  it('a token of a live player never steals the slot', () => {
    const { room } = mkRoom()
    const a = join(room, 'A')
    const dup = join(room, 'A', { k: a.of('w')[0].k })
    expect(dup.of('w')[0].id).toBe(2)
    expect(room.connectedCount()).toBe(2)
  })

  it('a ghost still counts toward "full" but can come back', () => {
    const { room } = mkRoom()
    const cs = []
    for (let i = 0; i < 8; i++) cs.push(join(room, `p${i}`))
    const token = cs[7].of('w')[0].k
    room.onDisconnect(cs[7])
    expect(join(room, 'new').of('f').length).toBe(1)
    expect(join(room, 'x', { k: token }).of('w').length).toBe(1)
  })
})

describe('rate limit and strikes', () => {
  it('kicks at more than 120 messages in one second', () => {
    const { room } = mkRoom()
    const a = join(room)
    for (let i = 0; i < 119; i++) room.onMessage(a, input(i + 1))
    expect(a.closed).toBe(null)
    for (let i = 0; i < 10; i++) room.onMessage(a, input(500 + i))
    expect(a.closed.code).toBe(1008)
    expect(a.of('e').pop().c).toBe('rate')
    expect(room.connectedCount()).toBe(0)
  })

  it('allows a steady 30 Hz input stream indefinitely', () => {
    const { room, clock } = mkRoom()
    const a = join(room)
    for (let i = 1; i <= 600; i++) { clock.t += 33; room.onMessage(a, input(i)) }
    expect(a.closed).toBe(null)
  })

  it('closes after repeated garbage and rate-limits error replies', () => {
    const { room } = mkRoom()
    const a = join(room)
    for (let i = 0; i < 10; i++) room.onMessage(a, 'garbage')
    expect(a.of('e').length).toBeLessThanOrEqual(4)
    expect(a.closed.code).toBe(1008)
  })

  it('rejects oversize frames', () => {
    const { room } = mkRoom()
    const a = join(room)
    room.onMessage(a, 'x'.repeat(2000))
    expect(a.of('e')[0].c).toBe('bad')
  })
})

describe('input and snapshots', () => {
  it('ignores stale/duplicate seq and clamps nothing outside the validator', () => {
    const { room, clock } = mkRoom()
    const a = join(room)
    room.onMessage(a, input(5, 10))
    room.onMessage(a, input(4, 99)) // stale
    room.onMessage(a, input(5, 98)) // duplicate
    room.onTick(clock.t); clock.t += 50; room.onTick(clock.t)
    expect(a.of('s').pop().p[0].slice(1, 4)).toEqual([10, 1, 2])
  })

  it('spawns command clients using the deterministic server layout', () => {
    const { room } = mkRoom()
    const a = join(room, 'A')
    room.onMessage(a, encode({
      t: 'i', s: 1, f: 1, d: -1, r: true, j: false, c: 1, e: true,
      y: 0.5, a: 0.1, w: 2,
    }))

    const p = room.players.get(1)
    const layout = generateLayout(room.seed)
    const expected = pickSpawn(layout.playerSpawns, teamOf(p.slot), p.slot)
    expect(p.pos).toEqual([expected.x, 0, expected.z])
    expect(p.movementMode).toBe('commands')
    expect(p.pendingSpawnSlot).toBe(null)
    expect(p.moveInput).toEqual({
      forward: 0, strafe: 0, sprint: false, jump: false, climb: 0, interact: false,
    })
    expect(p.inputQueue).toEqual([{
      seq: 1, forward: 1, strafe: -1, sprint: true, jump: false, climb: 1,
      interact: true, yaw: 0.5, pitch: 0.1, weapon: 2,
    }])
    expect(p.lastAppliedSeq).toBe(0)
    // Aim and weapon state in this packet apply when the server consumes it.
    expect(p.yaw).toBe(expected.ry)
    expect(p.pitch).toBe(0)
    expect(p.weapon).toBe(0)
    expect(p.inputQueue[0]).toMatchObject({ yaw: 0.5, pitch: 0.1, weapon: 2 })
  })

  it('uses the advertised respawn slot when a command client returns', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A')
    const p = room.players.get(1)
    p.deaths = 2
    p.alive = false
    p.respawnAt = clock.t + 1

    clock.t += 2
    room.onTick(clock.t)

    const respawn = a.of('r').at(-1)
    const expected = pickSpawn(
      generateLayout(room.seed).playerSpawns,
      teamOf(p.slot),
      respawn.si,
    )
    expect(p.pendingSpawnSlot).toBe(respawn.si)

    room.onMessage(a, encode({
      t: 'i', s: 1, f: 0, d: 0, r: false, j: false, c: 0, e: false,
      y: 0, a: 0, w: 0,
    }))
    expect(p.pos).toEqual([expected.x, 0, expected.z])
    expect(p.pendingSpawnSlot).toBe(null)
  })

  it('processes queued inputs in order and acknowledges only applied commands', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A')
    const sendCommand = (s, f, d) => room.onMessage(a, encode({
      t: 'i', s, f, d, r: false, j: false, c: 0, e: false,
      y: 0, a: 0, w: 0,
    }))
    sendCommand(1, 1, 0)
    sendCommand(2, 0, 1)

    const p = room.players.get(1)
    room._layout = { ...generateLayout(room.seed), obstacles: [], platforms: [], ladders: [] }
    p.pos = [0, 0, 0]
    p.yaw = 0
    p.grounded = true
    p.verticalVel = 0

    expect(p.inputQueue.map((item) => item.seq)).toEqual([1, 2])
    expect(p.lastAppliedSeq).toBe(0)

    room.onTick(clock.t)
    expect(p.lastAppliedSeq).toBe(0)
    clock.t += 1000 / 30
    room.onTick(clock.t)
    expect(p.lastAppliedSeq).toBe(1)
    expect(p.pos[2]).toBeCloseTo(-0.2)

    room._snapshot(clock.t)
    expect(a.of('s').at(-1).p[0][7]).toBe(1)

    clock.t += 1000 / 30
    room.onTick(clock.t)
    expect(p.lastAppliedSeq).toBe(2)
    expect(p.pos[0]).toBeCloseTo(0.2)
  })

  it('drops oldest commands when the bounded input queue fills', () => {
    const { room } = mkRoom()
    const a = join(room, 'A')
    for (let s = 1; s <= 15; s++) {
      room.onMessage(a, encode({
        t: 'i', s, f: 0, d: 0, r: false, j: false, c: 0, e: false,
        y: 0, a: 0, w: 0,
      }))
    }
    const p = room.players.get(1)
    expect(p.inputQueue).toHaveLength(12)
    expect(p.inputQueue[0].seq).toBe(4)
    expect(p.inputQueue.at(-1).seq).toBe(15)
    expect(p.lastAppliedSeq).toBe(3)
  })

  it('moves command-controlled players on fixed server ticks', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A')
    room.onMessage(a, encode({
      t: 'i', s: 1, f: 1, d: 0, r: false, j: false, c: 0, e: false,
      y: 0, a: 0, w: 0,
    }))

    const p = room.players.get(1)
    expect(p.movementMode).toBe('commands')
    // Isolate deterministic movement from map collision for this fixed-step test.
    const generated = generateLayout(room.seed)
    room._layout = { ...generated, obstacles: [], platforms: [], ladders: [] }
    p.pos = [0, 0, 0]
    p.yaw = 0
    p.grounded = true
    p.verticalVel = 0

    room.onTick(clock.t)
    expect(p.pos).toEqual([0, 0, 0])
    clock.t += 1000 / 30
    room.onTick(clock.t)
    expect(p.pos[0]).toBeCloseTo(0)
    expect(p.pos[1]).toBeCloseTo(0)
    expect(p.pos[2]).toBeCloseTo(-0.2)
  })

  it('does not restart a jump while jump remains held', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A')
    room.onMessage(a, encode({
      t: 'i', s: 1, f: 0, d: 0, r: false, j: true, c: 0, e: false,
      y: 0, a: 0, w: 0,
    }))

    const p = room.players.get(1)
    room._layout = { ...generateLayout(room.seed), obstacles: [], platforms: [], ladders: [] }
    p.pos = [0, 0, 0]
    p.grounded = true
    p.verticalVel = 0

    room.onTick(clock.t)
    clock.t += 1000 / 30
    room.onTick(clock.t)
    const firstVelocity = p.verticalVel
    expect(p.pos[1]).toBeGreaterThan(0)
    expect(firstVelocity).toBeGreaterThan(0)

    clock.t += 1000 / 30
    room.onTick(clock.t)
    expect(p.verticalVel).toBeLessThan(firstVelocity)
    expect(p.verticalVel).toBeGreaterThan(0)
  })

  it('includes vertical state in command-mode snapshots only', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A')
    room.onMessage(a, encode({
      t: 'i', s: 1, f: 0, d: 0, r: false, j: false, c: 0, e: false,
      y: 0.5, a: 0.1, w: 2,
    }))

    const p = room.players.get(1)
    room._layout = {
      ...generateLayout(room.seed),
      ladders: [{ x: 2, z: 4, bottom: 0, top: 7.25 }],
    }
    p.pos = [1.234, 2.345, 3.456]
    p.yaw = 0.5
    p.pitch = 0.1
    p.weapon = 2
    p.verticalVel = 3.5
    p.grounded = false
    p.climbing = { x: 2, z: 4, bottom: 0, top: 7.25 }

    room._snapshot(clock.t)
    const snapshot = a.of('s').at(-1)
    expect(snapshot.p[0]).toEqual([1, 1.23, 2.35, 3.46, 0.5, 0.1, 2, 0, 3.5, 0, 0]) // received, not yet applied
    expect(decodeServer(JSON.stringify(snapshot)).ok).toBe(true)

    p.movementMode = 'legacy'
    room._snapshot(clock.t)
    expect(a.of('s').at(-1).p[0]).toHaveLength(8)
  })

  it('snapshot has the agreed shape and is skipped for players without a position', () => {
    const { room, clock } = mkRoom()
    const a = join(room, 'A'); const b = join(room, 'B')
    room.onMessage(a, input(7, 3.14159))
    room.onTick(clock.t); clock.t += 50; room.onTick(clock.t)
    const s = b.of('s').pop()
    expect(decodeServer(JSON.stringify(s)).ok).toBe(true)
    expect(s.p).toEqual([[1, 3.14, 1, 2, 0.5, 0.1, 2, 7]])
    expect(Object.keys(s).sort()).toEqual(['n', 'p', 'ts', 't'].sort())
    expect(a.of('s').pop().p.length).toBe(1) // everyone gets the same snapshot, including the sender (ack seq)
  })

  it('advances the simulation tick at a fixed 30 Hz cadence', () => {
    const { room, clock } = mkRoom()
    join(room)
    room.onTick(clock.t)
    expect(room.tickN).toBe(0)

    clock.t += 1000 / 60
    room.onTick(clock.t)
    expect(room.tickN).toBe(0)

    clock.t += 1000 / 60
    room.onTick(clock.t)
    expect(room.tickN).toBe(1)

    clock.t += 1000 / 10
    room.onTick(clock.t)
    expect(room.tickN).toBe(4)
  })

  it('bounds simulation catch-up after a long stall', () => {
    const { room, clock } = mkRoom()
    join(room)
    room.onTick(clock.t)
    clock.t += 10000
    room.onTick(clock.t)
    expect(room.tickN).toBe(5)
  })

  it('sends ~20 snapshots per second from a 30 Hz tick', () => {
    const { room, clock } = mkRoom()
    const a = join(room)
    room.onMessage(a, input(1))
    for (let i = 0; i < 300; i++) { room.onTick(clock.t); clock.t += 1000 / 30 }
    const n = a.of('s').length
    expect(n).toBeGreaterThan(195); expect(n).toBeLessThan(205) // 10 s at 20 Hz -> ~200
  })

  it('does not burst after a stall', () => {
    const { room, clock } = mkRoom()
    const a = join(room); room.onMessage(a, input(1))
    room.onTick(clock.t); clock.t += 10000; room.onTick(clock.t)
    expect(a.of('s').length).toBe(1)
  })

  it('ping gets a pong even before hello', () => {
    const { room } = mkRoom()
    const c = mkConn(); room.onConnect(c)
    room.onMessage(c, encode({ t: 'p', c: 42 }))
    expect(c.of('o')[0].c).toBe(42)
  })

  it('survives a throwing socket', () => {
    const { room, clock } = mkRoom()
    const a = join(room); room.onMessage(a, input(1))
    const bad = { send() { throw new Error('boom') }, close() { throw new Error('boom') } }
    room.onConnect(bad); room.onMessage(bad, encode({ t: 'h', v: 1, n: 'bad' }))
    expect(() => { room.onTick(clock.t); clock.t += 60; room.onTick(clock.t) }).not.toThrow()
  })
})
