// Remote players as simple capsule-like figures with name tags, fed by NetClient.sample().
// Feet position is the origin; yaw uses the same convention as the local camera (forward = -Z at yaw 0).
// Names are drawn on a canvas with fillText only (never HTML).
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { teamOf, TEAM_COLORS } from '../../../shared/combat.js'

function makeTag(T, name) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 64
  const ctx = canvas.getContext && canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = "bold 28px 'Courier New', monospace"
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#000'; ctx.lineWidth = 6
  ctx.strokeText(name, 128, 32)
  ctx.fillStyle = '#00ffff'
  ctx.fillText(name, 128, 32)
  return new T.CanvasTexture(canvas)
}

export class RemotePlayers {
  // T is injectable so the bookkeeping can be unit-tested without WebGL
  // opts (all optional): getSoldier() -> gltf|null, cloneModel(scene) -> model, now() -> ms
  constructor(scene, T = THREE, opts = {}) {
    this.scene = scene
    this.T = T
    this.getSoldier = opts.getSoldier || null
    this.cloneModel = opts.cloneModel || SkeletonUtils.clone
    this.now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
    this.lastT = null
    this.gunGeo = null
    this.gunMat = null
    this.map = new Map() // id -> { group, name, mat, tagMat, tagTex }
    this.bodyGeo = new T.CylinderGeometry(0.35, 0.35, 1.1, 12)
    this.headGeo = new T.SphereGeometry(0.25, 12, 8)
    this.noseGeo = new T.BoxGeometry(0.12, 0.1, 0.3)
  }

  get count() { return this.map.size }

  update(list) {
    const nowMs = this.now()
    const dt = this.lastT === null ? 0 : Math.min(0.1, Math.max(0, (nowMs - this.lastT) / 1000))
    this.lastT = nowMs
    const seen = new Set()
    for (const p of list) {
      seen.add(p.id)
      let e = this.map.get(p.id)
      if (e && (e.name !== p.name || (e.kind === 'capsule' && this._soldier()))) { this._remove(p.id); e = null }
      if (!e) { e = this._create(p); this.map.set(p.id, e) }
      if (e.mixer) {
        const speed = dt > 0 ? Math.hypot(p.x - e.lx, p.z - e.lz) / dt : 0
        e.spd = e.spd * 0.7 + speed * 0.3
        this._anim(e)
        e.mixer.update(dt)
      }
      e.lx = p.x; e.lz = p.z
      e.group.position.set(p.x, p.y, p.z)
      e.group.rotation.y = p.yaw
    }
    for (const id of [...this.map.keys()]) if (!seen.has(id)) this._remove(id)
  }

  _create(p) {
    const gltf = this._soldier()
    if (gltf) return this._createSoldier(p, gltf)
    const T = this.T
    const color = new T.Color(TEAM_COLORS[teamOf(p.slot)])
    const mat = new T.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 })
    const group = new T.Group()
    const body = new T.Mesh(this.bodyGeo, mat); body.position.y = 0.65
    const head = new T.Mesh(this.headGeo, mat); head.position.y = 1.45
    const nose = new T.Mesh(this.noseGeo, mat); nose.position.set(0, 1.45, -0.3) // points along -Z = forward
    group.add(body, head, nose)
    const e = { group, name: p.name, kind: 'capsule', mat, tagMat: null, tagTex: null }
    const tex = makeTag(T, p.name)
    if (tex) {
      const tagMat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
      const sprite = new T.Sprite(tagMat)
      sprite.position.y = 2.2
      sprite.scale.set(2, 0.5, 1)
      group.add(sprite)
      e.tagMat = tagMat; e.tagTex = tex
    }
    this.scene.add(group)
    return e
  }

  _soldier() {
    return this.getSoldier ? (this.getSoldier() || null) : null
  }

  _createSoldier(p, gltf) {
    const T = this.T
    const group = new T.Group()
    const model = this.cloneModel(gltf.scene)
    model.rotation.y = 0 // match the local player orientation; group yaw supplies facing
    const tint = new T.Color(TEAM_COLORS[teamOf(p.slot)]).lerp(new T.Color(0xffffff), 0.35)
    const mats = []
    model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      const own = (mat) => { const c = mat.clone(); if (c.color) c.color.copy(tint); mats.push(c); return c }
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material)
    })
    group.add(model)
    if (!this.gunGeo) {
      this.gunGeo = new T.BoxGeometry(0.08, 0.12, 0.55)
      this.gunMat = new T.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 })
    }
    const gun = new T.Mesh(this.gunGeo, this.gunMat)
    gun.position.set(0.22, 1.15, -0.4)
    group.add(gun)
    const e = { group, name: p.name, kind: 'soldier', mats, mat: null, tagMat: null, tagTex: null, mixer: null, actions: null, state: '', spd: 0, lx: p.x, lz: p.z }
    const clips = gltf.animations || []
    if (clips.length) {
      const find = (n) => clips.find((a) => String(a.name).toLowerCase() === n) || clips[0]
      const mixer = new T.AnimationMixer(model)
      e.mixer = mixer
      e.actions = { idle: mixer.clipAction(find('idle')), walk: mixer.clipAction(find('walk')), run: mixer.clipAction(find('run')) }
      e.actions.idle.play()
      e.state = 'idle'
    }
    const tex = makeTag(T, p.name)
    if (tex) {
      const tagMat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
      const sprite = new T.Sprite(tagMat)
      sprite.position.y = 2.15
      sprite.scale.set(2, 0.5, 1)
      group.add(sprite)
      e.tagMat = tagMat; e.tagTex = tex
    }
    this.scene.add(group)
    return e
  }

  _anim(e) {
    const target = e.spd > 5 ? 'run' : e.spd > 0.6 ? 'walk' : 'idle'
    if (target === e.state) return
    const prev = e.actions[e.state]
    const next = e.actions[target]
    e.state = target
    if (prev === next) return
    next.reset()
    next.play()
    if (prev) prev.crossFadeTo(next, 0.2, false)
  }

  takeForRagdoll(id) {
    const e = this.map.get(id)
    if (!e) return null
    this.map.delete(id)
    if (e.mixer) e.mixer.stopAllAction()
    let cleaned = false
    return {
      mesh: e.group,
      cleanup: () => {
        if (cleaned) return
        cleaned = true
        if (e.mat) e.mat.dispose()
        if (e.mats) for (const m of e.mats) m.dispose()
        if (e.tagMat) e.tagMat.dispose()
        if (e.tagTex) e.tagTex.dispose()
      },
    }
  }

  _remove(id) {
    const e = this.map.get(id)
    if (!e) return
    this.scene.remove(e.group)
    if (e.mat) e.mat.dispose()
    if (e.mats) for (const m of e.mats) m.dispose()
    if (e.mixer) e.mixer.stopAllAction()
    if (e.tagMat) e.tagMat.dispose()
    if (e.tagTex) e.tagTex.dispose()
    this.map.delete(id)
  }

  dispose() {
    for (const id of [...this.map.keys()]) this._remove(id)
    this.bodyGeo.dispose(); this.headGeo.dispose(); this.noseGeo.dispose()
    if (this.gunGeo) this.gunGeo.dispose()
    if (this.gunMat) this.gunMat.dispose()
  }
}
