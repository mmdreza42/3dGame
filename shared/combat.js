// Shared PvP combat rules (client + server). Pure JS, no imports.
export const PLAYER_HP = 100
export const RESPAWN_MS = 3000
export const SPAWN_PROTECT_MS = 2000
export const HEAD_MULT = 2
export const MAX_HIT_DIST = 300
export const BUDGET_CAP_MS = 2000
export const PLAYER_RADIUS = 0.45
export const PLAYER_HEIGHT = 1.75
export const HEAD_FRAC = 0.25

// teams come from the spawn slot (already on the wire): slot 0,2,4,6 = team 0; 1,3,5,7 = team 1
export const teamOf = (slot) => slot & 1
export const TEAM_COLORS = [0x00ffff, 0xff7a00]
export const KILL_LIMIT = 20
export const MATCH_END_MS = 8000

// index = weapon id on the wire (same order as WEAPON_LIST in PvpGame.vue)
export const WEAPONS = [
  { name: 'pistol', damage: 50, fireMs: 200, bullets: 1 },
  { name: 'shotgun', damage: 25, fireMs: 800, bullets: 5 },
  { name: 'sniper', damage: 150, fireMs: 1500, bullets: 1 },
]

export function damageFor(w, head) {
  const wp = WEAPONS[w]
  return wp ? wp.damage * (head ? HEAD_MULT : 1) : 0
}

// time budget one hit costs: fire interval / pellets
export function hitCost(w) {
  const wp = WEAPONS[w]
  return wp ? wp.fireMs / wp.bullets : Infinity
}

// p0, p1: [x,y,z] bullet segment. t: {x,y,z} feet position. Returns null or { head }.
export function segmentHitsPlayer(p0, p1, t) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2]
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / 0.2))
  for (let i = 0; i <= n; i++) {
    const k = i / n
    const x = p0[0] + dx * k, y = p0[1] + dy * k, z = p0[2] + dz * k
    if (Math.hypot(x - t.x, z - t.z) > PLAYER_RADIUS) continue
    const h = y - t.y
    if (h < 0 || h > PLAYER_HEIGHT) continue
    return { head: h >= PLAYER_HEIGHT * (1 - HEAD_FRAC) }
  }
  return null
}
