import { describe, it, expect } from 'vitest'
import { GameRoom } from '../../server/GameRoom.js'
import { T, encode } from '../../shared/protocol.js'

// A = id 1 slot 0 (team 0), B = id 2 slot 1 (team 1), C = id 3 slot 2 (team 0)
function trio() {
  let now = 1000
  const room = new GameRoom({ code: 'abcd', sanitizeName: (r) => r, now: () => now, obstacles: [] })
  const mk = () => { const c = { out: [], send(s) { c.out.push(JSON.parse(s)) }, close() {} }; room.onConnect(c); return c }
  const cs = [mk(), mk(), mk()]
  ;['A', 'B', 'C'].forEach((n, i) => {
    room.onMessage(cs[i], encode({ t: T.HELLO, v: 1, n }))
    room.onMessage(cs[i], encode({ t: T.INPUT, s: 1, p: [i * 5, 0, 0], y: 0, a: 0, w: 0 }))
  })
  return { room, a: cs[0], hit: (g) => room.onMessage(cs[0], encode({ t: T.HIT, g, h: 0, w: 0 })) }
}
const dmg = (c) => c.out.filter((m) => m.t === T.DMG).length

describe('teams (server)', () => {
  it('a teammate cannot be hurt', () => {
    const { a, hit } = trio()
    hit(3)
    expect(dmg(a)).toBe(0)
  })
  it('an enemy can be hurt', () => {
    const { a, hit } = trio()
    hit(2)
    expect(dmg(a)).toBe(1)
  })
})
