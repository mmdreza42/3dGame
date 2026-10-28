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
