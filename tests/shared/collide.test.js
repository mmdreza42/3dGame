import { describe, it, expect } from 'vitest'
import { makeAABB, rayAABB, rayVsList, segmentClear, raySphere, rayCapsuleY, moveCircle, pointInAABB } from '../../shared/collide.js'

const box = makeAABB(0, 1, 10, 1, 1, 1) // z 9..11

describe('collide', () => {
  it('ray hits box at the right distance', () => {
    expect(rayAABB(0, 1, 0, 0, 0, 1, box)).toBeCloseTo(9, 6)
  })
  it('ray misses when aimed off', () => {
    expect(rayAABB(5, 1, 0, 0, 0, 1, box)).toBe(-1)
  })
  it('maxDist limits the ray', () => {
    expect(rayAABB(0, 1, 0, 0, 0, 1, box, 5)).toBe(-1)
  })
  it('rayVsList returns nearest', () => {
    const near = makeAABB(0, 1, 5, 1, 1, 1)
    const hit = rayVsList(0, 1, 0, 0, 0, 1, [box, near])
    expect(hit.index).toBe(1)
  })
  it('segmentClear detects blockers', () => {
    expect(segmentClear(0, 1, 0, 0, 1, 20, [box])).toBe(false)
    expect(segmentClear(0, 1, 0, 0, 1, 8, [box])).toBe(true)
    expect(segmentClear(5, 1, 0, 5, 1, 20, [box])).toBe(true)
  })
  it('sphere + capsule', () => {
    expect(raySphere(0, 1.55, 0, 0, 0, 1, 0, 1.55, 10, 0.25)).toBeCloseTo(9.75, 6)
    expect(rayCapsuleY(0, 1, 0, 0, 0, 1, 0, 0.3, 1.4, 10, 0.4)).toBeCloseTo(9.6, 6)
    expect(rayCapsuleY(0, 3, 0, 0, 0, 1, 0, 0.3, 1.4, 10, 0.4)).toBe(-1)
  })
  it('moveCircle slides along a wall', () => {
    const wall = makeAABB(0, 1, 5, 5, 1, 0.5) // blocks z at 4.5..5.5
    const r = moveCircle(0, 4, 0.5, 0.5, 0.4, 0, 1.8, [wall])
    expect(r.x).toBeCloseTo(0.5, 6)
    expect(r.z).toBe(4)
  })
  it('pointInAABB', () => {
    expect(pointInAABB(0, 1, 10, box)).toBe(true)
    expect(pointInAABB(3, 1, 10, box)).toBe(false)
  })
})
