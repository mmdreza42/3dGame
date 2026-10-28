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

  it('sends valid command-mode input without client positions', () => {
    const w = mkWorld()
    const a = new NetClient({
      room: 'abcd',
      name: 'Cmd',
      transportFactory: w.factory,
      clock: w.clock,
      storage: mem(),
      getInput: () => ({
        mode: 'commands',
        f: 1, d: -1, r: true, j: false, c: 1, e: true,
        y: 0.5, a: 0.1, w: 2,
      }),
    })
    a.connect()
    w.advance(50)

    const inputs = w.transports[0].sent.filter((m) => m.t === 'i')
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toEqual({
      t: 'i', s: 1, f: 1, d: -1, r: true, j: false, c: 1, e: true,
      y: 0.5, a: 0.1, w: 2,
    })
    expect(decodeClient(JSON.stringify(inputs[0])).ok).toBe(true)
    expect(Object.hasOwn(inputs[0], 'p')).toBe(false)
  })

  it('acknowledges command inputs and emits authoritative self snapshots', () => {
    const w = mkWorld()
    const a = new NetClient({
      room: 'abcd',
      name: 'Cmd',
      transportFactory: w.factory,
      clock: w.clock,
      storage: mem(),
      getInput: () => ({
        mode: 'commands',
        f: 1, d: 0, r: false, j: false, c: 0, e: false,
        y: 0.25, a: 0, w: 0,
      }),
    })
    const selfUpdates = []
    a.on('self-snapshot', (snapshot) => selfUpdates.push(snapshot))
    a.connect()
    a._sendInput()

    expect(a.pendingInputs.map((input) => input.s)).toEqual([1])

    a._onMessage({
      t: 's', n: 7, ts: w.t,
      p: [[a.selfId, 4, 1, 5, 0.25, 0, 0, 1]],
    })

    expect(a.ackSeq).toBe(1)
    expect(a.pendingInputs).toEqual([])
    expect(selfUpdates).toHaveLength(1)
    expect(selfUpdates[0]).toMatchObject({
      id: a.selfId,
      x: 4, y: 1, z: 5,
      yaw: 0.25, pitch: 0, w: 0,
      ackSeq: 1, tick: 7,
      pendingInputs: [],
    })
  })

  it('passes authoritative vertical state through extended self snapshots', () => {
    const w = mkWorld()
    const a = new NetClient({
      room: 'abcd',
      name: 'Cmd',
      transportFactory: w.factory,
      clock: w.clock,
      storage: mem(),
      getInput: () => ({
        mode: 'commands',
        f: 1, d: 0, r: false, j: false, c: 0, e: false,
        y: 0, a: 0, w: 0,
      }),
    })
    const updates = []
    a.on('self-snapshot', (snapshot) => updates.push(snapshot))
    a.connect()
    a._sendInput()

    a._onMessage({
      t: 's', n: 9, ts: w.t,
      p: [[a.selfId, 4, 7, 5, 0.25, 0, 0, 1, 3.5, 0, 1]],
    })

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      x: 4, y: 7, z: 5, yaw: 0.25,
      verticalVel: 3.5, grounded: false, climbIndex: 1, ackSeq: 1,
    })
    expect(a.pendingInputs).toEqual([])
  })

  it('retains only unacknowledged commands after a partial acknowledgement', () => {
    const w = mkWorld()
    const a = new NetClient({
      room: 'abcd',
      name: 'Cmd',
      transportFactory: w.factory,
      clock: w.clock,
      storage: mem(),
      getInput: () => ({
        mode: 'commands',
        f: 1, d: 0, r: false, j: false, c: 0, e: false,
        y: 0, a: 0, w: 0,
      }),
    })
    a.connect()
    a._sendInput()
    a._sendInput()
    a._sendInput()

    a._onMessage({
      t: 's', n: 8, ts: w.t,
      p: [[a.selfId, 1, 0, 1, 0, 0, 0, 2]],
    })

    expect(a.ackSeq).toBe(2)
    expect(a.pendingInputs.map((input) => input.s)).toEqual([3])
  })

  it('does not send malformed command-mode input', () => {
    const w = mkWorld()
    const a = new NetClient({
      room: 'abcd',
      name: 'Cmd',
      transportFactory: w.factory,
      clock: w.clock,
      storage: mem(),
      getInput: () => ({
        mode: 'commands',
        f: 2, d: 0, r: false, j: false, c: 0, e: false,
        y: 0, a: 0, w: 0,
      }),
    })
    a.connect()
    w.advance(200)
    expect(w.transports[0].sent.filter((m) => m.t === 'i')).toHaveLength(0)
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
