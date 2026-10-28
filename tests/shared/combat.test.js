import { describe, it, expect } from 'vitest'
import { segmentHitsPlayer, damageFor } from '../../shared/combat.js'

describe('combat rules', () => {
  it('damage table', () => {
    expect(damageFor(0, false)).toBe(50)
    expect(damageFor(0, true)).toBe(100)
    expect(damageFor(2, false)).toBe(150)
    expect(damageFor(9, false)).toBe(0)
  })
  it('body hit', () => {
    expect(segmentHitsPlayer([0, 1, 0], [0, 1, 10], { x: 0, y: 0, z: 5 })).toEqual({ head: false })
  })
  it('head hit', () => {
    expect(segmentHitsPlayer([0, 1.6, 0], [0, 1.6, 10], { x: 0, y: 0, z: 5 })).toEqual({ head: true })
  })
  it('misses wide', () => {
    expect(segmentHitsPlayer([2, 1, 0], [2, 1, 10], { x: 0, y: 0, z: 5 })).toBe(null)
  })
  it('misses over the head and under the feet', () => {
    expect(segmentHitsPlayer([0, 3, 0], [0, 3, 10], { x: 0, y: 0, z: 5 })).toBe(null)
    expect(segmentHitsPlayer([0, -1, 0], [0, -1, 10], { x: 0, y: 0, z: 5 })).toBe(null)
  })
})
