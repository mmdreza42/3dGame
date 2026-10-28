import { describe, expect, it } from 'vitest'
import { stepCommandPrediction } from '../../shared/prediction.js'

const baseState = {
  x: 0, z: 0, feetY: 0, yaw: 0, pitch: 0, weapon: 0,
  verticalVel: 0, grounded: true, climbing: null,
  jumpWasDown: false, interactWasDown: false,
}

describe('command movement prediction', () => {
  it('uses the same fixed-step walking distance as the server', () => {
    const next = stepCommandPrediction(
      baseState,
      { f: 1, d: 0, r: false, j: false, c: 0, e: false, y: 0, a: 0, w: 0 },
      1 / 30,
    )
    expect(next.x).toBeCloseTo(0, 6)
    expect(next.z).toBeCloseTo(-0.2, 6)
  })

  it('predicts sprint movement and preserves command aim state', () => {
    const next = stepCommandPrediction(
      baseState,
      { f: 1, d: 0, r: true, j: false, c: 0, e: false, y: 0.4, a: -0.2, w: 2 },
      1 / 30,
    )
    expect(next.z).toBeCloseTo(-Math.cos(0.4) * 0.36, 6)
    expect(next.yaw).toBe(0.4)
    expect(next.pitch).toBe(-0.2)
    expect(next.weapon).toBe(2)
  })

  it('predicts a jump once per press', () => {
    const jump = { f: 0, d: 0, r: false, j: true, c: 0, e: false, y: 0, a: 0, w: 0 }
    const first = stepCommandPrediction(baseState, jump, 1 / 30)
    expect(first.feetY).toBeGreaterThan(0)
    expect(first.grounded).toBe(false)
    const second = stepCommandPrediction(first, jump, 1 / 30)
    expect(second.feetY).toBeGreaterThan(first.feetY)
    expect(second.verticalVel).toBeLessThan(first.verticalVel)
  })

  it('attaches to a nearby ladder on an interact press', () => {
    const state = { ...baseState, z: 1 }
    const next = stepCommandPrediction(
      state,
      { f: 0, d: 0, r: false, j: false, c: 0, e: true, y: 0, a: 0, w: 0 },
      1 / 30,
      { ladders: [{ x: 0, z: 0, bottom: 0, top: 4 }] },
    )
    expect(next.climbing).toMatchObject({ x: 0, z: 0, top: 4 })
    expect(next.z).toBeCloseTo(0.55, 6)
  })
})
