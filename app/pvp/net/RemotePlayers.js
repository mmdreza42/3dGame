// Remote players as simple capsule-like figures with name tags, fed by NetClient.sample().
// Feet position is the origin; yaw uses the same convention as the local camera (forward = -Z at yaw 0).
// Names are drawn on a canvas with fillText only (never HTML).
import * as THREE from 'three'

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
  constructor(scene, T = THREE) {
    this.scene = scene
    this.T = T
    this.map = new Map() // id -> { group, name, mat, tagMat, tagTex }
    this.bodyGeo = new T.CylinderGeometry(0.35, 0.35, 1.1, 12)
    this.headGeo = new T.SphereGeometry(0.25, 12, 8)
    this.noseGeo = new T.BoxGeometry(0.12, 0.1, 0.3)
  }

  get count() { return this.map.size }

  update(list) {
    const seen = new Set()
    for (const p of list) {
      seen.add(p.id)
      let e = this.map.get(p.id)
      if (e && e.name !== p.name) { this._remove(p.id); e = null }
      if (!e) { e = this._create(p); this.map.set(p.id, e) }
      e.group.position.set(p.x, p.y, p.z)
      e.group.rotation.y = p.yaw
    }
    for (const id of [...this.map.keys()]) if (!seen.has(id)) this._remove(id)
  }

  _create(p) {
    const T = this.T
    const color = new T.Color().setHSL((p.slot % 16) / 16, 0.8, 0.5)
    const mat = new T.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 })
    const group = new T.Group()
    const body = new T.Mesh(this.bodyGeo, mat); body.position.y = 0.65
    const head = new T.Mesh(this.headGeo, mat); head.position.y = 1.45
    const nose = new T.Mesh(this.noseGeo, mat); nose.position.set(0, 1.45, -0.3) // points along -Z = forward
    group.add(body, head, nose)
    const e = { group, name: p.name, mat, tagMat: null, tagTex: null }
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

  _remove(id) {
    const e = this.map.get(id)
    if (!e) return
    this.scene.remove(e.group)
    e.mat.dispose()
    if (e.tagMat) e.tagMat.dispose()
    if (e.tagTex) e.tagTex.dispose()
    this.map.delete(id)
  }

  dispose() {
    for (const id of [...this.map.keys()]) this._remove(id)
    this.bodyGeo.dispose(); this.headGeo.dispose(); this.noseGeo.dispose()
  }
}
