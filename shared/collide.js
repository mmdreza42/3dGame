// Pure collision helpers. No THREE, no DOM. Used by client prediction, server hit detection and AI.
// An AABB is { minX, minY, minZ, maxX, maxY, maxZ }.

export function makeAABB(cx, cy, cz, hx, hy, hz) {
  return { minX: cx - hx, minY: cy - hy, minZ: cz - hz, maxX: cx + hx, maxY: cy + hy, maxZ: cz + hz }
}

export function pointInAABB(x, y, z, b, margin = 0) {
  return x >= b.minX - margin && x <= b.maxX + margin &&
    y >= b.minY - margin && y <= b.maxY + margin &&
    z >= b.minZ - margin && z <= b.maxZ + margin
}

export function aabbOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY &&
    a.minZ <= b.maxZ && a.maxZ >= b.minZ
}

// Slab test. Returns distance t along the (normalized) direction, or -1 on miss. maxDist limits the ray.
export function rayAABB(ox, oy, oz, dx, dy, dz, b, maxDist = Infinity) {
  let tmin = 0
  let tmax = maxDist
  const o = [ox, oy, oz]
  const d = [dx, dy, dz]
  const lo = [b.minX, b.minY, b.minZ]
  const hi = [b.maxX, b.maxY, b.maxZ]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1
    } else {
      const inv = 1 / d[i]
      let t1 = (lo[i] - o[i]) * inv
      let t2 = (hi[i] - o[i]) * inv
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s }
      if (t1 > tmin) tmin = t1
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) return -1
    }
  }
  return tmin
}

// Nearest hit over a list. Returns { t, index } or null.
export function rayVsList(ox, oy, oz, dx, dy, dz, list, maxDist = Infinity) {
  let best = null
  for (let i = 0; i < list.length; i++) {
    const t = rayAABB(ox, oy, oz, dx, dy, dz, list[i], best ? best.t : maxDist)
    if (t >= 0 && (!best || t < best.t)) best = { t, index: i }
  }
  return best
}

// Line of sight between two points: true when nothing blocks the segment.
export function segmentClear(x0, y0, z0, x1, y1, z1, list) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-6) return true
  return rayVsList(x0, y0, z0, dx / len, dy / len, dz / len, list, len) === null
}

// Ray vs sphere. Returns t or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist = Infinity) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz
  const tca = lx * dx + ly * dy + lz * dz
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca
  const r2 = r * r
  if (d2 > r2) return -1
  const thc = Math.sqrt(r2 - d2)
  let t = tca - thc
  if (t < 0) t = tca + thc
  if (t < 0 || t > maxDist) return -1
  return t
}

// Ray vs vertical capsule (axis along Y from y0 to y1, radius r). Sampled-sphere approximation is
// avoided: we solve the infinite cylinder then check the end caps. Returns t or -1.
export function rayCapsuleY(ox, oy, oz, dx, dy, dz, cx, y0, y1, cz, r, maxDist = Infinity) {
  let best = -1
  const consider = (t) => { if (t >= 0 && t <= maxDist && (best < 0 || t < best)) best = t }
  // cylinder part
  const px = ox - cx, pz = oz - cz
  const a = dx * dx + dz * dz
  if (a > 1e-12) {
    const b = 2 * (px * dx + pz * dz)
    const c = px * px + pz * pz - r * r
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        const y = oy + dy * t
        if (t >= 0 && y >= y0 && y <= y1) { consider(t); break }
      }
    }
  }
  consider(raySphere(ox, oy, oz, dx, dy, dz, cx, y0, cz, r, maxDist))
  consider(raySphere(ox, oy, oz, dx, dy, dz, cx, y1, cz, r, maxDist))
  return best
}

// Horizontal movement of a player (circle of radius r in XZ, vertical span feetY..feetY+height) against boxes.
// Moves axis by axis so you slide along walls. Returns { x, z }.
export function moveCircle(x, z, dx, dz, r, feetY, height, boxes) {
  let nx = x + dx
  if (blockedCircle(nx, z, r, feetY, height, boxes)) nx = x
  let nz = z + dz
  if (blockedCircle(nx, nz, r, feetY, height, boxes)) nz = z
  return { x: nx, z: nz }
}

export function blockedCircle(x, z, r, feetY, height, boxes) {
  const top = feetY + height
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    if (b.maxY <= feetY + 0.05 || b.minY >= top) continue
    const cx = Math.max(b.minX, Math.min(x, b.maxX))
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ))
    const ddx = x - cx, ddz = z - cz
    if (ddx * ddx + ddz * ddz < r * r) return true
  }
  return false
}
