import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { segmentBoxIntersection } from '../app/game/projectileCollision.js'

const box = () => new THREE.Box3(
  new THREE.Vector3(-1, -1, -1),
  new THREE.Vector3(1, 1, 1),
)

describe('segmentBoxIntersection', () => {
  it('detects a projectile crossing a box between frames', () => {
    const hit = segmentBoxIntersection(
      new THREE.Vector3(-5, 0, 0),
      new THREE.Vector3(5, 0, 0),
      box(),
    )

    expect(hit).not.toBeNull()
    expect(hit.x).toBeCloseTo(-1)
    expect(hit.y).toBeCloseTo(0)
    expect(hit.z).toBeCloseTo(0)
  })

  it('returns null when the projectile misses the box', () => {
    const hit = segmentBoxIntersection(
      new THREE.Vector3(-5, 3, 0),
      new THREE.Vector3(5, 3, 0),
      box(),
    )

    expect(hit).toBeNull()
  })

  it('does not report a box beyond the projectile segment', () => {
    const hit = segmentBoxIntersection(
      new THREE.Vector3(-5, 0, 0),
      new THREE.Vector3(-2, 0, 0),
      box(),
    )

    expect(hit).toBeNull()
  })

  it('returns the start point when the segment starts inside the box', () => {
    const start = new THREE.Vector3(0, 0, 0)
    const hit = segmentBoxIntersection(
      start,
      new THREE.Vector3(5, 0, 0),
      box(),
    )

    expect(hit).not.toBeNull()
    expect(hit.toArray()).toEqual([0, 0, 0])
  })
})
