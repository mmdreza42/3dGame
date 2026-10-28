#!/usr/bin/env bash
set -e
[ -f server/GameRoom.js ] || { echo "ABORT: run from project root"; exit 1; }
[ -f server/names-adapter.js ] || { echo "ABORT: server/names-adapter.js missing"; exit 1; }
if grep -q "node:" server/names-adapter.js; then echo "ABORT: names-adapter.js imports node: (breaks on Cloudflare), paste it"; exit 1; fi
grep -q "makeSanitizer" server/names-adapter.js || { echo "ABORT: makeSanitizer not found in names-adapter.js, paste it"; exit 1; }

mkdir -p .backup_3c server/routes/room tests
for f in server/roomHub.js "server/routes/room/[code].ts" server/routes/health.get.ts tests/hub.test.js; do
  if [ -e "$f" ]; then mkdir -p ".backup_3c/$(dirname "$f")"; cp "$f" ".backup_3c/$f.bak"; fi
done

cat > server/roomHub.js <<'EOT'
// Runtime-agnostic room hub: rooms Map + per-room tick. Used by the Nitro WebSocket route.
// No Node/Cloudflare/crossws imports. conn = { send(str), close(code, reason) }.
import { GameRoom } from './GameRoom.js'
import { makeSanitizer } from './names-adapter.js'
import { LIMITS, RATES, normalizeRoomCode } from '../shared/protocol.js'

export function roomCodeFromUrl(url) {
  if (typeof url !== 'string') return null
  let path
  try { path = new URL(url, 'http://x').pathname } catch { return null }
  const m = /^\/room\/([^/]+)\/?$/.exec(path)
  if (!m) return null
  let raw
  try { raw = decodeURIComponent(m[1]) } catch { return null }
  return normalizeRoomCode(raw)
}

export function createHub(opts = {}) {
  const {
    sanitizeName = makeSanitizer(),
    maxRooms = 200,
    now = () => Date.now(),
    setTimer = (f, ms) => setInterval(f, ms),
    clearTimer = (t) => clearInterval(t),
    setLater = (f, ms) => setTimeout(f, ms),
    clearLater = (t) => clearTimeout(t),
    log = () => {},
  } = opts
  const rooms = new Map() // code -> { room, timer, cleanup }
  const conns = new Map() // peer id -> { conn, code }

  function getRoom(code) {
    let e = rooms.get(code)
    if (!e) {
      if (rooms.size >= maxRooms) return null
      e = { room: new GameRoom({ code, sanitizeName, now }), timer: null, cleanup: null }
      rooms.set(code, e)
      log(`[room ${code}] created`)
    }
    return e
  }

  function startTick(e) {
    if (!e.timer) e.timer = setTimer(() => e.room.onTick(now()), 1000 / RATES.TICK_HZ)
    if (e.cleanup) { clearLater(e.cleanup); e.cleanup = null }
  }

  function maybeStop(code, e) {
    if (e.room.connectedCount() > 0) return
    if (e.timer) { clearTimer(e.timer); e.timer = null }
    if (!e.cleanup) {
      e.cleanup = setLater(() => {
        e.cleanup = null
        if (e.room.connectedCount() === 0 && rooms.get(code) === e) { rooms.delete(code); log(`[room ${code}] removed`) }
      }, LIMITS.RECONNECT_MS + 5000)
      e.cleanup?.unref?.()
    }
  }

  return {
    rooms,
    conns,
    open(id, url, conn) {
      const code = roomCodeFromUrl(url)
      if (!code) { try { conn.close(1008, 'bad room') } catch { /* closed */ } return false }
      const e = getRoom(code)
      if (!e) { try { conn.close(1013, 'busy') } catch { /* closed */ } return false }
      conns.set(id, { conn, code })
      e.room.onConnect(conn)
      startTick(e)
      return true
    },
    // returns false when the peer is unknown (e.g. the object restarted): caller closes the socket
    message(id, raw) {
      const c = conns.get(id)
      if (!c) return false
      const e = rooms.get(c.code)
      if (!e) return false
      e.room.onMessage(c.conn, raw)
      return true
    },
    close(id) {
      const c = conns.get(id)
      if (!c) return
      conns.delete(id)
      const e = rooms.get(c.code)
      if (!e) return
      e.room.onDisconnect(c.conn)
      maybeStop(c.code, e)
    },
  }
}

let hub = null
export function getHub() {
  if (!hub) hub = createHub()
  return hub
}
EOT

cat > "server/routes/room/[code].ts" <<'EOT'
// Game room WebSocket: /room/<code>. defineWebSocketHandler is auto-imported by Nitro.
import { getHub } from '../../roomHub.js'

export default defineWebSocketHandler({
  open(peer) {
    getHub().open(peer.id, peer.request?.url, {
      send: (s: string) => peer.send(s),
      close: (c?: number, r?: string) => peer.close(c, r),
    })
  },
  message(peer, message) {
    if (!getHub().message(peer.id, message.text())) peer.close(1012, 'restart')
  },
  close(peer) {
    getHub().close(peer.id)
  },
  error(peer) {
    getHub().close(peer.id)
  },
})
EOT

cat > server/routes/health.get.ts <<'EOT'
import { getHub } from '../roomHub.js'

export default defineEventHandler(() => ({ ok: true, rooms: getHub().rooms.size }))
EOT

cat > tests/hub.test.js <<'EOT'
import { describe, it, expect } from 'vitest'
import { createHub, roomCodeFromUrl } from '../server/roomHub.js'
import { seedFromRoom } from '../shared/protocol.js'

function mkHub(extra = {}) {
  const timers = new Map()
  let n = 0
  const hub = createHub({
    sanitizeName: (raw) => String(raw).toUpperCase() || 'P',
    setTimer: (f) => { timers.set(++n, f); return n },
    clearTimer: (t) => { timers.delete(t) },
    setLater: () => ({ unref() {} }),
    clearLater: () => {},
    ...extra,
  })
  return { hub, timers }
}
function mkConn() {
  const c = { sent: [], closed: null, send(s) { c.sent.push(JSON.parse(s)) }, close(code, reason) { c.closed = [code, reason] } }
  return c
}
const hello = (n) => JSON.stringify({ t: 'h', v: 1, n })

describe('roomCodeFromUrl', () => {
  it('parses and normalizes', () => {
    expect(roomCodeFromUrl('ws://h/room/ABCD')).toBe('abcd')
    expect(roomCodeFromUrl('/room/public-1?x=1')).toBe('public-1')
  })
  it('rejects bad input', () => {
    expect(roomCodeFromUrl('/room/')).toBe(null)
    expect(roomCodeFromUrl('/other')).toBe(null)
    expect(roomCodeFromUrl(undefined)).toBe(null)
    expect(roomCodeFromUrl('/room/a b!')).toBe(null)
  })
})

describe('hub', () => {
  it('welcomes with the room seed', () => {
    const { hub } = mkHub()
    const a = mkConn()
    expect(hub.open('1', 'ws://h/room/abcd', a)).toBe(true)
    expect(hub.message('1', hello('ann'))).toBe(true)
    const w = a.sent.find((m) => m.t === 'w')
    expect(w.sd).toBe(seedFromRoom('abcd'))
    expect(w.r).toBe('abcd')
  })
  it('second player triggers join for the first', () => {
    const { hub } = mkHub()
    const a = mkConn(); const b = mkConn()
    hub.open('1', '/room/abcd', a); hub.message('1', hello('ann'))
    hub.open('2', '/room/abcd', b); hub.message('2', hello('bob'))
    expect(a.sent.some((m) => m.t === 'j' && m.n === 'BOB')).toBe(true)
  })
  it('rooms are separate', () => {
    const { hub } = mkHub()
    const a = mkConn(); const b = mkConn()
    hub.open('1', '/room/aaaa', a); hub.message('1', hello('ann'))
    hub.open('2', '/room/bbbb', b); hub.message('2', hello('bob'))
    expect(a.sent.some((m) => m.t === 'j')).toBe(false)
    expect(hub.rooms.size).toBe(2)
  })
  it('ticks only while players are present', () => {
    const { hub, timers } = mkHub()
    const a = mkConn()
    hub.open('1', '/room/abcd', a)
    expect(timers.size).toBe(1)
    hub.close('1')
    expect(timers.size).toBe(0)
    expect(hub.rooms.get('abcd').timer).toBe(null)
  })
  it('tick sends snapshots', () => {
    let t = 1000
    const { hub, timers } = mkHub({ now: () => t })
    const a = mkConn()
    hub.open('1', '/room/abcd', a); hub.message('1', hello('ann'))
    hub.message('1', JSON.stringify({ t: 'i', s: 1, p: [1, 2, 3], y: 0, a: 0, w: 0 }))
    const tick = [...timers.values()][0]
    tick(); t += 100; tick()
    expect(a.sent.some((m) => m.t === 's' && m.p.length === 1)).toBe(true)
  })
  it('unknown peer message returns false', () => {
    const { hub } = mkHub()
    expect(hub.message('nope', hello('x'))).toBe(false)
  })
  it('bad url closes with 1008', () => {
    const { hub } = mkHub()
    const a = mkConn()
    expect(hub.open('1', '/nothing', a)).toBe(false)
    expect(a.closed[0]).toBe(1008)
  })
  it('maxRooms closes with 1013', () => {
    const { hub } = mkHub({ maxRooms: 1 })
    hub.open('1', '/room/aaaa', mkConn())
    const b = mkConn()
    expect(hub.open('2', '/room/bbbb', b)).toBe(false)
    expect(b.closed[0]).toBe(1013)
  })
})
EOT

echo "wrote server/roomHub.js, server/routes/room/[code].ts, server/routes/health.get.ts, tests/hub.test.js"
