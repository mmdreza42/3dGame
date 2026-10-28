// NEXUS STRIKE network protocol, version 1.
// ONE module: constants, validators, encode/decode, room-code and token helpers.
// Pure JS, no imports, runs in browser, Node and Cloudflare Workers.

export const PROTOCOL_VERSION = 1

// message types (short on the wire)
export const T = {
  HELLO: 'h', INPUT: 'i', PING: 'p', // client -> server
  WELCOME: 'w', SNAPSHOT: 's', JOIN: 'j', LEAVE: 'l', FULL: 'f', ERROR: 'e', PONG: 'o', // server -> client
  HIT: 'x', // client -> server: I hit player g
  DMG: 'm', SCORES: 'z', RESPAWN: 'r', // server -> client: damage/kill, kills+deaths table, respawn
  MATCH: 'n', // server -> client: a team won, new match in ms
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
  [T.HIT](m) {
    if (!onlyKeys(m, ['t', 'g', 'h', 'w'])) return 'keys'
    if (!isInt(m.g, 1, 2147483647)) return 'g'
    if (!isInt(m.h, 0, 1)) return 'h'
    if (!isInt(m.w, 0, 2)) return 'w'
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
  [T.DMG](m) {
    if (!onlyKeys(m, ['t', 'id', 'by', 'hp', 'h'])) return 'keys'
    if (!isInt(m.id, 1, 2147483647) || !isInt(m.by, 1, 2147483647)) return 'id/by'
    if (!isInt(m.hp, 0, 1000) || !isInt(m.h, 0, 1)) return 'hp/h'
    return null
  },
  [T.SCORES](m) {
    if (!onlyKeys(m, ['t', 'p'])) return 'keys'
    if (!Array.isArray(m.p) || m.p.length > LIMITS.MAX_PLAYERS) return 'p'
    for (const r of m.p) {
      if (!Array.isArray(r) || r.length !== 3 || !isInt(r[0], 1, 2147483647) || !isInt(r[1], 0, 1000000) || !isInt(r[2], 0, 1000000)) return 'row'
    }
    return null
  },
  [T.MATCH](m) {
    if (!onlyKeys(m, ['t', 'w', 'ms'])) return 'keys'
    if (!isInt(m.w, 0, 1) || !isInt(m.ms, 0, 60000)) return 'w/ms'
    return null
  },
  [T.RESPAWN](m) {
    if (!onlyKeys(m, ['t', 'id', 'si'])) return 'keys'
    if (!isInt(m.id, 1, 2147483647) || !isInt(m.si, 0, LIMITS.SPAWN_SLOTS - 1)) return 'id/si'
    return null
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
