import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

const TINT = {
  normal: null, runner: 0xffa566, tank: 0xb497ff, sniper: 0xffe680,
  bomber: 0xff8060, elite: 0x7fe0ff, boss: 0xff6a6a
}
const GLOW = { boss: [0x550000, 0.7], tank: [0x22005a, 0.25], elite: [0x00364d, 0.45] }

const metal = (color, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.4, emissive, emissiveIntensity: ei })
const glow = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: false })

let _laserGeo = null
function laserGeo() {
  if (!_laserGeo) {
    _laserGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5)
    _laserGeo.rotateX(Math.PI / 2)
    _laserGeo.translate(0, 0, 0.5)
  }
  return _laserGeo
}

// Extra per-enemy state used by the AI + visuals
export function enemyExtras(type, cfg) {
  return {
    shield: cfg.shield || 0,
    maxShield: cfg.shield || 0,
    losT: 0, los: true, dist: 99,
    burstLeft: 3, dashT: 0, dashCd: 1 + Math.random() * 2,
    flashT: 0, fuse: -1, phase: 1, ringT: 2,
    seed: Math.random() * 10,
    heavy: type === 'boss' || type === 'elite'
  }
}

function addDecor(m, e, u) {
  const s = e.scale
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; m.add(mesh); return mesh }
  const addGlow = (mesh, x, y, z) => { mesh.position.set(x, y, z); m.add(mesh); return mesh }

  switch (e.type) {
    case 'tank': {
      const plate = metal(0x34285c, 0x7a2cff, 0.6)
      for (const side of [-1, 1]) {
        const sh = add(new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.17 * s, 0.46 * s), plate), side * 0.4 * s, 1.42 * s, 0)
        sh.rotation.z = -side * 0.3
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.22 * s, 0.035 * s, 6, 18), glow(0xb27bff))
      halo.rotation.x = Math.PI / 2
      addGlow(halo, 0, 1.95 * s, 0)
      break
    }
    case 'sniper': {
      const hat = metal(0x4a3b22)
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.03 * s, 14), hat), 0, 1.72 * s, 0)
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.17 * s, 0.14 * s, 12), hat), 0, 1.8 * s, 0)
      const laser = new THREE.Mesh(laserGeo(), new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.55, fog: false, depthWrite: false }))
      laser.position.set(0.25 * s, 1.2 * s, 0)
      laser.visible = false
      m.add(laser)
      u.laser = laser
      break
    }
    case 'bomber': {
      const stick = metal(0xaa1a10, 0xff2200, 0.5)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.34 * s, 8), stick), Math.cos(a) * 0.27 * s, 1.08 * s, Math.sin(a) * 0.27 * s)
      }
      u.lamp = addGlow(new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 10, 8), glow(0xff2200)), 0, 1.95 * s, 0)
      break
    }
    case 'elite': {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2 * s, 0.03 * s, 6, 18), glow(0x66e6ff))
      halo.rotation.x = Math.PI / 2
      addGlow(halo, 0, 1.95 * s, 0)
      for (const side of [-1, 1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.5 * s, 0.2 * s), glow(0x66e6ff))
        blade.rotation.z = -side * 0.25
        addGlow(blade, side * 0.42 * s, 1.35 * s, -0.05)
      }
      const shield = new THREE.Mesh(
        new THREE.SphereGeometry(1.15 * s, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0x55ddff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      )
      addGlow(shield, 0, 0.95 * s, 0)
      u.shield = shield
      break
    }
    case 'boss': {
      const horn = metal(0x2a0a0a, 0xff2200, 0.8)
      for (const side of [-1, 1]) {
        const h = add(new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.5 * s, 8), horn), side * 0.17 * s, 1.95 * s, 0)
        h.rotation.z = -side * 0.35
        const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.4 * s, 8), horn), side * 0.5 * s, 1.55 * s, 0)
        sp.rotation.z = -side * 1.2
      }
      const aura = new THREE.Mesh(
        new THREE.RingGeometry(1.1 * s, 1.3 * s, 48),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false })
      )
      aura.rotation.x = -Math.PI / 2
      aura.position.y = 0.06
      m.add(aura)
      u.aura = aura
      break
    }
    default:
      break
  }
}

export function buildEnemyMesh(e, soldier) {
  const s = e.scale
  const m = new THREE.Group()
  m.name = e.id
  const u = m.userData
  u.mats = []
  const [gc, gi] = GLOW[e.type] || [0x000000, 0]
  u.glowColor = gc
  u.glowI = gi

  // gun
  const gunGroup = new THREE.Group()
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 })
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.6), gunMat)
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), gunMat)
  gunBarrel.rotation.x = Math.PI / 2
  gunBarrel.position.z = -0.5
  gunGroup.add(gunBody, gunBarrel)
  gunGroup.position.set(0.25 * s, 1.2 * s, 0.5 * s)
  gunGroup.scale.setScalar(Math.pow(s, 0.8))
  if (e.type === 'sniper') gunGroup.scale.z *= 1.6
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  )
  flash.position.set(0, 0, -0.8)
  flash.visible = false
  gunGroup.add(flash)
  u.flash = flash
  m.add(gunGroup)

  // body
  if (soldier) {
    const model = SkeletonUtils.clone(soldier.scene)
    model.rotation.y = Math.PI
    model.scale.setScalar(s)
    const tint = TINT[e.type] ? new THREE.Color(TINT[e.type]).lerp(new THREE.Color(0xffffff), 0.3) : null
    model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      const own = (mat) => {
        const c = mat.clone()
        if (tint && c.color) c.color.copy(tint)
        if (c.emissive) u.mats.push(c)
        return c
      }
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material)
    })
    m.add(model)
    if (soldier.animations.length) {
      const mixer = new THREE.AnimationMixer(model)
      mixer.timeScale = e.type === 'runner' ? 1.4 : e.type === 'boss' ? 0.7 : 1
      const run = mixer.clipAction(soldier.animations.find(a => a.name.toLowerCase().includes('run')) || soldier.animations[0])
      const idle = mixer.clipAction(soldier.animations.find(a => a.name.toLowerCase().includes('idle')) || soldier.animations[0])
      idle.play()
      const bones = {}
      model.traverse(o => { if (o.isBone) bones[o.name] = o })
      Object.assign(u, { mixer, run, idle, state: 'idle', bones })
    }
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: TINT[e.type] || 0xcc3333, roughness: 0.7 })
    u.mats.push(mat)
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * s, 1.1 * s, 4, 10), mat)
    body.position.y = 0.85 * s
    body.castShadow = true
    m.add(body)
  }

  if (e.weakPoint) {
    const weak = new THREE.Mesh(new THREE.SphereGeometry(0.25 * s, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff7a00 }))
    weak.position.set(0, 1.0 * s, -0.6 * s)
    m.add(weak)
  }

  addDecor(m, e, u)

  // health (+ shield) bar
  const barW = 1.1 * Math.max(1, s * 0.9)
  const bar = new THREE.Group()
  bar.position.y = 2.25 * s + 0.4
  const sprite = (color, w, h, order, y = 0) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, fog: false, transparent: true, depthWrite: false }))
    sp.center.set(0, 0.5)
    sp.position.set(-w / 2, y, 0)
    sp.scale.set(w, h, 1)
    sp.renderOrder = order
    bar.add(sp)
    return sp
  }
  sprite(0x000000, barW + 0.08, 0.2, 20).material.opacity = 0.65
  u.hpFill = sprite(0x00ff66, barW, 0.12, 21)
  if (e.maxShield > 0) {
    sprite(0x000000, barW + 0.08, 0.1, 20, -0.17).material.opacity = 0.65
    u.shFill = sprite(0x55ddff, barW, 0.06, 21, -0.17)
  }
  bar.visible = false
  m.add(bar)
  u.hpBar = bar
  u.barW = barW

  return m
}

export function updateEnemyVisuals(m, e, dt) {
  const u = m.userData
  const t = performance.now() / 1000

  if (e.flashT > 0) e.flashT -= dt
  if (u.flash) u.flash.visible = e.flashT > 0

  // emissive: hit flash / glow per type
  if (u.mats) {
    let col = u.glowColor
    let inten = u.glowI
    if (e.hitT > 0) { col = 0xffffff; inten = 0.9 }
    else if (e.type === 'bomber') {
      col = 0xff2200
      inten = e.fuse > 0 ? (Math.sin(t * 40) > 0 ? 1.4 : 0.1) : 0.15 + 0.1 * Math.sin(t * 5)
    } else if (e.type === 'boss') inten = 0.6 + 0.3 * Math.sin(t * 3)
    for (const mat of u.mats) { mat.emissive.setHex(col); mat.emissiveIntensity = inten }
  }

  if (u.hpBar) {
    const show = e.hp < e.maxHp || e.shield < e.maxShield || e.type === 'boss'
    u.hpBar.visible = show
    if (show) {
      const r = Math.max(0, e.hp / e.maxHp)
      u.hpFill.scale.x = Math.max(0.001, u.barW * r)
      u.hpFill.material.color.setHSL(r * 0.33, 1, 0.5)
      if (u.shFill) u.shFill.scale.x = Math.max(0.001, u.barW * (e.shield / e.maxShield))
    }
  }
  if (u.shield) {
    u.shield.visible = e.shield > 0
    u.shield.material.opacity = 0.12 + 0.06 * Math.sin(t * 4) + (e.hitT > 0 ? 0.25 : 0)
  }
  if (u.aura) {
    const k = 1 + 0.06 * Math.sin(t * 3)
    u.aura.scale.set(k, k, 1)
  }
  if (u.lamp) u.lamp.scale.setScalar(1 + 0.4 * Math.sin(t * (e.fuse > 0 ? 40 : 6)))
  if (u.laser) {
    const on = e.los && e.attackT > 0 && e.attackT < 0.9 && e.dist < e.attackDist
    u.laser.visible = on
    if (on) u.laser.scale.z = Math.min(e.dist, 120)
  }
}

export function hideEnemyExtras(m) {
  const u = m.userData
  for (const k of ['hpBar', 'laser', 'shield', 'aura']) if (u[k]) u[k].visible = false
  if (u.mats) for (const mat of u.mats) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0 }
}
