// Seeded randomness shared by client and server. No THREE, no DOM, never Math.random().

// FNV-1a 32 bit string hash
export function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function toHex8(n) {
  return (n >>> 0).toString(16).padStart(8, '0')
}

// mulberry32: small, fast, good enough for gameplay
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A named child seed. Forking per feature means adding a feature never reshuffles the others.
export function forkSeed(seed, name) {
  return hashString(name + ':' + (seed >>> 0))
}

export function createRng(seed) {
  const s = seed >>> 0
  const next = mulberry32(s)
  return {
    seed: s,
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    fork: (name) => createRng(forkSeed(s, name))
  }
}
