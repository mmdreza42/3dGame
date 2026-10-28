// generateLayout(seed) -> PURE DATA describing the map. Same seed => same layout, in Node and in the browser.
// Gameplay (collision, spawns, pickups) reads `obstacles`, `platforms`, `ladders`, ...
// The renderer reads `props` and builds meshes from them. Cosmetic things (grass, clouds, flowers,
// small mushrooms) are NOT here; the client may use its own RNG for those.
//
// Numbers are rounded to 3 decimals so the hash is stable across JS engines.

import { createRng, hashString, toHex8 } from './rng.js'
import { makeAABB } from './collide.js'

export const ARENA_HALF = 100        // playable area is -100..100 on X and Z
export const LAYOUT_VERSION = 1

const r3 = (n) => Math.round(n * 1000) / 1000

export function generateLayout(seedIn) {
  const seed = seedIn >>> 0
  const root = createRng(seed)

  const obstacles = []     // AABBs used for collision, bullets, line of sight
  const props = { crates: [], rocks: [], walls: [], trucks: [], tents: [], camps: [], towers: [], ponds: [], trees: [], giants: [], lamps: [], houses: [], forts: [] }
  const platforms = []     // standable decks { x, z, hw, hd, y, gap }
  const ladders = []       // { x, z, bottom, top }
  const barrels = []       // { id, x, z }
  const pickups = []       // { id, type, x, z }
  const occupied = [{ x: 0, z: 0, r: 17 }]
  for (let t = -190; t <= 190; t += 6) occupied.push({ x: 0, z: t, r: 3.6 }, { x: t, z: 0, r: 3.6 })

  function findSpot(rng, r, range = 95, tries = 80) {
    for (let i = 0; i < tries; i++) {
      const x = r3(rng.range(-range, range)), z = r3(rng.range(-range, range))
      let ok = true
      for (const o of occupied) { if (Math.hypot(x - o.x, z - o.z) < o.r + r) { ok = false; break } }
      if (ok) { occupied.push({ x, z, r }); return { x, z } }
    }
    return null
  }
  const addBox = (kind, cx, cy, cz, hx, hy, hz) => {
    const b = makeAABB(cx, cy, cz, hx, hy, hz)
    for (const k in b) b[k] = r3(b[k])
    b.kind = kind
    obstacles.push(b)
    return b
  }

  // ---- ponds (decorative, not solid; they claim space) ----
  {
    const rng = root.fork('ponds')
    for (let k = 0; k < 3; k++) {
      const r = r3(rng.range(6, 9))
      const p = findSpot(rng, r + 4, 78)
      if (p) props.ponds.push({ x: p.x, z: p.z, r })
    }
  }

  // ---- forts and houses (solid walls, door and gate gaps, climbable fort towers) ----
  // side: 0 = +z, 1 = -z, 2 = +x, 3 = -x
  const wallRun = (kind, cx, cz, half, t, h, side, gap) => {
    const alongX = side < 2
    const sign = side % 2 === 0 ? 1 : -1
    const ext = alongX ? half + t : half - t
    const segs = gap > 0 ? [[-ext, -gap / 2], [gap / 2, ext]] : [[-ext, ext]]
    for (const [a, b] of segs) {
      const m = (a + b) / 2, hl = (b - a) / 2
      if (alongX) addBox(kind, r3(cx + m), h / 2, r3(cz + sign * half), hl, h / 2, t)
      else addBox(kind, r3(cx + sign * half), h / 2, r3(cz + m), t, h / 2, hl)
    }
  }
  {
    const rng = root.fork('forts')
    for (let i = 0; i < 2; i++) {
      const p = findSpot(rng, 14, 76, 300)
      if (!p) continue
      const { x, z } = p
      wallRun('fortwall', x, z, 9, 0.6, 5, 0, 4)
      wallRun('fortwall', x, z, 9, 0.6, 5, 1, 4)
      wallRun('fortwall', x, z, 9, 0.6, 5, 2, 0)
      wallRun('fortwall', x, z, 9, 0.6, 5, 3, 0)
      addBox('fortcover', r3(x + 4.5), 0.6, r3(z + 4), 1, 0.6, 1)
      addBox('fortcover', r3(x + 4), 0.6, r3(z - 4.5), 1, 0.6, 1)
      const tx = r3(x - 5.5), tz = r3(z - 5.5)
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox('towerleg', r3(tx + sx * 1.7), 3.5, r3(tz + sz * 1.7), 0.25, 3.5, 0.25)
      addBox('deck', tx, 7.1, tz, 2.3, 0.15, 2.3)
      platforms.push({ x: tx, z: tz, hw: 2.3, hd: 2.3, y: 7.25, gap: { x: tx, hw: 0.65 } })
      ladders.push({ x: tx, z: r3(tz + 2.5), bottom: 0, top: 7.25 })
      props.towers.push({ x: tx, z: tz })
      props.forts.push({ x, z })
    }
  }
  {
    const rng = root.fork('houses')
    for (let i = 0; i < 3; i++) {
      const p = findSpot(rng, 7, 80, 300)
      if (!p) continue
      const { x, z } = p
      const door = Math.floor(rng.next() * 4)
      for (let side = 0; side < 4; side++) wallRun('housewall', x, z, 4, 0.3, 3.2, side, side === door ? 2.4 : 0)
      addBox('roof', x, 3.35, z, 4.4, 0.15, 4.4)
      props.houses.push({ x, z, door })
    }
  }

  // ---- camps: 2 tents + campfire + a crate stack ----
  const crateStack = (rng, x, z) => {
    const n = 1 + Math.floor(rng.next() * 3)
    const s0 = r3(rng.range(1.5, 2.1))
    const list = [{ x, y: s0 / 2, z, s: s0, ry: 0 }]
    if (n > 1) { const s1 = r3(rng.range(1.4, 1.9)); list.push({ x: r3(x + s0 * 1.05), y: s1 / 2, z: r3(z + rng.range(-0.2, 0.2)), s: s1, ry: 0 }) }
    const solid = list.length
    if (n > 2) { const s2 = r3(rng.range(1.2, 1.6)); list.push({ x: r3(x + s0 * 0.5), y: r3(s0 + s2 / 2), z, s: s2, ry: r3(rng.range(-0.25, 0.25)) }) }
    list.forEach((c, i) => {
      c.y = r3(c.y)
      props.crates.push(c)
      if (i < solid) addBox('crate', c.x, c.y, c.z, c.s / 2, c.s / 2, c.s / 2)
    })
  }
  {
    const rng = root.fork('camps')
    for (let k = 0; k < 3; k++) {
      const p = findSpot(rng, 11, 80)
      if (!p) continue
      const tents = [{ x: r3(p.x - 3.6), z: r3(p.z - 2), v: rng.int(0, 2) }, { x: r3(p.x + 3.6), z: r3(p.z - 2.5), v: rng.int(0, 2) }]
      for (const t of tents) addBox('tent', t.x, 1.2, t.z, 1.8, 1.2, 1.8)
      props.camps.push({ x: p.x, z: r3(p.z + 2.5), tents })
      crateStack(rng, r3(p.x + 6), r3(p.z + 4))
    }
  }

  // ---- ruined walls ----
  {
    const rng = root.fork('walls')
    for (let i = 0; i < 9; i++) {
      const p = findSpot(rng, 9, 92)
      if (!p) continue
      const alongX = rng.chance(0.5)
      let offset = -rng.range(5, 8)
      const pieces = 2 + Math.floor(rng.next() * 2)
      for (let k = 0; k < pieces; k++) {
        const len = r3(rng.range(3.5, 7)), h = r3(rng.range(2.0, 3.8))
        const mid = offset + len / 2
        const px = r3(p.x + (alongX ? mid : 0)), pz = r3(p.z + (alongX ? 0 : mid))
        const hx = alongX ? len / 2 : 0.45, hz = alongX ? 0.45 : len / 2
        addBox('wall', px, h / 2, pz, hx, h / 2, hz)
        props.walls.push({ x: px, z: pz, w: r3(hx * 2), h, d: r3(hz * 2) })
        offset += len + rng.range(1.6, 2.6)
      }
    }
  }

  // ---- watchtowers with ladder + deck ----
  {
    const rng = root.fork('towers')
    for (let i = 0; i < 2; i++) {
      const p = findSpot(rng, 7, 88)
      if (!p) continue
      const { x, z } = p
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox('towerleg', r3(x + sx * 1.7), 3.5, r3(z + sz * 1.7), 0.25, 3.5, 0.25)
      addBox('deck', x, 7.1, z, 2.3, 0.15, 2.3)
      platforms.push({ x, z, hw: 2.3, hd: 2.3, y: 7.25, gap: { x, hw: 0.65 } })
      ladders.push({ x, z: r3(z + 2.5), bottom: 0, top: 7.25 })
      props.towers.push({ x, z })
    }
  }

  // ---- trucks ----
  {
    const rng = root.fork('trucks')
    for (let i = 0; i < 4; i++) {
      const p = findSpot(rng, 5, 92)
      if (!p) continue
      const alongX = rng.chance(0.5)
      const color = rng.int(0, 2)
      addBox('truck', p.x, 1.15, p.z, alongX ? 2.6 : 1.2, 0.65, alongX ? 1.2 : 2.6)
      addBox('truckcab', r3(p.x + (alongX ? -2.9 : 0)), 1.5, r3(p.z + (alongX ? 0 : -2.9)), alongX ? 0.95 : 1.15, 0.95, alongX ? 1.15 : 0.95)
      props.trucks.push({ x: p.x, z: p.z, alongX, color })
    }
  }

  // ---- loose crate stacks ----
  {
    const rng = root.fork('crates')
    for (let i = 0; i < 12; i++) { const p = findSpot(rng, 4, 94); if (p) crateStack(rng, p.x, p.z) }
  }

  // ---- boulders ----
  {
    const rng = root.fork('rocks')
    for (let i = 0; i < 16; i++) {
      const p = findSpot(rng, 3.5, 95)
      if (!p) continue
      const s = r3(rng.range(1.4, 3))
      const sx = r3(s * rng.range(0.9, 1.4)), sy = r3(s * rng.range(0.7, 1.0)), sz = r3(s * rng.range(0.9, 1.4))
      const ry = r3(rng.range(0, 6))
      const y = r3(s * 0.55)
      props.rocks.push({ x: p.x, y, z: p.z, sx, sy, sz, ry, v: rng.int(0, 2) })
      // box a bit smaller than the visual so rounded rocks do not feel like invisible walls
      addBox('rock', p.x, y, p.z, sx * 0.7, sy * 0.8, sz * 0.7)
    }
  }

  // ---- lamp posts ----
  {
    const rng = root.fork('lamps')
    for (let i = 0; i < 12; i++) {
      const p = findSpot(rng, 1.8, 94)
      if (!p) continue
      props.lamps.push(p)
      addBox('lamp', p.x, 2.6, p.z, 0.12, 2.6, 0.12)
    }
  }

  // ---- explosive barrels (synced objects, server owned) ----
  {
    const rng = root.fork('barrels')
    for (let i = 0; i < 14; i++) {
      const p = findSpot(rng, 1.6, 92)
      if (p) barrels.push({ id: barrels.length, x: p.x, z: p.z, v: rng.int(0, 2) })
    }
  }

  // ---- giant mushrooms (solid stems) ----
  {
    const rng = root.fork('giants')
    for (let i = 0; i < 7; i++) {
      const p = findSpot(rng, 5, 92)
      if (!p) continue
      const s = r3(rng.range(1.3, 2.1))
      props.giants.push({ x: p.x, z: p.z, s, scheme: i % 4 })
      addBox('giantstem', p.x, r3(1.2 * s), p.z, r3(0.6 * s), r3(1.2 * s), r3(0.6 * s))
    }
  }

  // ---- trees: solid ones inside the arena (trunk box), backdrop forest outside ----
  {
    const rng = root.fork('trees')
    for (let i = 0; i < 70; i++) {
      const p = findSpot(rng, 3.2, 96)
      if (!p) continue
      const pine = rng.chance(0.6), s = r3(rng.range(0.8, 1.3))
      const trunkH = pine ? 11 * s * 0.4 : 4 * s
      const trunkR = pine ? 0.38 * s : 0.55 * s
      props.trees.push({ x: p.x, z: p.z, pine, s, solid: true })
      addBox('tree', p.x, r3(trunkH / 2), p.z, r3(trunkR * 1.5), r3(trunkH / 2), r3(trunkR * 1.5))
    }
    for (let i = 0; i < 170; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(106, 196)
      props.trees.push({ x: r3(Math.cos(a) * r), z: r3(Math.sin(a) * r), pine: rng.chance(0.7), s: r3(rng.range(1.1, 1.9)), solid: false })
    }
  }

  // ---- pickups at fixed spots ----
  {
    const rng = root.fork('pickups')
    const types = ['health', 'ammo', 'overcharge', 'health', 'ammo', 'health', 'ammo', 'overcharge']
    for (let i = 0; i < types.length; i++) {
      const p = findSpot(rng, 2, 90)
      if (p) pickups.push({ id: pickups.length, type: types[i], x: p.x, z: p.z })
    }
  }

  // ---- spawn points: 16 for players, 12 for enemies, all on free ground ----
  const boxesFlat = obstacles
  const freeGround = (x, z) => {
    if (Math.abs(x) > 96 || Math.abs(z) > 96) return false
    for (const b of boxesFlat) {
      if (x > b.minX - 1.2 && x < b.maxX + 1.2 && z > b.minZ - 1.2 && z < b.maxZ + 1.2 && b.minY < 2 && b.maxY > 0.1) return false
    }
    return true
  }
  const spawnPoints = (name, count, minGap) => {
    const rng = root.fork(name)
    const out = []
    let tries = 0
    let gap = minGap
    while (out.length < count && tries < 4000) {
      tries++
      if (tries % 800 === 0) gap *= 0.8
      const x = r3(rng.range(-92, 92)), z = r3(rng.range(-92, 92))
      if (!freeGround(x, z)) continue
      let ok = true
      for (const o of out) { if (Math.hypot(x - o.x, z - o.z) < gap) { ok = false; break } }
      if (ok) out.push({ x, z, ry: r3(rng.range(0, Math.PI * 2)) })
    }
    return out
  }
  const playerSpawns = spawnPoints('pspawn', 16, 40)
  const enemySpawns = spawnPoints('espawn', 12, 30)

  return {
    v: LAYOUT_VERSION, seed, half: ARENA_HALF,
    obstacles, platforms, ladders, barrels, pickups, playerSpawns, enemySpawns, props, occupied
  }
}

// Stable fingerprint of everything gameplay depends on + the props the renderer uses.
export function layoutHash(layout) {
  const { occupied, ...rest } = layout // eslint-disable-line no-unused-vars
  return toHex8(hashString(JSON.stringify(rest)))
}

// Accepts ?seed=123, ?seed=abc (hashed), or nothing (default).
export function parseSeed(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback >>> 0
  const s = String(value)
  if (/^\d{1,10}$/.test(s)) return Number(s) >>> 0
  return hashString(s)
}
