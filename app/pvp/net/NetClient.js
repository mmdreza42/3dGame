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
    this.scores = new Map() // id -> {k, d}
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
        this.scores.clear()
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
      case T.DMG:
        if (m.hp <= 0) this._remote.delete(m.id)
        this._emit('damage', { id: m.id, by: m.by, hp: m.hp, head: m.h === 1 })
        break
      case T.SCORES:
        this.scores.clear()
        for (const [id, k, d] of m.p) this.scores.set(id, { k, d })
        this._emit('scores', this.scores)
        break
      case T.RESPAWN:
        this._remote.delete(m.id)
        this._emit('respawn', { id: m.id, slot: m.si })
        break
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

  sendHit(target, head, weapon) {
    if (this.status !== 'playing' || !this._t) return
    this._t.send({ t: T.HIT, g: target, h: head ? 1 : 0, w: weapon | 0 })
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
