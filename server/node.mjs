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
