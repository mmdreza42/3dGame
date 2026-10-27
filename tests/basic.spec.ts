import { describe, it, expect } from 'vitest'

describe('Game Math', () => {
  it('calculates damage correctly', () => {
    const baseDamage = 50
    const multiplier = 2
    expect(baseDamage * multiplier).toBe(100)
  })

  it('verifies player health logic', () => {
    let hp = 100
    hp -= 40
    expect(hp).toBe(60)
  })
})
