import * as THREE from 'three'

// First-person weapon models.
// Each model is built so its sight line sits at a known height (sightY). The aim-down-sights pose
// then places the model at (0, -sightY, adsZ) in camera space, which puts the sights exactly in the
// centre of the screen, on the same line the bullets travel along.

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function makeMats(accent) {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.85, roughness: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.25, roughness: 0.75 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4426, metalness: 0, roughness: 0.7 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0, roughness: 0.95 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x242a30, metalness: 0, roughness: 0.9 }),
    accent: new THREE.MeshBasicMaterial({ color: accent }),
    dot: new THREE.MeshBasicMaterial({ color: 0xffffff })
  }
}

function box(parent, mat, w, h, d, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.rotation.x = rx
  parent.add(m)
  return m
}

// cylinder lying along the z axis; r1 is the rear (player side) radius, r2 the front radius
function cyl(parent, mat, r1, r2, len, x, y, z, seg = 14) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg)
  g.rotateX(Math.PI / 2)
  const m = new THREE.Mesh(g, mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}

function ball(parent, mat, r, x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}

// capsule from point a to point b (used for hands and forearms)
function limb(parent, mat, a, b, r) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 8), mat)
  m.position.copy(a).addScaledVector(dir, 0.5)
  m.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize())
  parent.add(m)
  return m
}

function anchor(parent, x, y, z) {
  const o = new THREE.Object3D()
  o.position.set(x, y, z)
  parent.add(o)
  return o
}

// ---------------------------------------------------------------- pistol
function buildPistol(color) {
  const M = makeMats(color)
  const group = new THREE.Group()

  // slide (moves back when firing)
  const slide = new THREE.Group()
  group.add(slide)
  box(slide, M.steel, 0.034, 0.04, 0.24, 0, 0, -0.08)
  box(slide, M.accent, 0.0365, 0.006, 0.1, 0, 0.003, -0.11)
  // iron sights: post up front, notch at the back, white dots on both
  box(slide, M.steel, 0.006, 0.014, 0.012, 0, 0.027, -0.19)
  box(slide, M.dot, 0.003, 0.003, 0.002, 0, 0.032, -0.1965)
  box(slide, M.steel, 0.009, 0.012, 0.012, -0.0105, 0.026, 0.02)
  box(slide, M.steel, 0.009, 0.012, 0.012, 0.0105, 0.026, 0.02)
  box(slide, M.dot, 0.003, 0.003, 0.002, -0.0105, 0.029, 0.0265)
  box(slide, M.dot, 0.003, 0.003, 0.002, 0.0105, 0.029, 0.0265)

  cyl(group, M.steel, 0.011, 0.011, 0.04, 0, 0.004, -0.215)
  box(group, M.dark, 0.03, 0.03, 0.2, 0, -0.035, -0.07)
  box(group, M.accent, 0.032, 0.004, 0.14, 0, -0.052, -0.07)
  box(group, M.dark, 0.032, 0.1, 0.05, 0, -0.09, 0.03, -0.2)
  box(group, M.steel, 0.006, 0.02, 0.006, 0, -0.055, -0.015)
  box(group, M.dark, 0.006, 0.008, 0.05, 0, -0.068, -0.045)

  // two-handed grip
  limb(group, M.glove, V(0.002, -0.07, 0.045), V(0.002, -0.125, 0.055), 0.027)
  limb(group, M.sleeve, V(0.004, -0.115, 0.06), V(0.07, -0.25, 0.42), 0.033)
  limb(group, M.glove, V(-0.036, -0.06, -0.005), V(-0.034, -0.11, 0.0), 0.022)
  limb(group, M.sleeve, V(-0.04, -0.1, 0.0), V(-0.13, -0.26, 0.4), 0.03)

  return {
    group,
    muzzle: anchor(group, 0, 0.004, -0.24),
    eject: anchor(group, 0.02, 0.012, -0.03),
    cycle: slide, cycleBaseZ: 0, cycleDist: 0.034, cycleTime: 0.11, cycleDelay: 0,
    hip: V(0.15, -0.135, -0.36),
    ads: V(0, -0.03, -0.3)
  }
}

// ---------------------------------------------------------------- shotgun (pump action)
function buildShotgun(color) {
  const M = makeMats(color)
  const group = new THREE.Group()

  box(group, M.steel, 0.046, 0.058, 0.22, 0, 0, 0)
  box(group, M.accent, 0.048, 0.006, 0.1, 0, 0.012, 0)
  cyl(group, M.steel, 0.017, 0.017, 0.56, 0, 0.012, -0.39)
  cyl(group, M.steel, 0.013, 0.013, 0.46, 0, -0.026, -0.34)
  box(group, M.steel, 0.012, 0.006, 0.5, 0, 0.03, -0.37)        // ventilated rib
  ball(group, M.dot, 0.005, 0, 0.036, -0.66)                     // front bead
  ball(group, M.dot, 0.003, 0, 0.034, -0.35)                     // mid bead

  // pump handle (slides back after each shot)
  const pump = new THREE.Group()
  pump.position.set(0, -0.026, -0.3)
  group.add(pump)
  box(pump, M.wood, 0.052, 0.042, 0.17, 0, 0, 0)
  box(pump, M.accent, 0.054, 0.044, 0.008, 0, 0, 0.088)
  limb(pump, M.glove, V(0, -0.03, -0.06), V(0, -0.03, 0.06), 0.03)

  box(group, M.wood, 0.036, 0.062, 0.2, 0, -0.045, 0.2)
  box(group, M.wood, 0.034, 0.1, 0.045, 0, -0.07, 0.085, -0.28)
  box(group, M.steel, 0.006, 0.022, 0.006, 0, -0.045, 0.0)

  limb(group, M.glove, V(0, -0.04, 0.08), V(0, -0.1, 0.095), 0.028)
  limb(group, M.sleeve, V(0, -0.095, 0.1), V(0.08, -0.24, 0.45), 0.034)
  limb(group, M.sleeve, V(-0.01, -0.05, -0.25), V(-0.12, -0.25, 0.2), 0.034)

  return {
    group,
    muzzle: anchor(group, 0, 0.012, -0.7),
    eject: anchor(group, 0.026, 0.012, -0.02),
    cycle: pump, cycleBaseZ: pump.position.z, cycleDist: 0.11, cycleTime: 0.6, cycleDelay: 0.25,
    hip: V(0.17, -0.17, -0.5),
    ads: V(0, -0.038, -0.38)
  }
}

// ---------------------------------------------------------------- sniper (bolt action + scope)
function buildSniper(color) {
  const M = makeMats(color)
  const group = new THREE.Group()

  box(group, M.steel, 0.04, 0.052, 0.24, 0, 0, 0)
  cyl(group, M.steel, 0.015, 0.011, 0.62, 0, 0.004, -0.43)
  cyl(group, M.dark, 0.02, 0.02, 0.07, 0, 0.004, -0.77)
  cyl(group, M.accent, 0.0205, 0.0205, 0.008, 0, 0.004, -0.745)
  box(group, M.dark, 0.046, 0.046, 0.3, 0, -0.012, -0.25)
  box(group, M.dark, 0.042, 0.07, 0.26, 0, -0.012, 0.22)
  box(group, M.dark, 0.036, 0.03, 0.14, 0, 0.04, 0.24)
  box(group, M.dark, 0.034, 0.09, 0.042, 0, -0.07, 0.11, -0.3)
  box(group, M.steel, 0.03, 0.06, 0.06, 0, -0.05, -0.04)

  // scope
  box(group, M.steel, 0.02, 0.03, 0.02, 0, 0.04, -0.06)
  box(group, M.steel, 0.02, 0.03, 0.02, 0, 0.04, 0.08)
  cyl(group, M.dark, 0.02, 0.02, 0.26, 0, 0.068, 0)
  cyl(group, M.dark, 0.02, 0.03, 0.06, 0, 0.068, -0.15)
  cyl(group, M.dark, 0.03, 0.022, 0.05, 0, 0.068, 0.15)
  cyl(group, M.accent, 0.0225, 0.0225, 0.008, 0, 0.068, 0.02)

  // bolt handle (cycles back after each shot)
  const bolt = new THREE.Group()
  bolt.position.set(0, 0.012, 0.05)
  group.add(bolt)
  cyl(bolt, M.steel, 0.009, 0.009, 0.1, 0, 0, 0)
  box(bolt, M.steel, 0.045, 0.01, 0.012, 0.03, 0, 0.04)
  ball(bolt, M.dark, 0.013, 0.058, 0, 0.04)

  limb(group, M.glove, V(0, -0.045, 0.115), V(0, -0.105, 0.125), 0.028)
  limb(group, M.sleeve, V(0, -0.1, 0.13), V(0.08, -0.24, 0.45), 0.034)
  limb(group, M.glove, V(0, -0.04, -0.32), V(0, -0.04, -0.2), 0.03)
  limb(group, M.sleeve, V(0, -0.05, -0.22), V(-0.12, -0.25, 0.15), 0.034)

  return {
    group,
    muzzle: anchor(group, 0, 0.004, -0.81),
    eject: anchor(group, 0.02, 0.012, 0.0),
    cycle: bolt, cycleBaseZ: bolt.position.z, cycleDist: 0.09, cycleTime: 1.1, cycleDelay: 0.2,
    hip: V(0.17, -0.18, -0.46),
    ads: V(0, -0.068, -0.3)
  }
}

function flashTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,230,1)')
  grad.addColorStop(0.25, 'rgba(255,200,90,0.85)')
  grad.addColorStop(1, 'rgba(255,120,20,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(255,220,140,0.9)'
  for (let i = 0; i < 4; i++) {
    g.save()
    g.translate(64, 64)
    g.rotate((i * Math.PI) / 4)
    g.beginPath()
    g.moveTo(-62, 0); g.lineTo(0, -4); g.lineTo(62, 0); g.lineTo(0, 4)
    g.closePath()
    g.fill()
    g.restore()
  }
  return new THREE.CanvasTexture(c)
}

export function buildGuns(weaponConfig) {
  const models = {
    pistol: buildPistol(weaponConfig.pistol.color),
    shotgun: buildShotgun(weaponConfig.shotgun.color),
    sniper: buildSniper(weaponConfig.sniper.color)
  }
  for (const m of Object.values(models)) {
    m.group.traverse((o) => { o.frustumCulled = false })
    m.group.position.copy(m.hip)
  }

  // One muzzle flash + light shared by all guns. It gets re-parented to the active gun's muzzle.
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  })
  const flash = new THREE.Group()
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat)
  const core = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), flashMat)
  core.rotation.z = Math.PI / 4
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), flashMat)
  streak.rotation.y = Math.PI / 2
  streak.position.z = -0.1
  flash.add(front, core, streak)
  flash.visible = false

  const light = new THREE.PointLight(0xffb060, 0, 6)

  return { models, flash, light }
}
