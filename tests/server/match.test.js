import { describe, it, expect } from 'vitest'
import { GameRoom } from '../../server/GameRoom.js'
import { T, encode, decodeServer } from '../../shared/protocol.js'
import { KILL_LIMIT, MATCH_END_MS } from '../../shared/combat.js'

// player i has id i+1 and slot i (even slot = team 0), standing at x = i*5
function mk(n) {
  let now = 1000
  const r = new GameRoom({ code: 'abcd', sanitizeName: (x) => x, now: () => now, obstacles: [] })
  const cs = []
  for (let i = 0; i < n; i++) {
    const c = { out: [], send(s) { c.out.push(JSON.parse(s)) }, close() {} }
    r.onConnect(c)
    r.onMessage(c, encode({ t: T.HELLO, v: 1, n: 'P' + i }))
    r.onMessage(c, encode({ t: T.INPUT, s: 1, p: [i * 5, 0, 0], y: 0, a: 0, w: 0 }))
    cs.push(c)
  }
  return {
    r, cs,
    hit: (c, g) => r.onMessage(c, encode({ t: T.HIT, g, h: 1, w: 0 })),
    adv: (ms) => { now += ms; r.onTick(now) },
    got: (c, t) => c.out.filter((m) => m.t === t),
  }
}

describe('match end', () => {
  it('reaching the kill limit ends the match for the winning team', () => {
    const s = mk(2)
    s.r.players.get(1).kills = KILL_LIMIT - 1
    s.hit(s.cs[0], 2)
    expect(s.got(s.cs[1], T.MATCH)).toEqual([{ t: T.MATCH, w: 0, ms: MATCH_END_MS }])
  })
  it('no match end below the limit', () => {
    const s = mk(2)
    s.hit(s.cs[0], 2)
    expect(s.got(s.cs[1], T.MATCH)).toHaveLength(0)
  })
  it('hits are ignored while the match is over', () => {
    const s = mk(4)
    s.r.players.get(1).kills = KILL_LIMIT - 1
    s.hit(s.cs[0], 2)
    s.hit(s.cs[0], 4)
    expect(s.got(s.cs[0], T.DMG)).toHaveLength(1)
  })
  it('after MATCH_END_MS scores reset and everyone respawns', () => {
    const s = mk(2)
    s.r.players.get(1).kills = KILL_LIMIT - 1
    s.hit(s.cs[0], 2)
    s.adv(MATCH_END_MS)
    expect(s.r.matchEndsAt).toBe(0)
    expect(s.r.players.get(1).kills).toBe(0)
    expect(s.got(s.cs[0], T.SCORES).at(-1).p).toEqual([[1, 0, 0], [2, 0, 0]])
    expect(s.got(s.cs[0], T.RESPAWN).map((m) => m.id)).toEqual([1, 2])
  })
  it('protocol: MATCH validator', () => {
    expect(decodeServer(encode({ t: 'n', w: 1, ms: 8000 })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'n', w: 2, ms: 8000 })).ok).toBe(false)
  })
})
