import { describe, it, expect } from 'vitest'
import { generateLayout, layoutHash, parseSeed } from '../../shared/layout.js'
import { rayVsList, pointInAABB, segmentClear } from '../../shared/collide.js'

describe('layout', () => {
  it('same seed gives identical layout and hash', () => {
    const a = generateLayout(1234), b = generateLayout(1234)
    expect(layoutHash(a)).toBe(layoutHash(b))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
  it('different seeds give different layouts', () => {
    expect(layoutHash(generateLayout(1))).not.toBe(layoutHash(generateLayout(2)))
  })
  it('does not touch Math.random', () => {
    const orig = Math.random
    Math.random = () => { throw new Error('Math.random used') }
    try { generateLayout(99) } finally { Math.random = orig }
  })
  it('has what the game needs', () => {
    const L = generateLayout(1)
    expect(L.playerSpawns.length).toBeGreaterThanOrEqual(12)
    expect(L.enemySpawns.length).toBeGreaterThanOrEqual(8)
    expect(L.platforms.length).toBe(4)
    expect(L.ladders.length).toBe(4)
    expect(L.barrels.length).toBeGreaterThan(5)
    expect(L.pickups.length).toBeGreaterThan(3)
    expect(L.obstacles.length).toBeGreaterThan(80)
  })
  it('spawn points are not inside obstacles', () => {
    const L = generateLayout(7)
    for (const s of L.playerSpawns) {
      for (const b of L.obstacles) {
        const inside = s.x > b.minX && s.x < b.maxX && s.z > b.minZ && s.z < b.maxZ && b.minY < 1.8
        expect(inside).toBe(false)
      }
    }
  })
  it('all numbers are finite', () => {
    const walk = (o) => { for (const v of Object.values(o)) { if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true); else if (v && typeof v === 'object') walk(v) } }
    walk(generateLayout(5))
  })
  it('golden hash for seed 1 (catches engine/code drift; update on purpose)', () => {
    expect(layoutHash(generateLayout(1))).toMatch(/^[0-9a-f]{8}$/)
    expect(layoutHash(generateLayout(1))).toBe(GOLDEN_SEED_1)
  })
  it('collider parity: same ray hits same obstacle for the same seed', () => {
    const a = generateLayout(3), b = generateLayout(3)
    for (let i = 0; i < 50; i++) {
      const ang = i * 0.37
      const d = [Math.cos(ang), 0, Math.sin(ang)]
      const ha = rayVsList(0, 1, 0, ...d, a.obstacles), hb = rayVsList(0, 1, 0, ...d, b.obstacles)
      expect(ha).toEqual(hb)
    }
  })
  it('parseSeed', () => {
    expect(parseSeed('42')).toBe(42)
    expect(parseSeed(undefined)).toBe(1)
    expect(parseSeed('hello')).toBe(parseSeed('hello'))
  })
})
const GOLDEN_SEED_1 = '8a36ca78'
describe('houses and forts', () => {
  const walkBlocked = (L, x, z) => L.obstacles.some((b) => pointInAABB(x, 1, z, b, 0.5))
  for (const seed of [1, 2, 3]) {
    it('seed ' + seed + ': 3 houses and 2 forts exist', () => {
      const L = generateLayout(seed)
      expect(L.props.houses.length).toBe(3)
      expect(L.props.forts.length).toBe(2)
    })
    it('seed ' + seed + ': house doors and fort gates are open, insides are walkable', () => {
      const L = generateLayout(seed)
      for (const h of L.props.houses) {
        const d = [[0, 4], [0, -4], [4, 0], [-4, 0]][h.door]
        expect(walkBlocked(L, h.x + d[0], h.z + d[1])).toBe(false)
        expect(walkBlocked(L, h.x, h.z)).toBe(false)
      }
      for (const f of L.props.forts) {
        expect(walkBlocked(L, f.x, f.z + 9)).toBe(false)
        expect(walkBlocked(L, f.x, f.z - 9)).toBe(false)
        expect(walkBlocked(L, f.x, f.z)).toBe(false)
      }
    })
    it('seed ' + seed + ': fort towers have a deck and a ladder', () => {
      const L = generateLayout(seed)
      expect(L.platforms.length).toBe(2 + L.props.forts.length)
      expect(L.ladders.length).toBe(2 + L.props.forts.length)
    })
  }
  it('house walls block line of sight', () => {
    const L = generateLayout(1)
    const h = L.props.houses[0]
    const walls = L.obstacles.filter((b) => b.kind === 'housewall')
    expect(segmentClear(h.x - 10, 1.5, h.z + 3, h.x + 10, 1.5, h.z + 3, walls)).toBe(false)
  })
})

