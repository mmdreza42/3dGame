import { describe, it, expect } from 'vitest'
import { makeAABB } from '../../shared/collide.js'
import { attachLadder, leaveLadder, startJump, stepHorizontalMovement, stepLadder, stepVerticalMovement } from '../../shared/movement.js'

const step = (state, command, dt = 1 / 30, config = {}) =>
  stepHorizontalMovement(state, command, dt, config)

describe('server horizontal movement', () => {
  it('moves forward using yaw and a fixed delta time', () => {
    const result = step({ x: 0, z: 0, feetY: 0, yaw: 0 }, { forward: 1 })
    expect(result.x).toBeCloseTo(0)
    expect(result.z).toBeCloseTo(-0.2)
  })

  it('does not move faster diagonally', () => {
    const state = { x: 0, z: 0, feetY: 0, yaw: 0 }
    const straight = step(state, { forward: 1 })
    const diagonal = step(state, { forward: 1, strafe: 1 })
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(straight.x, straight.z))
  })

  it('applies sprint speed on the server', () => {
    const state = { x: 0, z: 0, feetY: 0, yaw: 0 }
    const walking = step(state, { forward: 1 })
    const sprinting = step(state, { forward: 1, sprint: true })
    expect(Math.abs(sprinting.z)).toBeCloseTo(Math.abs(walking.z) * 1.8)
  })

  it('stops at obstacles', () => {
    const obstacles = [makeAABB(0, 1, 0, 0.5, 1, 0.5)]
    const state = { x: -1, z: 0, feetY: 0, yaw: -Math.PI / 2 }
    const result = step(state, { forward: 1 }, 1 / 30, { obstacles })
    expect(result.x).toBe(state.x)
    expect(result.z).toBeCloseTo(state.z, 10)
  })

  it('slides along an obstacle when one movement axis is blocked', () => {
    const obstacles = [makeAABB(0, 1, 0, 0.5, 1, 0.5)]
    const state = { x: -1, z: 0, feetY: 0, yaw: 0 }
    const result = step(state, { forward: 1, strafe: 1 }, 1 / 30, { obstacles })
    expect(result.x).toBeCloseTo(state.x)
    expect(result.z).toBeLessThan(state.z)
  })

  it('blocks movement outside the arena', () => {
    const state = { x: 99.4, z: 0, feetY: 0, yaw: 0 }
    const result = step(state, { strafe: 1 }, 1 / 30)
    expect(result.x).toBe(state.x)
  })

  it('prevents leaving an elevated deck except through its ladder gap', () => {
    const platform = { x: 0, z: 0, hw: 2.3, hd: 2.3, y: 7.25, gap: { x: 0, hw: 0.65 } }
    const config = { platforms: [platform] }
    const state = { x: 1.5, z: 1.8, feetY: 7.25, yaw: 0 }
    const blocked = step(state, { forward: -1 }, 1 / 30, config)
    expect(blocked.z).toBe(state.z)

    const gapState = { x: 0, z: 1.8, feetY: 7.25, yaw: 0 }
    const throughGap = step(gapState, { forward: -1 }, 1 / 30, config)
    expect(throughGap.z).toBeGreaterThan(gapState.z)
  })

  it('rejects negative delta time', () => {
    expect(() => step({ x: 0, z: 0 }, { forward: 1 }, -1)).toThrow(RangeError)
  })

  it('starts a jump only while grounded', () => {
    const grounded = { x: 0, z: 0, feetY: 0, verticalVel: 0, grounded: true }
    const jumped = startJump(grounded)
    expect(jumped.verticalVel).toBe(8)
    expect(jumped.grounded).toBe(false)
    expect(startJump(jumped).verticalVel).toBe(8)
  })

  it('applies gravity and lands on the ground', () => {
    let state = startJump({ x: 0, z: 0, feetY: 0, verticalVel: 0, grounded: true })
    for (let i = 0; i < 60; i++) state = stepVerticalMovement(state, 1 / 30)
    expect(state.feetY).toBe(0)
    expect(state.verticalVel).toBe(0)
    expect(state.grounded).toBe(true)
  })

  it('lands on an elevated platform while falling', () => {
    const platforms = [{ x: 0, z: 0, hw: 2, hd: 2, y: 7.25 }]
    let state = { x: 0, z: 0, feetY: 8, verticalVel: -8, grounded: false }
    for (let i = 0; i < 10 && !state.grounded; i++) {
      state = stepVerticalMovement(state, 1 / 30, platforms)
    }
    expect(state.feetY).toBe(7.25)
    expect(state.verticalVel).toBe(0)
    expect(state.grounded).toBe(true)
  })

  it('attaches to a ladder and enters the deck at the top', () => {
    const ladder = { x: 2, z: 4, bottom: 0, top: 0.2 }
    let state = attachLadder(
      { x: 0, z: 0, feetY: 0, verticalVel: 0, grounded: true },
      ladder,
    )
    expect(state.x).toBe(2)
    expect(state.z).toBe(4.55)
    state = stepLadder(state, { climb: 1 }, 1 / 30)
    state = stepLadder(state, { climb: 1 }, 1 / 30)
    expect(state.feetY).toBe(0.2)
    expect(state.z).toBe(3)
    expect(state.climbing).toBe(null)
    expect(state.grounded).toBe(true)
  })

  it('steps off the bottom of a ladder', () => {
    const ladder = { x: 2, z: 4, bottom: 0, top: 0.2 }
    let state = attachLadder(
      { x: 0, z: 0, feetY: 0, verticalVel: 0, grounded: true },
      ladder,
    )
    state = stepLadder(state, { climb: -1 }, 1 / 30)
    state = stepLadder(state, { climb: -1 }, 1 / 30)
    expect(state.feetY).toBe(0)
    expect(state.z).toBe(5.2)
    expect(state.climbing).toBe(null)
    expect(state.grounded).toBe(true)
  })

  it('uses faster ladder climbing while sprinting', () => {
    const ladder = { x: 0, z: 0, bottom: 0, top: 10 }
    const base = attachLadder({ x: 0, z: 0, feetY: 0, grounded: true }, ladder)
    const walking = stepLadder(base, { climb: 1 }, 1 / 30)
    const sprinting = stepLadder(base, { climb: 1, sprint: true }, 1 / 30)
    expect(walking.feetY).toBeCloseTo(0.1)
    expect(sprinting.feetY).toBeCloseTo(5 / 30)
  })

  it('can attach from the top and jump away from a ladder', () => {
    const ladder = { x: 2, z: 4, bottom: 0, top: 7.25 }
    const attached = attachLadder(
      { x: 0, z: 0, feetY: 7.25, grounded: true },
      ladder,
      true,
    )
    expect(attached.feetY).toBeCloseTo(6.9)
    const jumped = startJump(attached)
    expect(jumped.climbing).toBe(null)
    expect(jumped.verticalVel).toBe(6)
    expect(jumped.z).toBe(4.9)
    expect(jumped.grounded).toBe(false)
  })

  it('leaving a ladder without jumping does not add jump velocity', () => {
    const ladder = { x: 0, z: 0, bottom: 0, top: 5 }
    const attached = attachLadder({ x: 0, z: 0, feetY: 1, grounded: false }, ladder)
    const left = leaveLadder(attached, false)
    expect(left.climbing).toBe(null)
    expect(left.verticalVel).toBe(0)
    expect(left.grounded).toBe(false)
  })

  it('rejects negative vertical and ladder delta time', () => {
    const state = { x: 0, z: 0, feetY: 0, grounded: true }
    expect(() => stepVerticalMovement(state, -1)).toThrow(RangeError)
    const attached = attachLadder(state, { x: 0, z: 0, bottom: 0, top: 5 })
    expect(() => stepLadder(attached, { climb: 1 }, -1)).toThrow(RangeError)
  })
})
