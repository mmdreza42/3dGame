#!/usr/bin/env bash
# NEXUS STRIKE phase 3: protocol + GameRoom + Node/Worker adapters + client net layer (+ tests).
# Run from the project root:  bash apply_phase3.sh
# Touches NOTHING under /level or app/components/PvpGame.vue. Existing files it replaces are backed up first.
set -euo pipefail

[ -d app ] && [ -d shared ] && [ -f shared/layout.js ] || { echo "FAILED: run from the project root (needs app/ and shared/layout.js). Nothing changed."; exit 1; }

BK=".phase3_backup/$(date +%Y%m%d-%H%M%S)"
w() { # w <path>  (content on stdin)
  mkdir -p "$(dirname "$1")"
  if [ -e "$1" ]; then mkdir -p "$BK/$(dirname "$1")"; cp -p "$1" "$BK/$1"; echo "  backup  $1 -> $BK/$1"; fi
  cat > "$1"
  echo "  wrote   $1"
}

echo "== phase 3: writing files"
w shared/protocol.js <<'EOF'
// NEXUS STRIKE network protocol, version 1.
// ONE module: constants, validators, encode/decode, room-code and token helpers.
// Pure JS, no imports, runs in browser, Node and Cloudflare Workers.

export const PROTOCOL_VERSION = 1

// message types (short on the wire)
export const T = {
  HELLO: 'h', INPUT: 'i', PING: 'p', // client -> server
  WELCOME: 'w', SNAPSHOT: 's', JOIN: 'j', LEAVE: 'l', FULL: 'f', ERROR: 'e', PONG: 'o', // server -> client
}

// error codes carried in {t:'e', c}
export const ERR = {
  VERSION: 'version', BAD: 'bad', NO_HELLO: 'nohello', RATE: 'rate', TIMEOUT: 'timeout',
}

// websocket close codes (4000+ are application codes)
export const CLOSE = { NORMAL: 1000, PROTOCOL: 1002, POLICY: 1008, FULL: 4001, TIMEOUT: 4002 }

export const RATES = { INPUT_HZ: 30, SNAPSHOT_HZ: 20, TICK_HZ: 30 }

export const LIMITS = {
  MAX_PLAYERS: 8,
  SPAWN_SLOTS: 16,
  MAX_MSG_BYTES: 1024,
  MAX_MSG_PER_SEC: 120,
  MAX_STRIKES: 10,
  RECONNECT_MS: 60000,
  HELLO_TIMEOUT_MS: 10000,
  NAME_RAW_MAX: 64,
  WORLD_LIMIT: 500, // |x|,|z| bound accepted from clients
  Y_MIN: -50,
  Y_MAX: 200,
  MAX_SHARD: 99,
}

export const DEFAULT_ROOM = 'public-1'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi
const isStr = (v, max) => typeof v === 'string' && v.length <= max
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const onlyKeys = (m, keys) => Object.keys(m).every((k) => keys.includes(k))
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/
const ROOM_RE = /^[a-z0-9][a-z0-9-]{0,23}$/

export function round(n, d) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

// ---------- room codes, shards, seed, tokens ----------

export function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return null
  const c = raw.trim().toLowerCase()
  return ROOM_RE.test(c) ? c : null
}

export function isPublicRoom(code) {
  return /^public-\d{1,2}$/.test(code)
}

// next public shard when this one is full; null for private rooms or past the last shard
export function nextShard(code) {
  const m = /^public-(\d{1,2})$/.exec(code)
  if (!m) return null
  const n = Number(m[1]) + 1
  return n <= LIMITS.MAX_SHARD ? `public-${n}` : null
}

// same room code -> same seed, on client and server (FNV-1a 32 bit)
export function seedFromRoom(code) {
  let h = 0x811c9dc5
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % 999999) + 1
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function makeRoomCode(rng = Math.random) {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]
  return s
}

// reconnect token; needs a CSPRNG (no Math.random fallback on purpose)
export function makeToken(c = globalThis.crypto) {
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('crypto.getRandomValues missing')
  const a = new Uint8Array(18)
  c.getRandomValues(a)
  let s = ''
  for (const b of a) s += b.toString(16).padStart(2, '0')
  return s // 36 hex chars
}

// ---------- client -> server validators (return null when ok, else a reason) ----------

const CLIENT = {
  [T.HELLO](m) {
    if (!onlyKeys(m, ['t', 'v', 'n', 'k'])) return 'keys'
    if (!isInt(m.v, 0, 1000)) return 'v'
    if (!isStr(m.n, LIMITS.NAME_RAW_MAX)) return 'n'
    if (m.k !== undefined && !(typeof m.k === 'string' && TOKEN_RE.test(m.k))) return 'k'
    return null
  },
  [T.INPUT](m) {
    if (!onlyKeys(m, ['t', 's', 'p', 'y', 'a', 'w'])) return 'keys'
    if (!isInt(m.s, 0, 2147483647)) return 's'
    if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(isNum)) return 'p'
    const [x, y, z] = m.p
    const L = LIMITS.WORLD_LIMIT
    if (Math.abs(x) > L || Math.abs(z) > L || y < LIMITS.Y_MIN || y > LIMITS.Y_MAX) return 'p range'
    if (!isNum(m.y) || Math.abs(m.y) > 1000) return 'y'
    if (!isNum(m.a) || Math.abs(m.a) > 4) return 'a'
    if (!isInt(m.w, 0, 15)) return 'w'
    return null
  },
  [T.PING](m) {
    if (!onlyKeys(m, ['t', 'c'])) return 'keys'
    if (!isNum(m.c)) return 'c'
    return null
  },
}

// ---------- server -> client validators ----------

const SERVER = {
  [T.WELCOME](m) {
    if (!onlyKeys(m, ['t', 'v', 'id', 'k', 'r', 'sd', 'si', 'hz', 'ts', 'pl'])) return 'keys'
    if (!isInt(m.v, 0, 1000) || !isInt(m.id, 1, 2147483647)) return 'v/id'
    if (typeof m.k !== 'string' || !TOKEN_RE.test(m.k)) return 'k'
    if (normalizeRoomCode(m.r) !== m.r) return 'r'
    if (!isInt(m.sd, 0, 2147483647) || !isInt(m.si, 0, LIMITS.SPAWN_SLOTS - 1)) return 'sd/si'
    if (!Array.isArray(m.hz) || m.hz.length !== 3 || !m.hz.every((n) => isInt(n, 1, 240))) return 'hz'
    if (!isNum(m.ts)) return 'ts'
    if (!Array.isArray(m.pl) || m.pl.length > LIMITS.MAX_PLAYERS) return 'pl'
    for (const e of m.pl) {
      if (!Array.isArray(e) || e.length !== 3 || !isInt(e[0], 1, 2147483647) || !isStr(e[1], LIMITS.NAME_RAW_MAX) || !isInt(e[2], 0, LIMITS.SPAWN_SLOTS - 1)) return 'pl entry'
    }
    return null
  },
  [T.SNAPSHOT](m) {
    if (!onlyKeys(m, ['t', 'n', 'ts', 'p'])) return 'keys'
    if (!isInt(m.n, 0, 2147483647) || !isNum(m.ts)) return 'n/ts'
    if (!Array.isArray(m.p) || m.p.length > LIMITS.MAX_PLAYERS) return 'p'
    for (const r of m.p) {
      if (!Array.isArray(r) || r.length !== 8 || !r.every(isNum) || !Number.isInteger(r[0]) || r[0] < 1) return 'row'
    }
    return null
  },
  [T.JOIN](m) {
    if (!onlyKeys(m, ['t', 'id', 'n', 'si'])) return 'keys'
    if (!isInt(m.id, 1, 2147483647) || !isStr(m.n, LIMITS.NAME_RAW_MAX) || !isInt(m.si, 0, LIMITS.SPAWN_SLOTS - 1)) return 'fields'
    return null
  },
  [T.LEAVE](m) {
    if (!onlyKeys(m, ['t', 'id'])) return 'keys'
    return isInt(m.id, 1, 2147483647) ? null : 'id'
  },
  [T.FULL](m) {
    if (!onlyKeys(m, ['t', 'r', 'x'])) return 'keys'
    if (normalizeRoomCode(m.r) !== m.r) return 'r'
    if (m.x !== null && normalizeRoomCode(m.x) !== m.x) return 'x'
    return null
  },
  [T.ERROR](m) {
    if (!onlyKeys(m, ['t', 'c'])) return 'keys'
    return isStr(m.c, 16) ? null : 'c'
  },
  [T.PONG](m) {
    if (!onlyKeys(m, ['t', 'c', 'ts'])) return 'keys'
    return isNum(m.c) && isNum(m.ts) ? null : 'c/ts'
  },
}

function validate(table, m) {
  if (!isPlainObject(m)) return { ok: false, reason: 'not an object' }
  if (typeof m.t !== 'string' || !Object.prototype.hasOwnProperty.call(table, m.t)) return { ok: false, reason: 'unknown type' }
  const bad = table[m.t](m)
  return bad ? { ok: false, reason: `${m.t}:${bad}` } : { ok: true, msg: m }
}

export const validateClientMessage = (m) => validate(CLIENT, m)
export const validateServerMessage = (m) => validate(SERVER, m)

// ---------- encode / decode ----------

export function encode(msg) {
  return JSON.stringify(msg)
}

function utf8Length(s) {
  return new TextEncoder().encode(s).length
}

// raw must be a string (binary frames are rejected)
export function decode(raw, maxBytes = LIMITS.MAX_MSG_BYTES) {
  if (typeof raw !== 'string') return { ok: false, reason: 'binary' }
  if (raw.length > maxBytes || utf8Length(raw) > maxBytes) return { ok: false, reason: 'too big' }
  let m
  try { m = JSON.parse(raw) } catch { return { ok: false, reason: 'json' } }
  return { ok: true, msg: m }
}

export function decodeClient(raw) {
  const d = decode(raw)
  return d.ok ? validateClientMessage(d.msg) : d
}

export function decodeServer(raw) {
  const d = decode(raw, 4096)
  return d.ok ? validateServerMessage(d.msg) : d
}
EOF
w server/GameRoom.js <<'EOF'
// Runtime-agnostic room: no ws, no Cloudflare, no timers. Adapters feed it events.
//   conn = { send(str), close(code, reason) }   (identity of the object is the key)
//   room.onConnect(conn); room.onMessage(conn, raw); room.onDisconnect(conn); room.onTick(nowMs)
// Step 3: positions are CLIENT-REPORTED (range-checked only). Step 4/5 make the server authoritative.
import {
  PROTOCOL_VERSION, T, ERR, CLOSE, RATES, LIMITS,
  decodeClient, encode, round, nextShard, seedFromRoom, makeToken,
} from '../shared/protocol.js'

const SNAP_MS = 1000 / RATES.SNAPSHOT_HZ

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
    this.snapAcc = 0
    this.lastTickAt = null
  }

  // ----- adapter-facing -----

  onConnect(conn) {
    const now = this.now()
    if (this.connectedCount() === 0) this.lastTickAt = null
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
    // input
    if (!s.player) return this._strike(s, ERR.NO_HELLO)
    const p = s.player
    if (m.s <= p.lastSeq) return // stale or duplicate, ignore silently
    p.lastSeq = m.s
    p.pos = m.p
    p.yaw = m.y
    p.pitch = m.a
    p.weapon = m.w
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
    this.tickN++
    const dt = this.lastTickAt === null ? 0 : Math.min(250, now - this.lastTickAt)
    this.lastTickAt = now
    this._prune(now)
    for (const s of [...this.sessions.values()]) {
      if (!s.player && now - s.connectedAt > LIMITS.HELLO_TIMEOUT_MS) this._kick(s.conn, ERR.TIMEOUT, CLOSE.TIMEOUT)
    }
    this.snapAcc += dt
    if (this.snapAcc >= SNAP_MS) {
      this.snapAcc -= SNAP_MS
      if (this.snapAcc >= SNAP_MS) this.snapAcc = 0 // no catch-up bursts after a stall
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
    }
    this.players.set(p.id, p)
    this.byToken.set(p.token, p)
    return p
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
      if (!p.conn || !p.pos) continue
      rows.push([p.id, round(p.pos[0], 2), round(p.pos[1], 2), round(p.pos[2], 2), round(p.yaw, 3), round(p.pitch, 3), p.weapon, p.lastSeq])
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
EOF
w server/names-adapter.js <<'EOF'
// Bridges shared/names.js to the GameRoom sanitizer signature: (raw, takenNames) -> unique clean name.
// ASSUMPTION (verify with tests/server/names-adapter.test.js): cleanName(raw) -> string,
// dedupeName(name, takenNamesArray) -> string.
import { cleanName, dedupeName } from '../shared/names.js'

export function makeSanitizer() {
  return (raw, taken) => {
    let name = cleanName(raw)
    if (typeof name !== 'string' || !name) name = 'PLAYER'
    return dedupeName(name, taken)
  }
}
EOF
w server/node.mjs <<'EOF'
// Local dev server (Node + "ws"). Run: node server/node.mjs   (PORT env, default 8787)
// URL: ws://localhost:8787/room/<code>     health: http://localhost:8787/health
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'
import { GameRoom } from './GameRoom.js'
import { makeSanitizer } from './names-adapter.js'
import { LIMITS, RATES, normalizeRoomCode } from '../shared/protocol.js'

export function createGameServer({ port = Number(process.env.PORT) || 8787, maxRooms = 200, sanitizeName = makeSanitizer(), log = console.log } = {}) {
  const rooms = new Map() // code -> { room, timer, cleanup }
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.MAX_MSG_BYTES })

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
      return
    }
    res.writeHead(404).end('not found')
  })

  function getRoom(code) {
    let e = rooms.get(code)
    if (!e) {
      if (rooms.size >= maxRooms) return null
      e = { room: new GameRoom({ code, sanitizeName }), timer: null, cleanup: null }
      rooms.set(code, e)
      log(`[room ${code}] created seed=${e.room.seed}`)
    }
    return e
  }

  function startTick(e) {
    if (!e.timer) e.timer = setInterval(() => e.room.onTick(Date.now()), 1000 / RATES.TICK_HZ)
    if (e.cleanup) { clearTimeout(e.cleanup); e.cleanup = null }
  }

  function maybeStop(code, e) {
    if (e.room.connectedCount() > 0) return
    clearInterval(e.timer); e.timer = null // tick only while players are present
    if (!e.cleanup) {
      e.cleanup = setTimeout(() => {
        if (e.room.connectedCount() === 0) { rooms.delete(code); log(`[room ${code}] removed`) }
      }, LIMITS.RECONNECT_MS + 5000)
      e.cleanup.unref?.()
    }
  }

  server.on('upgrade', (req, socket, head) => {
    const m = /^\/room\/([^/?#]+)/.exec(req.url || '')
    const code = m && normalizeRoomCode(decodeURIComponent(m[1]))
    if (!code) { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return }
    const e = getRoom(code)
    if (!e) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = { send: (s) => { if (ws.readyState === 1) ws.send(s) }, close: (c, r) => ws.close(c, r) }
      ws.isAlive = true
      ws.on('pong', () => { ws.isAlive = true })
      e.room.onConnect(conn)
      startTick(e)
      ws.on('message', (data, isBinary) => e.room.onMessage(conn, isBinary ? data : data.toString('utf8')))
      const gone = () => { e.room.onDisconnect(conn); maybeStop(code, e) }
      ws.on('close', gone)
      ws.on('error', () => {})
    })
  })

  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue }
      ws.isAlive = false
      ws.ping()
    }
  }, 20000)
  beat.unref?.()

  return {
    rooms,
    listen: () => new Promise((resolve) => server.listen(port, () => { log(`NEXUS STRIKE server on ws://localhost:${server.address().port}/room/<code>`); resolve(server.address().port) })),
    close: () => new Promise((resolve) => {
      clearInterval(beat)
      for (const e of rooms.values()) { clearInterval(e.timer); clearTimeout(e.cleanup) }
      for (const ws of wss.clients) ws.terminate()
      server.close(() => resolve())
    }),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createGameServer().listen()
}
EOF
w server/worker.js <<'EOF'
// Cloudflare Worker + Durable Object. One DO per room code. Tick runs only while players are connected.
// Run locally with:  npx wrangler dev -c server/wrangler.toml   (UNTESTED in this environment, see notes)
import { GameRoom } from './GameRoom.js'
import { makeSanitizer } from './names-adapter.js'
import { RATES, normalizeRoomCode } from '../shared/protocol.js'

export class RoomDO {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.room = null
    this.timer = null
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const code = normalizeRoomCode(request.headers.get('x-room-code') || '')
    if (!code) return new Response('bad room', { status: 400 })
    if (!this.room) this.room = new GameRoom({ code, sanitizeName: makeSanitizer() })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()
    const conn = {
      send: (s) => { try { server.send(s) } catch { /* closed */ } },
      close: (c, r) => { try { server.close(c, r) } catch { /* closed */ } },
    }
    this.room.onConnect(conn)
    this._ensureTick()
    server.addEventListener('message', (ev) => this.room.onMessage(conn, ev.data))
    let gone = false
    const onGone = () => {
      if (gone) return
      gone = true
      this.room.onDisconnect(conn)
      if (this.room.connectedCount() === 0 && this.timer) { clearInterval(this.timer); this.timer = null }
    }
    server.addEventListener('close', onGone)
    server.addEventListener('error', onGone)
    return new Response(null, { status: 101, webSocket: client })
  }

  _ensureTick() {
    if (!this.timer) this.timer = setInterval(() => this.room.onTick(Date.now()), 1000 / RATES.TICK_HZ)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') return new Response('ok')
    const m = /^\/room\/([^/]+)$/.exec(url.pathname)
    const code = m && normalizeRoomCode(decodeURIComponent(m[1]))
    if (!code) return new Response('not found', { status: 404 })
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
    const headers = new Headers(request.headers)
    headers.set('x-room-code', code)
    return stub.fetch(new Request(request, { headers }))
  },
}
EOF
w server/wrangler.toml <<'EOF'
# Kept in server/ so it never clashes with a Cloudflare Pages config at the project root.
# Local:   npx wrangler dev -c server/wrangler.toml      (default http://localhost:8787, ws://localhost:8787/room/<code>)
# Deploy:  npx wrangler deploy -c server/wrangler.toml
name = "nexus-strike-rooms"
main = "worker.js"
compatibility_date = "2025-06-01"

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "RoomDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RoomDO"]
EOF
w app/pvp/net/Transport.js <<'EOF'
// Transport interface used by NetClient. Implementations: WebSocketTransport now, LocalTransport in step 4.
// Events: 'open' (), 'message' (decoded server message), 'close' ({code, reason}), 'error' ({reason})
export class Transport {
  constructor() {
    this._h = { open: [], message: [], close: [], error: [] }
  }

  on(evt, fn) {
    if (!this._h[evt]) throw new Error(`Transport: unknown event ${evt}`)
    this._h[evt].push(fn)
    return () => { this._h[evt] = this._h[evt].filter((f) => f !== fn) }
  }

  _emit(evt, arg) {
    for (const fn of [...this._h[evt]]) fn(arg)
  }

  connect() { throw new Error('Transport.connect not implemented') }
  send(_msg) { throw new Error('Transport.send not implemented') } // returns true if sent
  close(_code, _reason) { throw new Error('Transport.close not implemented') }
  get isOpen() { return false }
}
EOF
w app/pvp/net/WebSocketTransport.js <<'EOF'
import { Transport } from './Transport.js'
import { decodeServer, encode } from '../../../shared/protocol.js'

// base: value of NUXT_PUBLIC_WS_URL (e.g. "wss://x.workers.dev" or "ws://localhost:8787/room/"), may be empty.
// Result: <base>/room/<code>. Default: ws://<page hostname>:8787/room/<code>.
export function resolveWsUrl(code, { base = '', hostname = 'localhost' } = {}) {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!b) b = `ws://${hostname || 'localhost'}:8787`
  b = b.replace(/\/room$/, '')
  return `${b}/room/${encodeURIComponent(code)}`
}

export class WebSocketTransport extends Transport {
  constructor({ url, WebSocketImpl = globalThis.WebSocket } = {}) {
    super()
    this.url = url
    this.WS = WebSocketImpl
    this.ws = null
    this.badFrames = 0
  }

  connect() {
    const ws = new this.WS(this.url)
    this.ws = ws
    ws.onopen = () => { if (this.ws === ws) this._emit('open') }
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return
      const d = decodeServer(ev.data)
      if (d.ok) this._emit('message', d.msg)
      else { this.badFrames++; this._emit('error', { reason: d.reason }) }
    }
    ws.onerror = () => { if (this.ws === ws) this._emit('error', { reason: 'socket' }) }
    ws.onclose = (ev) => { if (this.ws === ws) { this.ws = null; this._emit('close', { code: ev.code, reason: ev.reason }) } }
  }

  get isOpen() { return !!this.ws && this.ws.readyState === 1 }

  send(msg) {
    if (!this.isOpen) return false
    this.ws.send(encode(msg))
    return true
  }

  close(code = 1000, reason = 'bye') {
    const ws = this.ws
    if (!ws) return
    this.ws = null
    try { ws.close(code, reason) } catch { /* already closed */ }
    this._emit('close', { code, reason })
  }
}
EOF
w app/pvp/net/NetClient.js <<'EOF'
// Multiplayer session: hello/welcome, input at 30 Hz, roster, snapshot buffer + interpolation,
// ping, 60 s reconnect with token, public shard hop when full. No rendering here.
import {
  T, PROTOCOL_VERSION, RATES, LIMITS, seedFromRoom, round,
} from '../../../shared/protocol.js'

export const INTERP_DELAY_MS = 100
const STORE_KEY = 'nexus.pvp.net.v1' // sessionStorage: per tab, so several tabs are several players

const defaultClock = () => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setInterval: (f, ms) => setInterval(f, ms),
  clearInterval: (h) => clearInterval(h),
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (h) => clearTimeout(h),
})

function lerpAngle(a, b, k) {
  const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
  return a + d * k
}

export class NetClient {
  // opts: { room, name, transportFactory(room)->Transport, getInput()->{p:[x,y,z],y,a,w}|null, storage?, clock? }
  constructor(opts) {
    this.room = opts.room
    this.name = opts.name
    this.factory = opts.transportFactory
    this.getInput = opts.getInput || (() => null)
    this.storage = opts.storage === undefined ? NetClient._defaultStorage() : opts.storage
    this.clock = opts.clock || defaultClock()
    this.status = 'idle' // idle|connecting|playing|reconnecting|full|error|closed
    this.selfId = 0
    this.slot = 0
    this.seed = 0
    this.ackSeq = -1
    this.rtt = 0
    this.roster = new Map() // id -> {id, name, slot}
    this._remote = new Map() // id -> samples[]
    this._seq = 0
    this._t = null
    this._h = {}
    this._timers = { input: null, ping: null, retry: null }
    this._attempts = 0
    this._firstDropAt = null
    this._hop = false
    this._token = null
  }

  static _defaultStorage() {
    try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null }
  }

  on(evt, fn) { (this._h[evt] ||= []).push(fn); return () => { this._h[evt] = this._h[evt].filter((f) => f !== fn) } }
  _emit(evt, arg) { for (const fn of [...(this._h[evt] || [])]) fn(arg) }
  _setStatus(s) { if (this.status !== s) { this.status = s; this._emit('status', s) } }

  connect() {
    this._loadToken()
    this._setStatus(this._attempts > 0 ? 'reconnecting' : 'connecting')
    this._open()
  }

  close() {
    this._setStatus('closed')
    this._stopTimers()
    this._clearToken()
    const t = this._t
    this._t = null
    if (t) t.close(1000, 'bye')
  }

  _open() {
    const t = this.factory(this.room)
    this._t = t
    this._hop = false
    t.on('open', () => {
      if (this._t !== t) return
      const hello = { t: T.HELLO, v: PROTOCOL_VERSION, n: this.name }
      if (this._token) hello.k = this._token
      t.send(hello)
    })
    t.on('message', (m) => { if (this._t === t) this._onMessage(m) })
    t.on('error', (e) => { if (this._t === t) this._emit('warn', e) })
    t.on('close', (e) => { if (this._t === t) this._onClose(e) })
    t.connect()
  }

  _onMessage(m) {
    const now = this.clock.now()
    switch (m.t) {
      case T.WELCOME: {
        this.selfId = m.id
        this.slot = m.si
        this.seed = m.sd
        this.room = m.r
        this._token = m.k
        this._saveToken()
        this.roster.clear()
        this._remote.clear()
        for (const [id, name, slot] of m.pl) this.roster.set(id, { id, name, slot })
        this._attempts = 0
        this._firstDropAt = null
        this._setStatus('playing')
        this._startTimers()
        if (seedFromRoom(m.r) !== m.sd) this._emit('seedmismatch', { expected: seedFromRoom(m.r), got: m.sd })
        this._emit('welcome', { id: m.id, seed: m.sd, slot: m.si, room: m.r, hz: m.hz })
        this._emit('roster', this.roster)
        break
      }
      case T.SNAPSHOT:
        for (const r of m.p) {
          const [id, x, y, z, yaw, pitch, w, q] = r
          if (id === this.selfId) { this.ackSeq = q; continue }
          if (!this.roster.has(id)) continue
          let buf = this._remote.get(id)
          if (!buf) this._remote.set(id, (buf = []))
          buf.push({ t: now, x, y, z, yaw, pitch, w })
          if (buf.length > 24) buf.shift()
        }
        break
      case T.JOIN:
        this.roster.set(m.id, { id: m.id, name: m.n, slot: m.si })
        this._emit('roster', this.roster)
        break
      case T.LEAVE:
        this.roster.delete(m.id)
        this._remote.delete(m.id)
        this._emit('roster', this.roster)
        break
      case T.FULL: {
        const next = m.x
        this._hop = true
        if (next) {
          this._emit('shard', { from: m.r, to: next })
          this.room = next
          this._token = null
          this._stopTimers()
          const old = this._t
          this._t = null
          if (old) old.close(1000, 'shard')
          this._open()
        } else {
          this._setStatus('full')
          this._emit('full', { room: m.r })
        }
        break
      }
      case T.PONG:
        this.rtt = this.rtt ? this.rtt * 0.8 + (now - m.c) * 0.2 : now - m.c
        break
      case T.ERROR:
        this._emit('server-error', { code: m.c })
        if (m.c === 'version') this._setStatus('error')
        break
    }
  }

  _onClose(e) {
    this._stopTimers()
    if (this._hop || ['closed', 'full', 'error'].includes(this.status)) return
    const now = this.clock.now()
    if (this._firstDropAt === null) this._firstDropAt = now
    if (now - this._firstDropAt > LIMITS.RECONNECT_MS) {
      this._clearToken()
      this._setStatus('closed')
      this._emit('lost', e)
      return
    }
    this._attempts++
    this._setStatus('reconnecting')
    const delay = Math.min(4000, 500 * 2 ** (this._attempts - 1))
    this._timers.retry = this.clock.setTimeout(() => { this._timers.retry = null; this._open() }, delay)
  }

  _startTimers() {
    this._stopTimers()
    this._timers.input = this.clock.setInterval(() => this._sendInput(), 1000 / RATES.INPUT_HZ)
    this._timers.ping = this.clock.setInterval(() => this._t?.send({ t: T.PING, c: this.clock.now() }), 2000)
  }

  _stopTimers() {
    for (const k of ['input', 'ping']) if (this._timers[k] !== null) { this.clock.clearInterval(this._timers[k]); this._timers[k] = null }
    if (this._timers.retry !== null) { this.clock.clearTimeout(this._timers.retry); this._timers.retry = null }
  }

  _sendInput() {
    if (this.status !== 'playing' || !this._t) return
    const s = this.getInput()
    if (!s || !s.p || ![...s.p, s.y, s.a, s.w].every(Number.isFinite)) return
    this._t.send({
      t: T.INPUT, s: ++this._seq,
      p: [round(s.p[0], 3), round(s.p[1], 3), round(s.p[2], 3)],
      y: round(s.y, 4), a: round(s.a, 4), w: s.w | 0,
    })
  }

  // Remote players at (renderNow - INTERP_DELAY_MS). Basic: lerp between the two bracketing snapshots, no extrapolation.
  sample(renderNow = this.clock.now()) {
    const t = renderNow - INTERP_DELAY_MS
    const out = []
    for (const [id, buf] of this._remote) {
      const info = this.roster.get(id)
      if (!info || buf.length === 0) continue
      let i = -1
      for (let j = 0; j < buf.length && buf[j].t <= t; j++) i = j
      const a = buf[Math.max(i, 0)]
      const b = i < 0 ? a : buf[Math.min(i + 1, buf.length - 1)]
      const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0
      out.push({
        id, name: info.name, slot: info.slot,
        x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k,
        yaw: lerpAngle(a.yaw, b.yaw, k), pitch: a.pitch + (b.pitch - a.pitch) * k, w: k >= 0.5 ? b.w : a.w,
      })
    }
    return out
  }

  // for the Tab scoreboard (kills/deaths arrive in step 5)
  scoreboard() {
    return [...this.roster.values()].map((p) => ({ id: p.id, name: p.name, self: p.id === this.selfId }))
  }

  _loadToken() {
    try {
      const raw = this.storage?.getItem(STORE_KEY)
      const o = raw ? JSON.parse(raw) : null
      this._token = o && o.room === this.room && typeof o.token === 'string' ? o.token : null
    } catch { this._token = null }
  }

  _saveToken() {
    try { this.storage?.setItem(STORE_KEY, JSON.stringify({ room: this.room, token: this._token })) } catch { /* private mode */ }
  }

  _clearToken() {
    this._token = null
    try { this.storage?.removeItem(STORE_KEY) } catch { /* ignore */ }
  }
}
EOF
w tools/net_smoke.mjs <<'EOF'
// Real-socket smoke test: 3 bots join one room, walk, and must see each other (same seed).
//   node tools/net_smoke.mjs --spawn            starts the Node server in-process on a random port
//   node tools/net_smoke.mjs ws://localhost:8787  uses a server you already started (node server/node.mjs)
// Needs Node 22+ (global WebSocket) and, for --spawn, the "ws" package.
const arg = process.argv[2]
let base = arg && !arg.startsWith('--') ? arg : 'ws://localhost:8787'
let stop = async () => {}
if (arg === '--spawn') {
  const { createGameServer } = await import('../server/node.mjs')
  const srv = createGameServer({ port: 0, log: () => {} })
  const port = await srv.listen()
  base = `ws://localhost:${port}`
  stop = () => srv.close()
}
const room = 'smoke' + Math.floor(Math.random() * 1e6)
const fails = []
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

function bot(name, x) {
  const b = { name, x, id: 0, seed: 0, seen: new Map(), roster: [], msgs: 0, closed: false }
  b.ws = new WebSocket(`${base.replace(/\/room.*/, '')}/room/${room}`)
  b.ws.onopen = () => b.ws.send(JSON.stringify({ t: 'h', v: 1, n: name }))
  b.ws.onmessage = (ev) => {
    b.msgs++
    const m = JSON.parse(ev.data)
    if (m.t === 'w') { b.id = m.id; b.seed = m.sd; b.roster = m.pl.map((p) => p[1]) }
    if (m.t === 'j') b.roster.push(m.n)
    if (m.t === 's') for (const r of m.p) if (r[0] !== b.id) b.seen.set(r[0], r[1])
  }
  b.ws.onclose = () => { b.closed = true }
  let seq = 0
  b.timer = setInterval(() => { if (b.ws.readyState === 1 && b.id) { b.x += 0.3; b.ws.send(JSON.stringify({ t: 'i', s: ++seq, p: [b.x, 1, 0], y: 0, a: 0, w: 0 })) } }, 33)
  return b
}

const bots = [bot('ALPHA', 0), bot('BETA', 10), bot('GAMMA', 20)]
await new Promise((r) => setTimeout(r, 1500))
check(bots.every((b) => b.id > 0), 'all 3 bots got a welcome')
check(new Set(bots.map((b) => b.seed)).size === 1, `same seed for everyone (${bots[0].seed})`)
check(bots.every((b) => b.seen.size === 2), 'each bot receives snapshots with the 2 other players')
check(bots.every((b) => b.roster.length === 3), `each bot knows 3 names: ${bots.map((b) => b.roster.join('/')).join(' | ')}`)
const b0x = bots[1].seen.get(bots[0].id)
check(b0x > 0, `BETA sees ALPHA moving (x=${b0x})`)
const dup = bot('ALPHA', 0)
await new Promise((r) => setTimeout(r, 400))
check(dup.roster.includes('ALPHA2') || dup.roster.some((n) => n !== 'ALPHA' && n.startsWith('ALPHA')), `duplicate name was renamed (${dup.roster.join('/')})`)
bots.push(dup)
for (const b of bots) { clearInterval(b.timer); b.ws.close() }
await new Promise((r) => setTimeout(r, 200))
await stop()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nSMOKE OK')
process.exit(fails.length ? 1 : 0)
EOF
w tests/shared/protocol.test.js <<'EOF'
import { describe, it, expect } from 'vitest'
import {
  PROTOCOL_VERSION, T, LIMITS, RATES, decodeClient, decodeServer, encode, decode,
  normalizeRoomCode, nextShard, seedFromRoom, makeToken, makeRoomCode, isPublicRoom,
} from '../../shared/protocol.js'

const input = (o = {}) => encode({ t: 'i', s: 1, p: [1, 2, 3], y: 0.5, a: 0.1, w: 1, ...o })
const hello = (o = {}) => encode({ t: 'h', v: PROTOCOL_VERSION, n: 'Neo', ...o })

describe('constants', () => {
  it('has the agreed rates and limits', () => {
    expect(RATES).toEqual({ INPUT_HZ: 30, SNAPSHOT_HZ: 20, TICK_HZ: 30 })
    expect(LIMITS.MAX_PLAYERS).toBe(8)
    expect(LIMITS.MAX_MSG_BYTES).toBe(1024)
    expect(LIMITS.MAX_MSG_PER_SEC).toBe(120)
    expect(LIMITS.RECONNECT_MS).toBe(60000)
  })
})

describe('client message validation', () => {
  it('accepts well-formed hello / input / ping', () => {
    expect(decodeClient(hello()).ok).toBe(true)
    expect(decodeClient(hello({ k: 'a'.repeat(36) })).ok).toBe(true)
    expect(decodeClient(input()).ok).toBe(true)
    expect(decodeClient(encode({ t: 'p', c: 12.5 })).ok).toBe(true)
  })

  it('rejects garbage', () => {
    const bad = [
      'not json', '', '[]', 'null', '42', '"x"', '{}', '{"t":"zzz"}', '{"t":5}',
      '{"__proto__":{"t":"h"}}', '{"t":"constructor"}', '{"t":"toString"}',
      input({ extra: 1 }), input({ s: -1 }), input({ s: 1.5 }), input({ s: 2 ** 40 }),
      input({ p: [1, 2] }), input({ p: [1, 2, 3, 4] }), input({ p: ['1', 2, 3] }), input({ p: null }),
      input({ p: [9999, 0, 0] }), input({ p: [0, 9999, 0] }), input({ p: [0, 0, -9999] }),
      input({ y: 'x' }), input({ y: 1e9 }), input({ a: 99 }), input({ w: 16 }), input({ w: -1 }), input({ w: 1.2 }),
      hello({ v: 'x' }), hello({ n: 5 }), hello({ n: 'x'.repeat(65) }), hello({ k: 'short' }), hello({ k: 'a b'.repeat(10) }), hello({ zzz: 1 }),
      encode({ t: 'p' }), encode({ t: 'p', c: 'x' }),
    ]
    for (const raw of bad) expect(decodeClient(raw).ok, raw).toBe(false)
  })

  it('rejects NaN / Infinity (JSON turns them into null, and raw tokens are not JSON)', () => {
    expect(decodeClient(input({ p: [NaN, 0, 0] })).ok).toBe(false)
    expect(decodeClient(input({ y: Infinity })).ok).toBe(false)
    expect(decodeClient('{"t":"i","s":1,"p":[NaN,0,0],"y":0,"a":0,"w":0}').ok).toBe(false)
  })

  it('rejects oversize and binary frames', () => {
    expect(decodeClient(hello({ n: 'x'.repeat(60) }) + ' '.repeat(1100)).reason).toBe('too big')
    expect(decode('é'.repeat(600)).reason).toBe('too big') // 1200 bytes in utf8, 600 chars
    expect(decodeClient(new ArrayBuffer(4)).reason).toBe('binary')
    expect(decodeClient(new Uint8Array(4)).ok).toBe(false)
  })
})

describe('server message validation', () => {
  const welcome = { t: 'w', v: 1, id: 1, k: 'a'.repeat(36), r: 'abcd', sd: 5, si: 0, hz: [30, 20, 30], ts: 1, pl: [[1, 'Neo', 0]] }
  it('accepts valid server messages', () => {
    expect(decodeServer(encode(welcome)).ok).toBe(true)
    expect(decodeServer(encode({ t: 's', n: 1, ts: 2, p: [[1, 0, 0, 0, 0, 0, 0, 3]] })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'j', id: 2, n: 'B', si: 1 })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'l', id: 2 })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'f', r: 'public-1', x: 'public-2' })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'f', r: 'abcd', x: null })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'e', c: 'bad' })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'o', c: 1, ts: 2 })).ok).toBe(true)
  })
  it('rejects malformed server messages', () => {
    for (const m of [
      { ...welcome, pl: 'x' }, { ...welcome, si: 99 }, { ...welcome, extra: 1 }, { ...welcome, r: 'BAD ROOM' },
      { t: 's', n: 1, ts: 2, p: [[1, 0, 0]] }, { t: 's', n: 1, ts: 2, p: [[0, 0, 0, 0, 0, 0, 0, 0]] },
      { t: 'f', r: 'abcd' }, { t: 'f', r: 'abcd', x: 5 }, { t: 'zzz' },
    ]) expect(decodeServer(encode(m)).ok, JSON.stringify(m)).toBe(false)
  })
})

describe('rooms, seeds, tokens', () => {
  it('normalizes room codes', () => {
    expect(normalizeRoomCode(' ABCD ')).toBe('abcd')
    expect(normalizeRoomCode('public-1')).toBe('public-1')
    for (const x of ['', 'a b', '-abc', 'a'.repeat(25), 5, null, undefined, '../x', 'a/b']) expect(normalizeRoomCode(x)).toBe(null)
  })
  it('shards', () => {
    expect(nextShard('public-1')).toBe('public-2')
    expect(nextShard('public-9')).toBe('public-10')
    expect(nextShard('public-99')).toBe(null)
    expect(nextShard('abcd')).toBe(null)
    expect(isPublicRoom('public-3')).toBe(true)
    expect(isPublicRoom('abcd')).toBe(false)
  })
  it('seedFromRoom is deterministic and in range', () => {
    expect(seedFromRoom('abcd')).toBe(seedFromRoom('abcd'))
    expect(seedFromRoom('abcd')).not.toBe(seedFromRoom('abce'))
    for (const c of ['a', 'public-1', 'zzzzzz']) { const s = seedFromRoom(c); expect(s >= 1 && s <= 999999).toBe(true) }
  })
  it('makeToken / makeRoomCode', () => {
    expect(makeToken()).toMatch(/^[0-9a-f]{36}$/)
    expect(makeToken()).not.toBe(makeToken())
    expect(() => makeToken({})).toThrow()
    expect(normalizeRoomCode(makeRoomCode())).toBeTruthy()
  })
  it('T has no duplicate wire codes', () => {
    const v = Object.values(T)
    expect(new Set(v).size).toBe(v.length)
  })
})
EOF
w tests/server/GameRoom.test.js <<'EOF'
import { describe, it, expect } from 'vitest'
import { GameRoom } from '../../server/GameRoom.js'
import { PROTOCOL_VERSION, LIMITS, encode, decodeServer } from '../../shared/protocol.js'

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
EOF
w tests/server/names-adapter.test.js <<'EOF'
import { describe, it, expect } from 'vitest'
import { makeSanitizer } from '../../server/names-adapter.js'

// If this file fails, the signatures of cleanName/dedupeName in shared/names.js differ from the adapter's assumption.
describe('names-adapter (against the real shared/names.js)', () => {
  const sanitize = makeSanitizer()
  it('returns a non-empty string for odd input', () => {
    for (const raw of ['Neo', '', '   ', '<script>', 'x'.repeat(64), 'ÄÖÜ', 'نام']) {
      const n = sanitize(raw, [])
      expect(typeof n).toBe('string')
      expect(n.length).toBeGreaterThan(0)
    }
  })
  it('never returns a taken name', () => {
    const taken = []
    for (let i = 0; i < 6; i++) { const n = sanitize('Neo', taken); expect(taken.map((t) => t.toLowerCase())).not.toContain(n.toLowerCase()); taken.push(n) }
  })
})
EOF
w tests/pvp/net/NetClient.test.js <<'EOF'
import { describe, it, expect } from 'vitest'
import { GameRoom } from '../../../server/GameRoom.js'
import { Transport } from '../../../app/pvp/net/Transport.js'
import { NetClient, INTERP_DELAY_MS } from '../../../app/pvp/net/NetClient.js'
import { WebSocketTransport, resolveWsUrl } from '../../../app/pvp/net/WebSocketTransport.js'
import { decodeClient, encode } from '../../../shared/protocol.js'

const sanitizeName = (raw, taken) => { let n = (raw || 'PLAYER').toUpperCase(); let o = n; let i = 2; while (taken.includes(o)) o = n + i++; return o }

// manual clock shared by client and server side
function mkWorld() {
  const w = { t: 1000, timers: [], rooms: new Map(), transports: [] }
  w.clock = {
    now: () => w.t,
    setInterval: (f, ms) => { const h = { f, ms, next: w.t + ms, type: 'i' }; w.timers.push(h); return h },
    clearInterval: (h) => { w.timers = w.timers.filter((x) => x !== h) },
    setTimeout: (f, ms) => { const h = { f, ms, next: w.t + ms, type: 't' }; w.timers.push(h); return h },
    clearTimeout: (h) => { w.timers = w.timers.filter((x) => x !== h) },
  }
  w.advance = (ms) => {
    const end = w.t + ms
    for (;;) {
      const due = w.timers.filter((h) => h.next <= end).sort((a, b) => a.next - b.next)[0]
      if (!due) break
      w.t = due.next
      if (due.type === 'i') due.next += due.ms; else w.timers = w.timers.filter((x) => x !== due)
      due.f()
    }
    w.t = end
  }
  w.room = (code, extra) => {
    if (!w.rooms.has(code)) {
      const r = new GameRoom({ code, sanitizeName, now: () => w.t, makeToken: () => 'T'.repeat(8) + String(w.rooms.size) + String(Math.random()).slice(2, 12), ...extra })
      w.rooms.set(code, r)
      w.clock.setInterval(() => r.onTick(w.t), 1000 / 30)
    }
    return w.rooms.get(code)
  }
  w.factory = (code) => {
    const room = w.room(code)
    const t = new LoopTransport(room)
    w.transports.push(t)
    return t
  }
  return w
}

// in-memory Transport wired straight to a GameRoom (what LocalTransport will become in step 4)
class LoopTransport extends Transport {
  constructor(room) { super(); this.room = room; this.open = false; this.sent = []; this.conn = null }
  connect() {
    this.conn = {
      send: (s) => { const d = JSON.parse(s); this._emit('message', d) },
      close: (code, reason) => { this.open = false; this._emit('close', { code, reason }) },
    }
    this.open = true
    this.room.onConnect(this.conn)
    this._emit('open')
  }
  get isOpen() { return this.open }
  send(msg) { this.sent.push(msg); if (!this.open) return false; this.room.onMessage(this.conn, encode(msg)); return true }
  close() { if (!this.open) return; this.open = false; this.room.onDisconnect(this.conn); this._emit('close', { code: 1000, reason: 'bye' }) }
  drop() { this.open = false; this.room.onDisconnect(this.conn); this._emit('close', { code: 1006, reason: '' }) }
}

const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v) }, removeItem: (k) => { delete m[k] } } }

function mkClient(w, name, room = 'abcd', pos = { x: 0 }) {
  const c = new NetClient({ room, name, transportFactory: w.factory, clock: w.clock, storage: mem(), getInput: () => ({ p: [pos.x, 1, 2], y: 0.5, a: 0.1, w: 1 }) })
  c.pos = pos
  return c
}

describe('NetClient session', () => {
  it('joins, sees others, same seed everywhere', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); const b = mkClient(w, 'Bob'); const c = mkClient(w, 'Cy')
    for (const x of [a, b, c]) x.connect()
    expect(a.status).toBe('playing')
    expect(new Set([a.seed, b.seed, c.seed]).size).toBe(1)
    expect(a.roster.size).toBe(3)
    expect(c.roster.size).toBe(3)
    expect([...a.roster.values()].map((p) => p.name)).toEqual(['ANN', 'BOB', 'CY'])
    expect(a.scoreboard().filter((p) => p.self).length).toBe(1)
  })

  it('sends input at ~30 Hz and gets snapshots back; remote positions interpolate', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); const b = mkClient(w, 'Bob')
    a.connect(); b.connect()
    const ta = w.transports[0]
    w.advance(1000)
    const inputs = ta.sent.filter((m) => m.t === 'i')
    expect(inputs.length).toBeGreaterThanOrEqual(29); expect(inputs.length).toBeLessThanOrEqual(31)
    expect(inputs.every((m) => decodeClient(JSON.stringify(m)).ok)).toBe(true)
    expect(inputs.map((m) => m.s)).toEqual(inputs.map((_, i) => i + 1))
    // Bob walks along x for 2 s
    for (let i = 0; i < 40; i++) { b.pos.x += 0.5; w.advance(50) }
    const s = a.sample()
    expect(s.length).toBe(1)
    expect(s[0].name).toBe('BOB')
    expect(s[0].x).toBeGreaterThan(5); expect(s[0].x).toBeLessThan(b.pos.x) // lags behind the newest value
    expect(b.ackSeq).toBeGreaterThan(0)
  })

  it('sample() lerps between bracketing snapshots without extrapolating', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); a.connect()
    a.roster.set(9, { id: 9, name: 'X', slot: 3 })
    a._remote.set(9, [
      { t: 1000, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, w: 0 },
      { t: 1100, x: 10, y: 0, z: 0, yaw: Math.PI * 1.9, pitch: 0, w: 1 },
    ])
    expect(a.sample(1000 + INTERP_DELAY_MS + 50)[0].x).toBeCloseTo(5, 5)
    expect(a.sample(1000 + INTERP_DELAY_MS + 50)[0].yaw).toBeCloseTo(-Math.PI * 0.05, 5) // shortest way around
    expect(a.sample(5000)[0].x).toBe(10) // clamped to the newest
    expect(a.sample(0)[0].x).toBe(0) // clamped to the oldest
  })

  it('leave removes the remote player', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); const b = mkClient(w, 'Bob')
    a.connect(); b.connect(); w.advance(200)
    b.close()
    expect(a.roster.size).toBe(1)
    expect(a.sample().length).toBe(0)
  })

  it('reconnects with the token inside 60 s and keeps its id', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); const b = mkClient(w, 'Bob')
    a.connect(); b.connect()
    const id = b.selfId
    w.transports[1].drop()
    expect(b.status).toBe('reconnecting')
    expect(a.roster.size).toBe(1)
    w.advance(600)
    expect(b.status).toBe('playing')
    expect(b.selfId).toBe(id)
    expect(a.roster.size).toBe(2)
  })

  it('gives up after 60 s of failed reconnects', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); a.connect()
    let lost = false; a.on('lost', () => { lost = true })
    const room = w.rooms.get('abcd')
    room.maxPlayers = 0 // every retry is answered "full" -> never resumes... but keep it simple: make factory fail instead
    w.factory = () => { const t = new LoopTransport(room); t.connect = function () { this._emit('close', { code: 1006, reason: '' }) }; return t }
    a.factory = w.factory
    w.transports[0].drop()
    w.advance(90000)
    expect(lost).toBe(true)
    expect(a.status).toBe('closed')
  })

  it('hops to the next public shard when full, and stops on a full private room', () => {
    const w = mkWorld()
    const first = []
    for (let i = 0; i < 8; i++) { const c = mkClient(w, 'p' + i, 'public-1'); c.connect(); first.push(c) }
    const late = mkClient(w, 'late', 'public-1')
    const hops = []; late.on('shard', (h) => hops.push(h))
    late.connect()
    expect(hops).toEqual([{ from: 'public-1', to: 'public-2' }])
    expect(late.room).toBe('public-2')
    expect(late.status).toBe('playing')
    // private
    for (let i = 0; i < 8; i++) mkClient(w, 'q' + i, 'abcd').connect()
    const l2 = mkClient(w, 'late', 'abcd'); let full = null; l2.on('full', (e) => { full = e }); l2.connect()
    expect(l2.status).toBe('full'); expect(full).toEqual({ room: 'abcd' })
  })

  it('does not send NaN input', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); a.connect()
    a.pos.x = NaN
    w.advance(200)
    expect(w.transports[0].sent.filter((m) => m.t === 'i').length).toBe(0)
  })

  it('close() stops timers and forgets the token', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); a.connect(); a.close()
    expect(a.status).toBe('closed')
    const n = w.transports[0].sent.length
    w.advance(500)
    expect(w.transports[0].sent.length).toBe(n)
    expect(a.storage.getItem('nexus.pvp.net.v1')).toBe(null)
  })

  it('measures rtt from pongs', () => {
    const w = mkWorld()
    const a = mkClient(w, 'Ann'); a.connect(); w.advance(2100)
    expect(a.rtt).toBe(0) // loopback has no delay
    a._onMessage({ t: 'o', c: w.t - 40, ts: 1 })
    expect(a.rtt).toBeCloseTo(40, 5)
  })
})

describe('WebSocketTransport', () => {
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.last = this }
    send(s) { this.sent.push(s) }
    close() { this.readyState = 3 }
  }
  it('builds URLs', () => {
    expect(resolveWsUrl('abcd')).toBe('ws://localhost:8787/room/abcd')
    expect(resolveWsUrl('abcd', { hostname: '192.168.1.5' })).toBe('ws://192.168.1.5:8787/room/abcd')
    expect(resolveWsUrl('abcd', { base: 'wss://x.workers.dev/' })).toBe('wss://x.workers.dev/room/abcd')
    expect(resolveWsUrl('abcd', { base: 'ws://localhost:8787/room/' })).toBe('ws://localhost:8787/room/abcd')
    expect(resolveWsUrl('a b/c')).toBe('ws://localhost:8787/room/a%20b%2Fc')
  })
  it('decodes valid frames, flags garbage, and only sends when open', () => {
    const t = new WebSocketTransport({ url: 'ws://x', WebSocketImpl: FakeWS })
    const got = []; const errs = []
    t.on('message', (m) => got.push(m)); t.on('error', (e) => errs.push(e))
    t.connect(); const ws = FakeWS.last
    expect(t.send({ t: 'p', c: 1 })).toBe(false)
    ws.readyState = 1; ws.onopen()
    expect(t.send({ t: 'p', c: 1 })).toBe(true)
    expect(ws.sent).toEqual(['{"t":"p","c":1}'])
    ws.onmessage({ data: encode({ t: 'l', id: 3 }) })
    ws.onmessage({ data: 'garbage' })
    ws.onmessage({ data: encode({ t: 'l', id: -1 }) })
    expect(got).toEqual([{ t: 'l', id: 3 }])
    expect(errs.length).toBe(2)
  })
})
EOF

echo "== phase 3: package.json scripts"
if [ -f package.json ]; then
  cp -p package.json package.json.phase3.bak
  node -e '
    const fs = require("fs");
    const raw = fs.readFileSync("package.json", "utf8");
    const pkg = JSON.parse(raw);
    if (!pkg.scripts || typeof pkg.scripts !== "object") { console.log("PATCH FAILED: package.json has no scripts object (nothing changed)"); process.exit(0); }
    const add = { "pvp:server": "node server/node.mjs", "pvp:smoke": "node tools/net_smoke.mjs ws://localhost:8787" };
    let n = 0;
    for (const [k, v] of Object.entries(add)) if (!(k in pkg.scripts)) { pkg.scripts[k] = v; n++; }
    if (!n) { console.log("  package.json already has the scripts"); process.exit(0); }
    const m = /^([ \t]+)"/m.exec(raw);
    fs.writeFileSync("package.json", JSON.stringify(pkg, null, m ? m[1] : 2) + (raw.endsWith("\n") ? "\n" : ""));
    console.log("  added " + n + " script(s) to package.json (backup: package.json.phase3.bak)");
  '
else
  echo "  no package.json here, skipped"
fi

echo "== phase 3: syntax check (every file copied to .mjs so ESM errors show)"
TMP="$(mktemp -d)"
bad=0
for f in shared/protocol.js server/GameRoom.js server/names-adapter.js server/node.mjs server/worker.js \
         app/pvp/net/Transport.js app/pvp/net/WebSocketTransport.js app/pvp/net/NetClient.js tools/net_smoke.mjs \
         tests/shared/protocol.test.js tests/server/GameRoom.test.js tests/server/names-adapter.test.js tests/pvp/net/NetClient.test.js; do
  cp "$f" "$TMP/chk.mjs"
  if node --check "$TMP/chk.mjs" 2>"$TMP/err"; then echo "  ok      $f"; else echo "  SYNTAX ERROR in $f"; cat "$TMP/err"; bad=1; fi
done
rm -rf "$TMP"
[ "$bad" = 0 ] || { echo "FAILED: syntax errors above"; exit 1; }

echo "== phase 3: preflight notes"
echo "  node: $(node -v)  (smoke script needs 22+ for the global WebSocket)"
grep -q '"type": *"module"' package.json 2>/dev/null && echo '  package.json type=module: ok' || echo '  WARNING: package.json has no "type": "module". Node 22.7+ still runs server/node.mjs (it auto-detects ESM, with a warning).'
[ -d node_modules/ws ] && echo "  ws: installed" || echo "  ws MISSING: run   npm i -D ws   (only the Node server needs it)"
echo "  shared/names.js exports (adapter assumes cleanName(raw) and dedupeName(name, takenArray)):"
grep -nE 'export (function|const) (cleanName|validateName|dedupeName)' shared/names.js || echo "    (none found, paste shared/names.js to me)"
ls vitest.config.* 2>/dev/null | sed 's/^/  vitest config: /' || true
echo
echo "DONE. Next: see the test commands."