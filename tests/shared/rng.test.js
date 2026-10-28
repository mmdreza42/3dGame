import { describe, it, expect } from 'vitest'
import { mulberry32, createRng, forkSeed, hashString } from '../../shared/rng.js'

describe('rng', () => {
  it('same seed gives same sequence', () => {
    const a = mulberry32(42), b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })
  it('different seeds differ', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
  it('values are in [0,1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('forks are stable and independent', () => {
    expect(forkSeed(5, 'a')).toBe(forkSeed(5, 'a'))
    expect(forkSeed(5, 'a')).not.toBe(forkSeed(5, 'b'))
    const r1 = createRng(5).fork('x'), r2 = createRng(5).fork('x')
    expect(r1.next()).toBe(r2.next())
  })
  it('hashString is stable (golden)', () => {
    expect(hashString('nexus')).toBe(hashString('nexus'))
  })
})
