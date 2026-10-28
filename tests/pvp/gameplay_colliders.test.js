import { describe, it, expect } from 'vitest'
import { generateLayout } from '../../shared/layout.js'
import { pointInAABB, segmentClear, rayVsList } from '../../shared/collide.js'

// Same rule PvpGame.vue uses for walking: the player point at floor+1.0 is blocked when it is
// within 0.5 m of any collider box (this equals the old Box3.expandByScalar(0.5) check).
const walkBlocked = (L, x, z, floorY = 0) => L.obstacles.some((b) => pointInAABB(x, floorY + 1.0, z, b, 0.5))

describe('gameplay colliders (PvP page)', () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    it(`seed ${seed}: spawn points and map centre are walkable`, () => {
      const L = generateLayout(seed)
      expect(walkBlocked(L, 0, 0)).toBe(false)
      for (const s of L.playerSpawns) expect(walkBlocked(L, s.x, s.z)).toBe(false)
      for (const s of L.enemySpawns) expect(walkBlocked(L, s.x, s.z)).toBe(false)
    })
  }
  it('standing on a tower deck is not blocked, but the deck itself blocks bullets', () => {
    const L = generateLayout(1)
    const p = L.platforms[0]
    expect(walkBlocked(L, p.x, p.z, p.y)).toBe(false)
    // a shot straight down through the deck must hit it
    const hit = rayVsList(p.x, 12, p.z, 0, -1, 0, L.obstacles)
    expect(hit).not.toBe(null)
    expect(L.obstacles[hit.index].kind).toBe('deck')
  })
  it('walls block line of sight, open ground does not', () => {
    const L = generateLayout(1)
    const wall = L.obstacles.find((b) => b.kind === 'wall')
    const cx = (wall.minX + wall.maxX) / 2, cz = (wall.minZ + wall.maxZ) / 2
    expect(segmentClear(cx - 20, 1.5, cz, cx + 20, 1.5, cz, [wall])).toBe(false)
    expect(segmentClear(cx - 20, 1.5, cz, cx + 20, 1.5, cz, [])).toBe(true)
  })
  it('layout barrels and pickups are not inside solid boxes', () => {
    const L = generateLayout(4)
    for (const o of [...L.barrels, ...L.pickups]) {
      expect(L.obstacles.some((b) => pointInAABB(o.x, 1, o.z, b, 0))).toBe(false)
    }
  })
})
