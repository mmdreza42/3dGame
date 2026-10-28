import { describe, it, expect } from 'vitest'
import { makeSanitizer } from '../../server/names-adapter.js'

// If this file fails, the signatures of cleanName/dedupeName in shared/names.js differ from the adapter's assumption.
describe('names-adapter (against the real shared/names.js)', () => {
  const sanitize = makeSanitizer()
  it('returns a non-empty string for odd input', () => {
    for (const raw of ['Neo', '', '   ', '<script>', 'x'.repeat(64), 'ÄÖÜ', 'نام']) {
      const n = sanitize(raw, [])
      expect(typeof n).toBe('string')
      expect(n.length).toBeGreaterThan(0)
    }
  })
  it('never returns a taken name', () => {
    const taken = []
    for (let i = 0; i < 6; i++) { const n = sanitize('Neo', taken); expect(taken.map((t) => t.toLowerCase())).not.toContain(n.toLowerCase()); taken.push(n) }
  })
})
