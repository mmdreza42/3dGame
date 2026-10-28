import { describe, it, expect } from 'vitest'
import { RemotePlayers } from '../../app/pvp/net/RemotePlayers.js'

class V3 { constructor() { this.x = 0; this.y = 0; this.z = 0 } set(x, y, z) { this.x = x; this.y = y; this.z = z } }
class Col { setHSL() { return this } lerp() { return this } copy() { return this } }
class Obj { constructor() { this.position = new V3(); this.rotation = { y: 0 }; this.scale = new V3(); this.children = [] } add(...c) { this.children.push(...c) } }
class Geo { constructor() { this.disposed = false } dispose() { this.disposed = true } }
class Mat { constructor() { this.disposed = false; this.color = new Col() } dispose() { this.disposed = true } clone() { return new Mat() } }
class Mixer {
  constructor() { this.updates = 0; this.stopped = false }
  clipAction(clip) { return { clip, plays: 0, play() { this.plays++ }, reset() { return this }, crossFadeTo() {} } }
  update() { this.updates++ }
  stopAllAction() { this.stopped = true }
}
const FakeTHREE = {
  CylinderGeometry: Geo, SphereGeometry: Geo, BoxGeometry: Geo,
  MeshStandardMaterial: Mat, SpriteMaterial: Mat, CanvasTexture: Mat,
  Color: Col, Group: Obj, Mesh: Obj, Sprite: Obj, AnimationMixer: Mixer,
}
const mkScene = () => ({ items: [], add(o) { this.items.push(o) }, remove(o) { this.items = this.items.filter((x) => x !== o) } })
const P = (id, name, x = 0) => ({ id, name, slot: id, x, y: 0, z: 0, yaw: 0, pitch: 0, w: 0 })
const GLTF = { scene: {}, animations: [{ name: 'Idle' }, { name: 'Walk' }, { name: 'Run' }, { name: 'TPose' }] }
const mkModel = () => {
  const mesh = { isMesh: true, material: new Mat(), castShadow: false }
  return { rotation: { y: 0 }, traverse(fn) { fn(mesh) } }
}

describe('RemotePlayers with the soldier model', () => {
  it('uses the soldier when the model is loaded', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE, { getSoldier: () => GLTF, cloneModel: mkModel, now: () => 0 })
    r.update([P(2, 'BOB')])
    expect(r.map.get(2).kind).toBe('soldier')
    expect(scene.items.length).toBe(1)
  })
  it('starts as a capsule and upgrades when the model arrives', () => {
    const scene = mkScene()
    let gltf = null
    const r = new RemotePlayers(scene, FakeTHREE, { getSoldier: () => gltf, cloneModel: mkModel, now: () => 0 })
    r.update([P(2, 'BOB')])
    expect(r.map.get(2).kind).toBe('capsule')
    gltf = GLTF
    r.update([P(2, 'BOB')])
    expect(r.map.get(2).kind).toBe('soldier')
    expect(scene.items.length).toBe(1)
  })
  it('runs when moving fast and idles when standing', () => {
    const scene = mkScene()
    let t = 0
    const r = new RemotePlayers(scene, FakeTHREE, { getSoldier: () => GLTF, cloneModel: mkModel, now: () => t })
    for (let i = 0; i < 10; i++) { t += 100; r.update([P(2, 'BOB', i)]) }
    expect(r.map.get(2).state).toBe('run')
    expect(r.map.get(2).mixer.updates).toBeGreaterThan(0)
    for (let i = 0; i < 25; i++) { t += 100; r.update([P(2, 'BOB', 9)]) }
    expect(r.map.get(2).state).toBe('idle')
  })
  it('dispose frees the cloned materials and stops the mixer', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE, { getSoldier: () => GLTF, cloneModel: mkModel, now: () => 0 })
    r.update([P(2, 'BOB')])
    const e = r.map.get(2)
    r.dispose()
    expect(e.mats.every((m) => m.disposed)).toBe(true)
    expect(e.mixer.stopped).toBe(true)
    expect(r.count).toBe(0)
    expect(scene.items.length).toBe(0)
  })
})
