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
