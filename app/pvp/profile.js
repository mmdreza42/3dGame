// Player profile in localStorage (key "nexus.profile.v1") and reconnect token in sessionStorage.
//
// HONEST NOTE: localStorage is per browser and the player can edit it freely. It is for convenience
// (name, personal best, lifetime stats shown on screen), NOT for trust. The server never believes a
// client-sent score. A global leaderboard would need server-signed results (D1/KV) - a later option.
//
// Every read/write is wrapped in try/catch. Corrupt JSON, quota errors and blocked storage all fall
// back to an in-memory copy so the game keeps running.

import { cleanName } from '../../shared/names.js'

export const PROFILE_KEY = 'nexus.profile.v1'
export const SESSION_KEY = 'nexus.session.v1'
export const LEGACY_HIGHSCORE_KEY = 'nexus_highscore'
export const PROFILE_VERSION = 1

const STAT_KEYS = ['kills', 'deaths', 'headshots', 'enemyKills', 'shots', 'hits', 'playMs']

export function makeMemoryStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) }
  }
}

// Wraps a real Storage (or a getter that may throw) so that no call can ever throw.
export function safeStorage(getStorage) {
  const mem = makeMemoryStorage()
  let real = null
  try { real = typeof getStorage === 'function' ? getStorage() : getStorage } catch { real = null }
  return {
    getItem(k) { try { if (real) return real.getItem(k) } catch { /* fall through */ } return mem.getItem(k) },
    setItem(k, v) { try { if (real) { real.setItem(k, v); return true } } catch { /* quota or blocked */ } mem.setItem(k, v); return false },
    removeItem(k) { try { if (real) real.removeItem(k) } catch { /* ignore */ } mem.removeItem(k) }
  }
}

function newId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID() } catch { /* ignore */ }
  let s = ''
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

const num = (v, def = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, n))
}

export function defaultProfile(now = Date.now()) {
  return {
    v: PROFILE_VERSION,
    id: newId(),
    name: '',
    createdAt: now,
    bestScore: 0,
    lifetime: { kills: 0, deaths: 0, headshots: 0, enemyKills: 0, shots: 0, hits: 0, playMs: 0 },
    settings: { sens: 1, volume: 0.8, fov: 70, invertY: false },
    lastRoom: ''
  }
}

// Turns ANYTHING (null, garbage, an older version, hand-edited JSON) into a valid profile.
// legacyBest = value of the old "nexus_highscore" key, imported once.
export function migrateProfile(raw, { legacyBest = 0, now = Date.now() } = {}) {
  const base = defaultProfile(now)
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const p = base
  if (typeof src.id === 'string' && /^[\w-]{8,64}$/.test(src.id)) p.id = src.id
  p.name = cleanName(src.name)
  if (p.name.length < 3) p.name = ''
  p.createdAt = num(src.createdAt, now, 0)
  p.bestScore = Math.floor(Math.max(num(src.bestScore, 0, 0, 1e9), num(legacyBest, 0, 0, 1e9)))
  const lt = src.lifetime && typeof src.lifetime === 'object' ? src.lifetime : {}
  for (const k of STAT_KEYS) p.lifetime[k] = Math.floor(num(lt[k], 0, 0, 1e12))
  const st = src.settings && typeof src.settings === 'object' ? src.settings : {}
  p.settings.sens = num(st.sens, 1, 0.1, 5)
  p.settings.volume = num(st.volume, 0.8, 0, 1)
  p.settings.fov = num(st.fov, 70, 50, 110)
  p.settings.invertY = st.invertY === true
  p.lastRoom = typeof src.lastRoom === 'string' && /^[A-Za-z0-9_-]{0,16}$/.test(src.lastRoom) ? src.lastRoom : ''
  return p
}

export function loadProfile(storage, opts = {}) {
  let raw
  try {
    const text = storage.getItem(PROFILE_KEY)
    raw = text ? JSON.parse(text) : null
  } catch { raw = null }                       // corrupt JSON -> start fresh (name will be asked again)
  let legacyBest
  try { legacyBest = parseInt(storage.getItem(LEGACY_HIGHSCORE_KEY) || '0', 10) || 0 } catch { legacyBest = 0 }
  return migrateProfile(raw, { legacyBest, now: opts.now })
}

export function saveProfile(storage, profile) {
  try { return storage.setItem(PROFILE_KEY, JSON.stringify(profile)) !== false } catch { return false }
}

// Small stateful wrapper the game uses. All methods are safe to call at any time.
export function createProfileStore(storage, { now = () => Date.now(), throttleMs = 2000 } = {}) {
  let profile = loadProfile(storage, { now: now() })
  let dirty = false
  let lastSave = 0
  let sessionStart = now()

  function flush(force = true) {
    const t = now()
    if (!force && t - lastSave < throttleMs) return false
    profile.lifetime.playMs += Math.max(0, t - sessionStart)
    sessionStart = t
    lastSave = t
    dirty = false
    return saveProfile(storage, profile)
  }
  function touch() { dirty = true; flush(false) }

  return {
    get: () => profile,
    setName(name) { profile.name = cleanName(name); flush(true) },
    addStat(key, n = 1) { if (STAT_KEYS.includes(key) && key !== 'playMs') { profile.lifetime[key] += n; touch() } },
    submitScore(score) {
      const s = Math.floor(num(score, 0, 0, 1e9))
      if (s > profile.bestScore) { profile.bestScore = s; flush(true); return true }
      return false
    },
    setLastRoom(code) { profile.lastRoom = /^[A-Za-z0-9_-]{0,16}$/.test(code) ? code : ''; touch() },
    flush,
    isDirty: () => dirty,
    // save when the tab is hidden or closed
    attachPageHooks(doc, win) {
      const onHide = () => { if (!doc || doc.visibilityState === 'hidden') flush(true) }
      const onPageHide = () => flush(true)
      doc?.addEventListener('visibilitychange', onHide)
      win?.addEventListener('pagehide', onPageHide)
      return () => { doc?.removeEventListener('visibilitychange', onHide); win?.removeEventListener('pagehide', onPageHide) }
    }
  }
}

// ---- reconnect token (sessionStorage: survives refresh, not a new tab) ----
export function loadSession(storage, now = Date.now()) {
  try {
    const s = JSON.parse(storage.getItem(SESSION_KEY) || 'null')
    if (s && typeof s.token === 'string' && typeof s.room === 'string' && now - num(s.t, 0) < 60000) return s
  } catch { /* ignore */ }
  return null
}
export function saveSession(storage, room, token, now = Date.now()) {
  try { storage.setItem(SESSION_KEY, JSON.stringify({ room, token, t: now })) } catch { /* ignore */ }
}
export function clearSession(storage) { try { storage.removeItem(SESSION_KEY) } catch { /* ignore */ } }
