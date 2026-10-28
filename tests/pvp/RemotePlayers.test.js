import { describe, it, expect } from 'vitest'
import { RemotePlayers } from '../../app/pvp/net/RemotePlayers.js'

// Minimal fake of the three.js classes RemotePlayers uses (no WebGL needed).
class V3 { constructor() { this.x = 0; this.y = 0; this.z = 0 } set(x, y, z) { this.x = x; this.y = y; this.z = z } }
class Obj { constructor() { this.position = new V3(); this.rotation = { y: 0 }; this.scale = new V3(); this.children = [] } add(...c) { this.children.push(...c) } }
class Geo { constructor() { this.disposed = false } dispose() { this.disposed = true } }
class Mat { constructor() { this.disposed = false } dispose() { this.disposed = true } }
const FakeTHREE = {
  CylinderGeometry: Geo, SphereGeometry: Geo, BoxGeometry: Geo,
  MeshStandardMaterial: Mat, SpriteMaterial: Mat, CanvasTexture: Mat,
  Color: class { setHSL() { return this } },
  Group: Obj, Mesh: Obj, Sprite: Obj,
}
const mkScene = () => ({ items: [], add(o) { this.items.push(o) }, remove(o) { this.items = this.items.filter((x) => x !== o) } })
const P = (id, name, x = 0) => ({ id, name, slot: id, x, y: 0, z: 0, yaw: 0, pitch: 0, w: 0 })

describe('RemotePlayers', () => {
  it('adds, moves and removes players', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE)
    r.update([P(2, 'BOB', 1), P(3, 'CAL', 2)])
    expect(r.count).toBe(2)
    expect(scene.items.length).toBe(2)
    r.update([P(2, 'BOB', 5)])
    expect(r.count).toBe(1)
    expect(scene.items.length).toBe(1)
    expect(scene.items[0].position.x).toBe(5)
  })
  it('rebuilds when a name changes and keeps one figure per id', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE)
    r.update([P(2, 'BOB')])
    r.update([P(2, 'BOB#2')])
    expect(r.count).toBe(1)
    expect(scene.items.length).toBe(1)
  })
  it('dispose removes everything and frees geometries', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE)
    r.update([P(2, 'BOB'), P(3, 'CAL')])
    const geo = r.bodyGeo
    r.dispose()
    expect(r.count).toBe(0)
    expect(scene.items.length).toBe(0)
    expect(geo.disposed).toBe(true)
  })
})
