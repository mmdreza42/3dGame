import { describe, it, expect } from 'vitest'
import { cleanName, validateName, dedupeName } from '../../shared/names.js'

describe('names', () => {
  it('accepts normal names and collapses spaces', () => {
    expect(validateName('  Bob   the  Builder ')).toEqual({ ok: true, name: 'Bob the Builder', error: '' })
  })
  it('rejects too short / too long / bad chars', () => {
    expect(validateName('ab').ok).toBe(false)
    expect(validateName('a'.repeat(17)).ok).toBe(false)
    expect(validateName('<script>').ok).toBe(false)
    expect(validateName('a"b').ok).toBe(false)
    expect(validateName(42).ok).toBe(false)
    expect(validateName(null).ok).toBe(false)
  })
  it('accepts allowed punctuation and non-latin letters', () => {
    expect(validateName('x_y.z-1').ok).toBe(true)
    expect(validateName('علی رضا').ok).toBe(true)
  })
  it('cleanName strips bad characters and limits length', () => {
    expect(cleanName('<b>Hi</b> there')).toBe('bHib there')
    expect(cleanName('a'.repeat(40)).length).toBe(16)
    expect(cleanName({})).toBe('')
    expect(cleanName('   ')).toBe('')
  })
  it('dedupeName adds #2, #3 and stays within 16 chars', () => {
    expect(dedupeName('Bob', ['alice'])).toBe('Bob')
    expect(dedupeName('Bob', ['bob'])).toBe('Bob#2')
    expect(dedupeName('Bob', ['Bob', 'Bob#2'])).toBe('Bob#3')
    const long = 'a'.repeat(16)
    const d = dedupeName(long, [long])
    expect(d.length).toBeLessThan(17)
    expect(d.endsWith('#2')).toBe(true)
  })
})
