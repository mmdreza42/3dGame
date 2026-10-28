import { describe, it, expect } from 'vitest'
import { GameRoom } from '../../server/GameRoom.js'
import { T, encode } from '../../shared/protocol.js'
import { makeAABB } from '../../shared/collide.js'

// A at (0,0,0) shoots B at (10,0,0)
function shot(obstacles) {
  let now = 1000
  const room = new GameRoom({ code: 'abcd', sanitizeName: (r) => r, now: () => now, obstacles })
  const mk = () => { const c = { out: [], send(s) { c.out.push(JSON.parse(s)) }, close() {} }; room.onConnect(c); return c }
  const a = mk(), b = mk()
  room.onMessage(a, encode({ t: T.HELLO, v: 1, n: 'A' }))
  room.onMessage(b, encode({ t: T.HELLO, v: 1, n: 'B' }))
  room.onMessage(a, encode({ t: T.INPUT, s: 1, p: [0, 0, 0], y: 0, a: 0, w: 0 }))
  room.onMessage(b, encode({ t: T.INPUT, s: 1, p: [10, 0, 0], y: 0, a: 0, w: 0 }))
  room.onMessage(a, encode({ t: T.HIT, g: 2, h: 0, w: 0 }))
  return a.out.filter((m) => m.t === T.DMG).length
}

describe('server wall check', () => {
  it('a tall wall between the players blocks the hit', () => {
    expect(shot([makeAABB(5, 1, 0, 1, 10, 10)])).toBe(0)
  })
  it('no obstacles: the hit lands', () => {
    expect(shot([])).toBe(1)
  })
  it('a low wall (below chest height) does not block', () => {
    expect(shot([makeAABB(5, 0.25, 0, 1, 0.25, 10)])).toBe(1)
  })
  it('without a list, the real layout of the seed is built lazily', () => {
    const room = new GameRoom({ code: 'abcd', sanitizeName: (r) => r })
    expect(typeof room._canSee([0, 0, 0], [1, 0, 0])).toBe('boolean')
    expect(Array.isArray(room._obstacles)).toBe(true)
    expect(room._obstacles.length).toBeGreaterThan(0)
  })
})
