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
