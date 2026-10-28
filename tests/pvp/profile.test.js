import { describe, it, expect } from 'vitest'
import {
  PROFILE_KEY, LEGACY_HIGHSCORE_KEY, SESSION_KEY, makeMemoryStorage, safeStorage, migrateProfile,
  loadProfile, saveProfile, createProfileStore, loadSession, saveSession
} from '../../app/pvp/profile.js'

describe('profile', () => {
  it('fresh storage gives a valid empty profile', () => {
    const p = loadProfile(makeMemoryStorage())
    expect(p.v).toBe(1)
    expect(p.name).toBe('')
    expect(p.bestScore).toBe(0)
    expect(p.id.length).toBeGreaterThan(8)
    expect(p.lifetime.kills).toBe(0)
  })
  it('corrupt JSON does not crash and gives a fresh profile', () => {
    const s = makeMemoryStorage()
    s.setItem(PROFILE_KEY, '{not json!!')
    expect(loadProfile(s).name).toBe('')
    s.setItem(PROFILE_KEY, '"a string"')
    expect(loadProfile(s).bestScore).toBe(0)
    s.setItem(PROFILE_KEY, '[1,2,3]')
    expect(loadProfile(s).bestScore).toBe(0)
  })
  it('imports the legacy nexus_highscore once, keeps the larger value', () => {
    const s = makeMemoryStorage()
    s.setItem(LEGACY_HIGHSCORE_KEY, '4200')
    expect(loadProfile(s).bestScore).toBe(4200)
    s.setItem(PROFILE_KEY, JSON.stringify({ name: 'Bob', bestScore: 9000 }))
    expect(loadProfile(s).bestScore).toBe(9000)
    expect(loadProfile(s).name).toBe('Bob')
  })
  it('sanitizes hand-edited values', () => {
    const p = migrateProfile({ name: '<img onerror=x>', bestScore: -5, lifetime: { kills: 'abc', deaths: 7.9 }, settings: { fov: 9999, sens: 'x', volume: 5 }, lastRoom: '../../etc' })
    expect(p.name.includes('<')).toBe(false)
    expect(p.bestScore).toBe(0)
    expect(p.lifetime.kills).toBe(0)
    expect(p.lifetime.deaths).toBe(7)
    expect(p.settings.fov).toBe(110)
    expect(p.settings.sens).toBe(1)
    expect(p.settings.volume).toBe(1)
    expect(p.lastRoom).toBe('')
  })
  it('save then load round trips', () => {
    const s = makeMemoryStorage()
    const p = loadProfile(s)
    p.name = 'Neo'; p.bestScore = 123
    expect(saveProfile(s, p)).toBe(true)
    const q = loadProfile(s)
    expect(q.name).toBe('Neo'); expect(q.bestScore).toBe(123); expect(q.id).toBe(p.id)
  })
  it('quota error falls back to memory and never throws', () => {
    const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('x') } }
    const s = safeStorage(broken)
    expect(s.setItem('a', '1')).toBe(false)
    expect(s.getItem('a')).toBe('1')
    const store = createProfileStore(s)
    store.setName('Trinity')
    expect(store.get().name).toBe('Trinity')
    expect(() => store.flush()).not.toThrow()
  })
  it('storage getter that throws is survived', () => {
    const s = safeStorage(() => { throw new Error('SecurityError') })
    expect(s.getItem('x')).toBe(null)
    s.setItem('x', 'y')
    expect(s.getItem('x')).toBe('y')
  })
  it('store: best score only goes up, stats count, throttled save', () => {
    const mem = makeMemoryStorage()
    let t = 1000
    const store = createProfileStore(mem, { now: () => t, throttleMs: 2000 })
    store.setName('Morpheus')
    expect(store.submitScore(500)).toBe(true)
    expect(store.submitScore(300)).toBe(false)
    expect(store.get().bestScore).toBe(500)
    store.addStat('kills'); store.addStat('kills')
    expect(store.get().lifetime.kills).toBe(2)
    expect(JSON.parse(mem.getItem(PROFILE_KEY)).lifetime.kills).toBe(0) // throttled: not saved yet
    t += 3000
    store.addStat('deaths')
    expect(JSON.parse(mem.getItem(PROFILE_KEY)).lifetime.kills).toBe(2)
    store.flush()
    expect(JSON.parse(mem.getItem(PROFILE_KEY)).lifetime.playMs).toBeGreaterThan(0)
  })
  it('reload keeps name and best score', () => {
    const mem = makeMemoryStorage()
    const a = createProfileStore(mem)
    a.setName('Persistent'); a.submitScore(777)
    const b = createProfileStore(mem)
    expect(b.get().name).toBe('Persistent'); expect(b.get().bestScore).toBe(777)
  })
  it('session token expires after 60 s', () => {
    const mem = makeMemoryStorage()
    saveSession(mem, 'abcd', 'tok', 1000)
    expect(loadSession(mem, 30000).token).toBe('tok')
    expect(loadSession(mem, 70000)).toBe(null)
    mem.setItem(SESSION_KEY, 'garbage')
    expect(loadSession(mem, 1)).toBe(null)
  })
})
