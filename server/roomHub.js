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
