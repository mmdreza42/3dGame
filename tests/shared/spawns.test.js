import { describe, it, expect } from 'vitest'
import { pickSpawn } from '../../shared/combat.js'

const spawns = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37) % 16 * 10 - 80, z: i, ry: 0 }))

describe('pickSpawn', () => {
  it('team 0 spawns left of team 1', () => {
    const t0 = [0, 2, 4, 6].map((si) => pickSpawn(spawns, 0, si))
    const t1 = [1, 3, 5, 7].map((si) => pickSpawn(spawns, 1, si))
    expect(Math.max(...t0.map((s) => s.x))).toBeLessThanOrEqual(Math.min(...t1.map((s) => s.x)))
  })
  it('4 players of a team get 4 different spawns', () => {
    const picks = [0, 2, 4, 6].map((si) => pickSpawn(spawns, 0, si))
    expect(new Set(picks).size).toBe(4)
  })
  it('works with very few spawn points', () => {
    expect(pickSpawn([{ x: 1, z: 1, ry: 0 }], 1, 5)).toEqual({ x: 1, z: 1, ry: 0 })
  })
})
