import * as THREE from 'three'

// Mushrooms in nine kinds. Small ones are instanced (cheap), giants are solid landmarks.
//   fly agaric (red, white spots) · porcini (brown) · chanterelle (orange funnel) · parasol (tall)
//   morel (honeycomb) · glowing (cyan/violet/green) · fairy rings (white buttons)
//   bracket fungi (shelves on tree trunks) · giant mushrooms (obstacles)

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const _o = new THREE.Object3D()
const _c = new THREE.Color()

function batch(geo, mat, max) {
  const im = new THREE.InstancedMesh(geo, mat, max)
  im.count = 0
  im.frustumCulled = false
  im.receiveShadow = true
  return im
}
function put(im, x, y, z, sx, sy, sz, ry, color, rx = 0, rz = 0) {
  if (im.count >= im.instanceMatrix.count) return
  _o.position.set(x, y, z)
  _o.scale.set(sx, sy, sz)
  _o.rotation.set(rx, ry, rz)
  _o.updateMatrix()
  im.setMatrixAt(im.count, _o.matrix)
  im.setColorAt(im.count, _c.set(color))
  im.count++
}

export function buildMushrooms(scene, obstacles, { occupied, findSpot, glowTex, brackets = [], anchors = [] }) {
  // ---------- shared geometry ----------
  const stemGeo = new THREE.CylinderGeometry(0.6, 1, 1, 8); stemGeo.translate(0, 0.5, 0)
  const domeGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const funnelGeo = new THREE.CylinderGeometry(1, 0.25, 1, 12, 1, true); funnelGeo.translate(0, 0.5, 0)
  const coneGeo = new THREE.ConeGeometry(1, 1, 14, 1, true); coneGeo.translate(0, 0.5, 0)
  const blobGeo = new THREE.IcosahedronGeometry(1, 1)
  const spotGeo = new THREE.SphereGeometry(1, 6, 4)
  const shelfGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI); shelfGeo.rotateY(-Math.PI / 2)

  const mStem = new THREE.MeshStandardMaterial({ roughness: 0.9 })
  const mCap = new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide })
  const mDry = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, flatShading: true })
  const mSpot = new THREE.MeshStandardMaterial({ roughness: 0.7 })
  const mGlow = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })

  const B = {
    stem: batch(stemGeo, mStem, 1200),
    dome: batch(domeGeo, mCap, 800),
    spot: batch(spotGeo, mSpot, 1800),
    funnel: batch(funnelGeo, mDry, 400),
    cone: batch(coneGeo, mCap, 160),
    blob: batch(blobGeo, mDry, 400),
    gcap: batch(domeGeo, mGlow, 300),
    shelf: batch(shelfGeo, mDry, brackets.length + 8)
  }
  const glows = []

  // ---------- giant mushrooms (solid) ----------
  const schemes = [
    { cap: 0xc8221a, spot: 0xfff5e0, stem: 0xf0e6d0, emissive: 0x000000 },
    { cap: 0x7a3fb0, spot: 0xe8d0ff, stem: 0xdcd0e8, emissive: 0x1a0a30 },
    { cap: 0xe8861a, spot: 0xfff0c0, stem: 0xf0e2c4, emissive: 0x000000 },
    { cap: 0x2a9d8f, spot: 0xc8fff4, stem: 0xd8efe8, emissive: 0x0a4a42 }
  ].map((s) => ({
    stem: new THREE.MeshStandardMaterial({ color: s.stem, roughness: 0.9 }),
    cap: new THREE.MeshStandardMaterial({ color: s.cap, emissive: s.emissive, emissiveIntensity: 0.5, roughness: 0.55, side: THREE.DoubleSide }),
    spot: new THREE.MeshStandardMaterial({ color: s.spot, roughness: 0.7 })
  }))
  for (let i = 0; i < 7; i++) {
    const p = findSpot(5, 92)
    if (!p) continue
    const sc = schemes[i % schemes.length]
    const s = rnd(1.3, 2.1), H = 2.4 * s, capR = 2.6 * s, capH = 1.3 * s
    const stem = new THREE.Mesh(stemGeo, sc.stem)
    stem.position.set(p.x, 0, p.z)
    stem.scale.set(0.5 * s, H, 0.5 * s)
    stem.castShadow = true; stem.receiveShadow = true
    scene.add(stem)
    obstacles.push(stem)
    const cap = new THREE.Mesh(domeGeo, sc.cap)
    cap.position.set(p.x, H - 0.1 * s, p.z)
    cap.scale.set(capR, capH, capR)
    cap.castShadow = true
    scene.add(cap)
    for (let k = 0; k < 9; k++) {
      const th = rnd(0.25, 1.2), ph = rnd(0, 6.283), sp = rnd(0.2, 0.34) * s
      const dot = new THREE.Mesh(spotGeo, sc.spot)
      dot.position.set(
        p.x + Math.sin(th) * Math.cos(ph) * capR * 1.01,
        H - 0.1 * s + Math.cos(th) * capH * 1.01,
        p.z + Math.sin(th) * Math.sin(ph) * capR * 1.01
      )
      dot.scale.set(sp, sp * 0.5, sp)
      scene.add(dot)
    }
  }

  // ---------- placement helpers ----------
  const big = occupied.filter((o) => o.r >= 4.5)   // ponds, camps, towers, walls, giants, spawn area
  const free = (x, z) => {
    if (Math.abs(x) > 96 || Math.abs(z) > 96) return false
    if (Math.abs(x) < 3.9 || Math.abs(z) < 3.9) return false   // keep the dirt paths clear
    for (const o of big) if (Math.hypot(x - o.x, z - o.z) < o.r) return false
    return true
  }
  const spot = () => {
    for (let i = 0; i < 25; i++) {
      let x, z
      if (anchors.length && Math.random() < 0.6) {          // mushrooms like trees
        const a = pick(anchors), ang = rnd(0, 6.283), r = rnd(1.5, 5)
        x = a.x + Math.cos(ang) * r; z = a.z + Math.sin(ang) * r
      } else { x = rnd(-95, 95); z = rnd(-95, 95) }
      if (free(x, z)) return { x, z }
    }
    return null
  }
  const grow = (clusters, n, spread, fn) => {
    for (let c = 0; c < clusters; c++) {
      const p = spot()
      if (!p) continue
      const cnt = Math.round(rnd(n[0], n[1]))
      for (let i = 0; i < cnt; i++) {
        const a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * spread
        fn(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, p, i)
      }
    }
  }

  const CREAM = 0xf1e9d2

  // ---------- the types ----------
  const fly = (x, z) => {
    const s = rnd(0.8, 1.7), ry = rnd(0, 6.28)
    const cr = 0.42 * s, ch = 0.3 * s, cy = 0.52 * s
    put(B.stem, x, 0, z, 0.1 * s, 0.6 * s, 0.1 * s, ry, CREAM)
    put(B.dome, x, cy, z, cr, ch, cr, ry, pick([0xd4191a, 0xd4191a, 0xe8461a]))
    const n = 5 + Math.floor(Math.random() * 4)
    for (let i = 0; i < n; i++) {
      const th = rnd(0.2, 1.15), ph = rnd(0, 6.283), sp = rnd(0.05, 0.085) * s
      put(B.spot, x + Math.sin(th) * Math.cos(ph) * cr * 1.01, cy + Math.cos(th) * ch * 1.01, z + Math.sin(th) * Math.sin(ph) * cr * 1.01, sp, sp * 0.6, sp, ph, 0xfff8e6)
    }
  }
  const porcini = (x, z) => {
    const s = rnd(0.9, 1.7), ry = rnd(0, 6.28)
    put(B.stem, x, 0, z, 0.16 * s, 0.5 * s, 0.16 * s, ry, 0xe8d9b4)
    put(B.blob, x, 0.1 * s, z, 0.19 * s, 0.14 * s, 0.19 * s, ry, 0xe8d9b4)
    put(B.dome, x, 0.42 * s, z, 0.38 * s, 0.22 * s, 0.38 * s, ry, pick([0x7b4a22, 0x8b5a2b, 0x6a3d1c]))
  }
  const chanterelle = (x, z) => {
    const s = rnd(0.8, 1.5)
    put(B.funnel, x, 0, z, 0.3 * s, 0.45 * s, 0.3 * s, rnd(0, 6.28), pick([0xf2a516, 0xe8940c, 0xf7b73a]), rnd(-0.2, 0.2), rnd(-0.2, 0.2))
  }
  const parasol = (x, z) => {
    const s = rnd(0.9, 1.6), ry = rnd(0, 6.28), h = 1.15 * s
    put(B.stem, x, 0, z, 0.06 * s, h, 0.06 * s, ry, 0xdccfae)
    put(B.cone, x, h - 0.04, z, 0.55 * s, 0.26 * s, 0.55 * s, ry, pick([0xd9c7a1, 0xc4a981, 0xeee4cc]))
    put(B.dome, x, h + 0.18 * s, z, 0.1 * s, 0.07 * s, 0.1 * s, ry, 0x8b6a45)
  }
  const morel = (x, z) => {
    const s = rnd(0.9, 1.6), ry = rnd(0, 6.28)
    put(B.stem, x, 0, z, 0.08 * s, 0.22 * s, 0.08 * s, ry, 0xe9dec2)
    put(B.blob, x, 0.42 * s, z, 0.15 * s, 0.26 * s, 0.15 * s, ry, pick([0x6e5a38, 0x806b45, 0x4f3f27]))
  }
  const glowCols = [0x35fff0, 0xb066ff, 0x7dff66, 0x4aa0ff, 0xff6ee6]
  const glow = (x, z, p, i) => {
    p.col ??= pick(glowCols)
    const s = rnd(0.7, 1.4), ry = rnd(0, 6.28)
    put(B.stem, x, 0, z, 0.05 * s, 0.4 * s, 0.05 * s, ry, 0xcfe9f2)
    put(B.gcap, x, 0.34 * s, z, 0.24 * s, 0.17 * s, 0.24 * s, ry, p.col)
    if (i === 0) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: p.col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
      sp.position.set(x, 0.45, z)
      sp.scale.set(4, 4, 1)
      sp.userData.ph = rnd(0, 6)
      scene.add(sp)
      glows.push(sp)
    }
  }
  const button = (x, z) => {
    const s = rnd(0.7, 1.2), ry = rnd(0, 6.28)
    put(B.stem, x, 0, z, 0.035 * s, 0.2 * s, 0.035 * s, ry, CREAM)
    put(B.dome, x, 0.17 * s, z, 0.12 * s, 0.1 * s, 0.12 * s, ry, pick([0xf4efe2, 0xe9e2d0, 0xd9cfba]))
  }

  grow(26, [2, 5], 2.2, fly)
  grow(22, [1, 3], 1.8, porcini)
  grow(20, [4, 8], 1.6, chanterelle)
  grow(18, [1, 2], 2.5, parasol)
  grow(14, [2, 4], 1.5, morel)
  grow(12, [3, 6], 1.4, glow)

  // fairy rings
  for (let r = 0; r < 4; r++) {
    const p = spot()
    if (!p) continue
    const R = rnd(1.8, 3), n = 14
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd(-0.1, 0.1)
      button(p.x + Math.cos(a) * R, p.z + Math.sin(a) * R)
    }
  }

  // bracket fungi on tree trunks (data comes from world.js)
  for (const b of brackets) {
    const col = pick([0xe58a1d, 0xe58a1d, 0xcdb99a, 0x5b3d27, 0xf0d9a0])
    put(B.shelf, b.x, b.y, b.z, b.size, 0.16, b.size * 0.8, Math.atan2(b.nx, b.nz), col)
  }

  for (const im of Object.values(B)) {
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    scene.add(im)
  }

  function update(t) {
    mGlow.color.setScalar(0.82 + Math.sin(t * 1.6) * 0.18)
    for (const g of glows) g.material.opacity = 0.32 + Math.sin(t * 1.6 + g.userData.ph) * 0.1
  }

  return { update }
}
