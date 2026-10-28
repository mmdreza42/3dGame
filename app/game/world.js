import * as THREE from 'three'
import { buildMushrooms } from './mushrooms.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const _o = new THREE.Object3D()
const _col = new THREE.Color()

function inst(geo, mat, count, cast = false) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count))
  im.count = count
  im.castShadow = cast
  im.receiveShadow = true
  im.frustumCulled = false
  return im
}
function put(im, i, x, y, z, sx, sy, sz, ry = 0, color = null) {
  _o.position.set(x, y, z)
  _o.scale.set(sx, sy, sz)
  _o.rotation.set(0, ry, 0)
  _o.updateMatrix()
  im.setMatrixAt(i, _o.matrix)
  if (color) im.setColorAt(i, color)
}
function finish(im) {
  im.instanceMatrix.needsUpdate = true
  if (im.instanceColor) im.instanceColor.needsUpdate = true
  return im
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}
function crateTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#8a6a3c'; g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#7d5f35' : '#94743f'; g.fillRect(0, i * 26, 128, 24) }
  g.strokeStyle = '#4a3519'; g.lineWidth = 3
  g.strokeRect(2, 2, 124, 124)
  g.beginPath(); g.moveTo(4, 4); g.lineTo(124, 124); g.moveTo(124, 4); g.lineTo(4, 124); g.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
function pathTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 128, 0)
  grad.addColorStop(0, 'rgba(130,105,66,0)')
  grad.addColorStop(0.18, 'rgba(132,106,68,1)')
  grad.addColorStop(0.82, 'rgba(132,106,68,1)')
  grad.addColorStop(1, 'rgba(130,105,66,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256)
  g.globalCompositeOperation = 'source-atop'
  for (let i = 0; i < 2500; i++) {
    const v = 60 + Math.random() * 90
    g.fillStyle = `rgba(${v | 0},${(v * 0.8) | 0},${(v * 0.5) | 0},0.35)`
    g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 30)
  return t
}

export function buildWorld(scene, obstacles, barrels) {
  // ---------- placement bookkeeping ----------
  const occupied = [{ x: 0, z: 0, r: 17 }]
  for (let t = -190; t <= 190; t += 6) occupied.push({ x: 0, z: t, r: 3.6 }, { x: t, z: 0, r: 3.6 })
  function findSpot(r, range = 95, tries = 80) {
    for (let i = 0; i < tries; i++) {
      const x = rnd(-range, range), z = rnd(-range, range)
      let ok = true
      for (const o of occupied) { if (Math.hypot(x - o.x, z - o.z) < o.r + r) { ok = false; break } }
      if (ok) { occupied.push({ x, z, r }); return { x, z } }
    }
    return null
  }
  function addMesh(geo, mat, x, y, z, { cast = true, receive = true, obstacle = false, ry = 0 } = {}) {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    m.castShadow = cast
    m.receiveShadow = receive
    scene.add(m)
    if (obstacle) obstacles.push(m)
    return m
  }

  const clouds = [], flames = [], glows = []
  const stones = [] // [x, y, z, size]
  const lilies = []  // [x, z]
  const brackets = [] // shelf fungi on tree trunks, consumed by the mushroom module
  const platforms = [] // standable decks: { x, z, hw, hd, y, gap }
  const ladders = []   // climbable ladders: { x, z, bottom, top }

  // ---------- materials ----------
  const matWood = new THREE.MeshStandardMaterial({ color: 0x6b4c2e, roughness: 1 })
  const matWood2 = new THREE.MeshStandardMaterial({ color: 0x84603a, roughness: 1 })
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x3a3f44, metalness: 0.6, roughness: 0.5 })
  const matWall = new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 1, flatShading: true })
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true })
  const glowTex = glowTexture()

  // ---------- far ground + mountains ----------
  const farGeo = new THREE.PlaneGeometry(1800, 1800); farGeo.rotateX(-Math.PI / 2)
  const far = new THREE.Mesh(farGeo, new THREE.MeshStandardMaterial({ color: 0x55663a, roughness: 1 }))
  far.position.y = -0.25
  scene.add(far)

  const mtGeo = new THREE.ConeGeometry(1, 1, 7); mtGeo.translate(0, 0.5, 0)
  const NM = 30
  const mts = inst(mtGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false }), NM)
  const caps = inst(mtGeo, new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.9, flatShading: true, fog: false }), NM)
  mts.receiveShadow = false; caps.receiveShadow = false
  for (let i = 0; i < NM; i++) {
    const a = (i / NM) * Math.PI * 2 + rnd(-0.08, 0.08)
    const r = rnd(235, 300)
    const rx = rnd(45, 85), h = rnd(70, 150)
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    const ry = Math.random() * 6
    _col.setHSL(rnd(0.56, 0.62), rnd(0.15, 0.3), rnd(0.38, 0.5))
    put(mts, i, x, -4, z, rx, h, rx, ry, _col)
    put(caps, i, x, -4 + h * 0.7, z, rx * 0.3, h * 0.3, rx * 0.3, ry)
  }
  scene.add(finish(mts), finish(caps))

  // ---------- clouds ----------
  const cloudMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, fog: false })
  for (let i = 0; i < 20; i++) {
    const g = new THREE.Group()
    const n = 4 + Math.floor(Math.random() * 3)
    for (let k = 0; k < n; k++) {
      const sp = new THREE.Sprite(cloudMat)
      const s = rnd(50, 90)
      sp.scale.set(s * 1.8, s * 0.7, 1)
      sp.position.set(rnd(-45, 45), rnd(-6, 6), rnd(-25, 25))
      g.add(sp)
    }
    g.position.set(rnd(-380, 380), rnd(140, 200), rnd(-380, 380))
    g.userData.speed = rnd(1.5, 4)
    scene.add(g)
    clouds.push(g)
  }

  // ---------- dust / pollen ----------
  const dustPos = new Float32Array(700 * 3)
  for (let i = 0; i < 700; i++) { dustPos[i * 3] = rnd(-110, 110); dustPos[i * 3 + 1] = rnd(0.5, 9); dustPos[i * 3 + 2] = rnd(-110, 110) }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xfff3c0, size: 0.16, transparent: true, opacity: 0.55, depthWrite: false }))
  scene.add(dust)

  // ---------- dirt paths + patches ----------
  const pathMat = new THREE.MeshStandardMaterial({ map: pathTexture(), roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  const pathGeo = new THREE.PlaneGeometry(6.5, 400); pathGeo.rotateX(-Math.PI / 2)
  const pathA = new THREE.Mesh(pathGeo, pathMat); pathA.position.y = 0.015; pathA.receiveShadow = true
  const pathB = new THREE.Mesh(pathGeo, pathMat); pathB.position.y = 0.02; pathB.rotation.y = Math.PI / 2; pathB.receiveShadow = true
  scene.add(pathA, pathB)

  const dirtGeo = new THREE.CircleGeometry(1, 20); dirtGeo.rotateX(-Math.PI / 2)
  const dirt = inst(dirtGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 26)
  for (let i = 0; i < 26; i++) {
    const r = rnd(2.5, 6.5)
    _col.setHSL(0.09, rnd(0.3, 0.4), rnd(0.28, 0.38))
    put(dirt, i, rnd(-150, 150), 0.03, rnd(-150, 150), r, 1, r, Math.random() * 6, _col)
  }
  scene.add(finish(dirt))

  // ---------- grass, flowers, bushes, pebbles ----------
  const grassGeo = new THREE.ConeGeometry(0.07, 1, 3, 1, true); grassGeo.translate(0, 0.5, 0)
  const GRASS = 5500
  const grass = inst(grassGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), GRASS)
  grass.receiveShadow = false
  for (let i = 0; i < GRASS; i++) {
    _col.setHSL(rnd(0.17, 0.3), rnd(0.45, 0.65), rnd(0.25, 0.42))
    put(grass, i, rnd(-175, 175), 0, rnd(-175, 175), rnd(0.8, 1.4), rnd(0.45, 1.1), rnd(0.8, 1.4), Math.random() * 6, _col)
  }
  scene.add(finish(grass))

  const flowers = inst(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 480)
  const palette = [0xff5577, 0xffd24d, 0xffffff, 0xb07cff, 0xff8a3d]
  let fi = 0
  for (let c = 0; c < 40; c++) {
    const cx = rnd(-120, 120), cz = rnd(-120, 120), pc = pick(palette)
    for (let k = 0; k < 12; k++) {
      _col.set(pc)
      const s = rnd(0.8, 1.3)
      put(flowers, fi++, cx + rnd(-3, 3), rnd(0.3, 0.5), cz + rnd(-3, 3), s, s, s, 0, _col)
    }
  }
  scene.add(finish(flowers))

  const bushes = inst(new THREE.IcosahedronGeometry(1, 0), leafMat, 240)
  for (let i = 0; i < 240; i++) {
    const s = rnd(0.5, 1.1)
    _col.setHSL(rnd(0.22, 0.34), rnd(0.4, 0.6), rnd(0.22, 0.34))
    put(bushes, i, rnd(-175, 175), s * 0.45, rnd(-175, 175), s * 1.3, s * 0.8, s * 1.3, Math.random() * 6, _col)
  }
  scene.add(finish(bushes))

  const pebbles = inst(new THREE.DodecahedronGeometry(1, 0), stoneMat, 700)
  for (let i = 0; i < 700; i++) {
    const s = rnd(0.08, 0.22)
    _col.setHSL(0.1, rnd(0, 0.08), rnd(0.35, 0.55))
    put(pebbles, i, rnd(-170, 170), s * 0.4, rnd(-170, 170), s, s * 0.7, s, Math.random() * 6, _col)
  }
  scene.add(finish(pebbles))

  // ---------- ponds ----------
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f86b0, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  for (let k = 0; k < 3; k++) {
    const r = rnd(6, 9)
    const p = findSpot(r + 4, 78)
    if (!p) continue
    const geo = new THREE.CircleGeometry(r, 40); geo.rotateX(-Math.PI / 2)
    const water = new THREE.Mesh(geo, waterMat)
    water.position.set(p.x, 0.04, p.z)
    water.receiveShadow = true
    scene.add(water)
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28, rr = r * rnd(1.0, 1.15), s = rnd(0.3, 0.9)
      stones.push([p.x + Math.cos(a) * rr, s * 0.3, p.z + Math.sin(a) * rr, s])
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 6.28, rr = r * rnd(0.1, 0.8)
      lilies.push([p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr])
    }
  }

  // ---------- crates ----------
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 })
  const crateGeo = new THREE.BoxGeometry(1, 1, 1)
  function addCrateStack(x, z) {
    const n = 1 + Math.floor(Math.random() * 3)
    const s0 = rnd(1.5, 2.1)
    addMesh(crateGeo, crateMat, x, s0 / 2, z, { obstacle: true }).scale.setScalar(s0)
    if (n > 1) {
      const s1 = rnd(1.4, 1.9)
      addMesh(crateGeo, crateMat, x + s0 * 1.05, s1 / 2, z + rnd(-0.2, 0.2), { obstacle: true }).scale.setScalar(s1)
    }
    if (n > 2) {
      const s2 = rnd(1.2, 1.6)
      addMesh(crateGeo, crateMat, x + s0 * 0.5, s0 + s2 / 2, z, { ry: rnd(-0.25, 0.25) }).scale.setScalar(s2)
    }
  }

  // ---------- camps (tents + campfire + benches + crates) ----------
  const matCanvas = [0xb5a46a, 0x6e7d4e, 0x8a6b4a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }))
  const tentGeo = new THREE.ConeGeometry(2.6, 2.4, 4); tentGeo.rotateY(Math.PI / 4)
  const logGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8)
  const benchGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8)
  const flameGeo = new THREE.ConeGeometry(0.35, 1.1, 7); flameGeo.translate(0, 0.55, 0)
  const flameMatA = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  const flameMatB = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  for (let k = 0; k < 3; k++) {
    const p = findSpot(11, 80)
    if (!p) continue
    addMesh(tentGeo, pick(matCanvas), p.x - 3.6, 1.2, p.z - 2, { obstacle: true })
    addMesh(tentGeo, pick(matCanvas), p.x + 3.6, 1.2, p.z - 2.5, { obstacle: true })
    const fx = p.x, fz = p.z + 2.5
    for (let i = 0; i < 3; i++) {
      const log = addMesh(logGeo, matWood, fx, 0.18, fz, { receive: false })
      log.rotation.z = Math.PI / 2
      log.rotation.y = i * 1.05
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      stones.push([fx + Math.cos(a) * 0.95, 0.12, fz + Math.sin(a) * 0.95, 0.22])
    }
    const fa = new THREE.Mesh(flameGeo, flameMatA); fa.position.set(fx, 0.15, fz); fa.scale.set(1, 1.2, 1)
    const fb = new THREE.Mesh(flameGeo, flameMatB); fb.position.set(fx, 0.15, fz); fb.scale.set(0.6, 0.8, 0.6)
    scene.add(fa, fb)
    flames.push({ mesh: fa, sx: 1, sy: 1.2, sz: 1, phase: rnd(0, 6) }, { mesh: fb, sx: 0.6, sy: 0.8, sz: 0.6, phase: rnd(0, 6) })
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a2a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    glowSprite.position.set(fx, 1, fz); glowSprite.scale.set(5, 5, 1)
    glowSprite.userData.phase = rnd(0, 6)
    scene.add(glowSprite)
    glows.push(glowSprite)
    for (const side of [-1, 1]) {
      const bench = addMesh(benchGeo, matWood2, fx + side * 2.6, 0.3, fz, { receive: false })
      bench.rotation.x = Math.PI / 2
    }
    addCrateStack(p.x + 6, p.z + 4)
  }

  // ---------- ruined stone walls ----------
  function addWallRun(cx, cz) {
    const alongX = Math.random() < 0.5
    let offset = -rnd(5, 8)
    const pieces = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < pieces; i++) {
      const len = rnd(3.5, 7), h = rnd(2.0, 3.8)
      const mid = offset + len / 2
      const dims = alongX ? [len, h, 0.9] : [0.9, h, len]
      const px = cx + (alongX ? mid : 0), pz = cz + (alongX ? 0 : mid)
      addMesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), matWall, px, h / 2, pz, { obstacle: true })
      for (let k = 0; k < 3; k++) stones.push([px + rnd(-len / 2, len / 2) * (alongX ? 1 : 0), h + 0.1, pz + rnd(-len / 2, len / 2) * (alongX ? 0 : 1), rnd(0.25, 0.5)])
      for (let k = 0; k < 6; k++) stones.push([px + rnd(-2.5, 2.5), 0.2, pz + rnd(-2.5, 2.5), rnd(0.2, 0.6)])
      offset += len + rnd(1.6, 2.6)
    }
  }
  for (let i = 0; i < 9; i++) { const p = findSpot(9, 92); if (p) addWallRun(p.x, p.z) }

  // ---------- watchtowers (climbable) ----------
  // Deck top is y = 7.25. The ladder is on the +z side. Walk up to it and press E (or hold W).
  // The deck is solid for bullets, and the front rail has a gap where the ladder reaches the deck.
  function addTower(x, z) {
    const legGeo = new THREE.CylinderGeometry(0.22, 0.28, 7, 8)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addMesh(legGeo, matWood, x + sx * 1.7, 3.5, z + sz * 1.7, { obstacle: true })
    addMesh(new THREE.BoxGeometry(4.6, 0.3, 4.6), matWood2, x, 7.1, z, { obstacle: true })

    const railX = new THREE.BoxGeometry(4.6, 0.15, 0.1), railZ = new THREE.BoxGeometry(0.1, 0.15, 4.6)
    addMesh(railX, matWood, x, 7.9, z - 2.25, { receive: false })
    for (const sgn of [-1, 1]) addMesh(railZ, matWood, x + sgn * 2.25, 7.9, z, { receive: false })
    const frontPiece = new THREE.BoxGeometry(1.65, 0.15, 0.1)
    for (const sgn of [-1, 1]) addMesh(frontPiece, matWood, x + sgn * 1.475, 7.9, z + 2.25, { receive: false })

    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.3, 6)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addMesh(postGeo, matWood, x + sx * 2.2, 8.3, z + sz * 2.2, { receive: false })
    const roofGeo = new THREE.ConeGeometry(3.6, 2.2, 4); roofGeo.rotateY(Math.PI / 4)
    addMesh(roofGeo, matCanvas[2], x, 10.6, z)

    // ladder: rails stick out above the deck so the top is easy to see
    const ladRail = new THREE.BoxGeometry(0.08, 8.4, 0.08), rungGeo = new THREE.BoxGeometry(0.8, 0.07, 0.07)
    for (const sx of [-0.4, 0.4]) addMesh(ladRail, matWood, x + sx, 4.2, z + 2.5, { receive: false })
    for (let i = 0; i < 15; i++) addMesh(rungGeo, matWood, x, 0.5 + i * 0.5, z + 2.5, { receive: false })

    platforms.push({ x, z, hw: 2.3, hd: 2.3, y: 7.25, gap: { x, hw: 0.65 } })
    ladders.push({ x, z: z + 2.5, bottom: 0, top: 7.25 })
  }
  for (let i = 0; i < 2; i++) { const p = findSpot(7, 88); if (p) addTower(p.x, p.z) }

  // ---------- wrecked trucks ----------
  function addTruck(x, z, alongX) {
    const rust = new THREE.MeshStandardMaterial({ color: pick([0x7a4b33, 0x4f5a3a, 0x5f6670]), roughness: 0.9, metalness: 0.3 })
    const rust2 = new THREE.MeshStandardMaterial({ color: 0x3d3f42, roughness: 0.9, metalness: 0.4 })
    const bd = alongX ? [5.2, 1.3, 2.4] : [2.4, 1.3, 5.2]
    addMesh(new THREE.BoxGeometry(bd[0], bd[1], bd[2]), rust, x, 1.15, z, { obstacle: true })
    const cd = alongX ? [1.9, 1.9, 2.3] : [2.3, 1.9, 1.9]
    const co = alongX ? [-2.9, 0] : [0, -2.9]
    addMesh(new THREE.BoxGeometry(cd[0], cd[1], cd[2]), rust2, x + co[0], 1.5, z + co[1], { obstacle: true })
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12)
    for (const along of [-2.5, 1.5]) {
      for (const side of [-1.25, 1.25]) {
        const w = addMesh(wheelGeo, rust2, alongX ? x + along : x + side, 0.55, alongX ? z + side : z + along, { receive: false })
        if (alongX) w.rotation.x = Math.PI / 2; else w.rotation.z = Math.PI / 2
      }
    }
  }
  for (let i = 0; i < 4; i++) { const p = findSpot(5, 92); if (p) addTruck(p.x, p.z, Math.random() < 0.5) }

  // ---------- crate stacks ----------
  for (let i = 0; i < 12; i++) { const p = findSpot(4, 94); if (p) addCrateStack(p.x, p.z) }

  // ---------- boulders ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0)
  const rockMats = [0x7b7a73, 0x6c6b66, 0x8a8478].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }))
  for (let i = 0; i < 16; i++) {
    const p = findSpot(3.5, 95)
    if (!p) continue
    const s = rnd(1.4, 3)
    const rock = addMesh(rockGeo, pick(rockMats), p.x, s * 0.55, p.z, { obstacle: true, ry: Math.random() * 6 })
    rock.scale.set(s * rnd(0.9, 1.4), s * rnd(0.7, 1.0), s * rnd(0.9, 1.4))
  }

  // ---------- lamp posts ----------
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.2, 8)
  const armGeo = new THREE.BoxGeometry(1, 0.08, 0.08)
  const shadeGeo = new THREE.ConeGeometry(0.34, 0.28, 10)
  const bulbGeo = new THREE.SphereGeometry(0.16, 10, 8)
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8 })
  for (let i = 0; i < 12; i++) {
    const p = findSpot(1.8, 94)
    if (!p) continue
    addMesh(poleGeo, matMetal, p.x, 2.6, p.z, { obstacle: true })
    addMesh(armGeo, matMetal, p.x + 0.5, 5.15, p.z, { cast: false })
    addMesh(shadeGeo, matMetal, p.x + 1, 5.15, p.z, { cast: false })
    addMesh(bulbGeo, bulbMat, p.x + 1, 4.95, p.z, { cast: false, receive: false })
  }

  // ---------- extra explosive barrels ----------
  const ringGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.08, 16)
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.5 })
  for (let i = 0; i < 14; i++) {
    const p = findSpot(1.6, 92)
    if (!p) continue
    const mat = new THREE.MeshStandardMaterial({ color: pick([0xa31a12, 0xa31a12, 0xb34a12]), metalness: 0.4, roughness: 0.6 })
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.5, 16), mat)
    barrel.position.set(p.x, 0.75, p.z)
    barrel.castShadow = true
    for (const y of [-0.45, 0.45]) { const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.y = y; barrel.add(ring) }
    scene.add(barrel)
    barrels.push(barrel)
  }

  // ---------- trees (solid inside the arena, backdrop forest outside) ----------
  const specs = []
  for (let i = 0; i < 70; i++) {
    const p = findSpot(3.2, 96)
    if (p) specs.push({ x: p.x, z: p.z, pine: Math.random() < 0.6, s: rnd(0.8, 1.3), solid: true })
  }
  for (let i = 0; i < 170; i++) {
    const a = Math.random() * Math.PI * 2, r = rnd(106, 196)
    specs.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, pine: Math.random() < 0.7, s: rnd(1.1, 1.9), solid: false })
  }
  const nPine = specs.filter(t => t.pine).length
  const nOak = specs.length - nPine
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 7); trunkGeo.translate(0, 0.5, 0)
  const coneGeo = new THREE.ConeGeometry(1, 1, 8); coneGeo.translate(0, 0.5, 0)
  const blobGeo = new THREE.IcosahedronGeometry(1, 1)
  const trunks = inst(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4630, roughness: 1, flatShading: true }), specs.length, true)
  const pineL = [0, 1, 2].map(() => inst(coneGeo, leafMat, nPine, true))
  const oakB = [0, 1].map(() => inst(blobGeo, leafMat, nOak, true))
  const proxyMat = new THREE.MeshBasicMaterial()
  let ti = 0, pi = 0, oi = 0
  for (const t of specs) {
    const s = t.s
    let trunkH, trunkR
    if (t.pine) {
      const H = 11 * s
      trunkH = H * 0.4; trunkR = 0.38 * s
      _col.setHSL(rnd(0.3, 0.36), rnd(0.4, 0.55), rnd(0.2, 0.28))
      for (let L = 0; L < 3; L++) {
        const rad = H * 0.27 * (1 - L * 0.25)
        put(pineL[L], pi, t.x, trunkH * 0.5 + L * H * 0.2, t.z, rad, H * 0.34, rad, Math.random() * 6, _col)
      }
      pi++
    } else {
      trunkH = 4 * s; trunkR = 0.55 * s
      _col.setHSL(rnd(0.22, 0.3), rnd(0.45, 0.6), rnd(0.28, 0.38))
      put(oakB[0], oi, t.x, trunkH + 1.3 * s, t.z, 3.1 * s, 2.5 * s, 3.1 * s, Math.random() * 6, _col)
      put(oakB[1], oi, t.x + rnd(-1.6, 1.6) * s, trunkH + 0.6 * s, t.z + rnd(-1.6, 1.6) * s, 2.1 * s, 1.7 * s, 2.1 * s, Math.random() * 6, _col)
      oi++
    }
    put(trunks, ti++, t.x, 0, t.z, trunkR, trunkH, trunkR, 0)

    // shelf fungi growing out of the trunk
    if (t.solid && Math.random() < 0.55) {
      const base = Math.random() * Math.PI * 2
      const nb = 1 + Math.floor(Math.random() * 3)
      const maxH = Math.min(trunkH * 0.85, t.pine ? trunkH * 0.45 : 3)
      for (let b = 0; b < nb; b++) {
        const hh = rnd(0.6, Math.max(0.7, maxH))
        const a = base + b * rnd(0.5, 1.2)
        const rad = trunkR * (1 - 0.3 * hh / trunkH) * 0.92
        brackets.push({ x: t.x + Math.cos(a) * rad, y: hh, z: t.z + Math.sin(a) * rad, nx: Math.cos(a), nz: Math.sin(a), size: rnd(0.28, 0.6) * Math.min(1.3, s) })
      }
    }

    if (t.solid) {
      // invisible collider (not added to the scene) used by the game's collision + line-of-sight code
      const proxy = new THREE.Mesh(trunkGeo, proxyMat)
      proxy.position.set(t.x, 0, t.z)
      proxy.scale.set(trunkR * 1.5, trunkH, trunkR * 1.5)
      proxy.updateMatrixWorld(true)
      obstacles.push(proxy)
    }
  }
  scene.add(finish(trunks), ...pineL.map(finish), ...oakB.map(finish))

  // ---------- mushrooms (all kinds) ----------
  const mush = buildMushrooms(scene, obstacles, { occupied, findSpot, glowTex, brackets, anchors: specs.filter(t => t.solid) })

  // ---------- rubble / shore stones / lily pads ----------
  const rubble = inst(new THREE.DodecahedronGeometry(1, 0), stoneMat, stones.length, true)
  stones.forEach((st, i) => {
    _col.setHSL(0.1, rnd(0, 0.08), rnd(0.36, 0.56))
    put(rubble, i, st[0], st[1], st[2], st[3], st[3] * 0.7, st[3], Math.random() * 6, _col)
  })
  scene.add(finish(rubble))

  const lilyGeo = new THREE.CircleGeometry(0.5, 10); lilyGeo.rotateX(-Math.PI / 2)
  const lily = inst(lilyGeo, new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), lilies.length)
  lilies.forEach((l, i) => { const s = rnd(0.6, 1.3); put(lily, i, l[0], 0.07, l[1], s, 1, s, Math.random() * 6) })
  scene.add(finish(lily))

  // ---------- per-frame animation ----------
  function update(dt, t) {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt
      if (c.position.x > 400) c.position.x = -400
    }
    for (const f of flames) {
      const k = 1 + Math.sin(t * 13 + f.phase) * 0.14 + Math.sin(t * 27 + f.phase * 2) * 0.08
      f.mesh.scale.set(f.sx * (2 - k), f.sy * k, f.sz * (2 - k))
    }
    for (const g of glows) g.material.opacity = 0.5 + Math.sin(t * 11 + g.userData.phase) * 0.12
    dust.position.y = Math.sin(t * 0.4) * 0.4
    dust.rotation.y = t * 0.01
    bulbMat.color.setHSL(0.13, 1, 0.82 + Math.sin(t * 3) * 0.04)
    waterMat.color.setHSL(0.55, 0.6, 0.4 + Math.sin(t * 0.8) * 0.02)
    mush.update(t)
  }

  return { update, platforms, ladders }
}
