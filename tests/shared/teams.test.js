import { describe, it, expect } from 'vitest'
import { teamOf } from '../../shared/combat.js'

describe('teams', () => {
  it('8 slots make 4 v 4', () => {
    const t = [0, 0]
    for (let s = 0; s < 8; s++) t[teamOf(s)]++
    expect(t).toEqual([4, 4])
  })
})
