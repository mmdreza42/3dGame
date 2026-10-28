import { blockedCircle } from './collide.js'

const DEFAULT_RADIUS = 0.5
const DEFAULT_HEIGHT = 1.8

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, numberOr(value, 0)))
}

function platformAt(x, z, feetY, platforms) {
  let best = null
  for (const p of platforms) {
    if (
      Math.abs(x - p.x) <= p.hw &&
      Math.abs(z - p.z) <= p.hd &&
      p.y <= feetY + 0.5 &&
      (!best || p.y > best.y)
    ) best = p
  }
  return best
}

function canOccupy(x, z, feetY, platform, obstacles, options) {
  if (x < -options.worldLimit || x > options.worldLimit ||
      z < -options.worldLimit || z > options.worldLimit) return false

  if (platform) {
    const inside =
      Math.abs(x - platform.x) < platform.hw - 0.4 &&
      Math.abs(z - platform.z) < platform.hd - 0.4
    const inGap = platform.gap &&
      Math.abs(x - platform.gap.x) < platform.gap.hw &&
      z >= platform.z
    if (!inside && !inGap) return false
  }

  return !blockedCircle(x, z, options.radius, feetY, options.height, obstacles)
}

// Fixed-step horizontal movement. The caller owns authoritative state and speed policy.
// State positions are feet coordinates; vertical physics and ladder transitions are separate.
export function stepHorizontalMovement(state, command, dt, config = {}) {
  if (!state || !command) throw new TypeError('state and command are required')
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be a finite non-negative number')

  const options = {
    radius: numberOr(config.radius, DEFAULT_RADIUS),
    height: numberOr(config.height, DEFAULT_HEIGHT),
    walkSpeed: numberOr(config.walkSpeed, 6),
    sprintMultiplier: numberOr(config.sprintMultiplier, 1.8),
    worldLimit: numberOr(config.worldLimit, 99.5),
  }
  const obstacles = Array.isArray(config.obstacles) ? config.obstacles : []
  const platforms = Array.isArray(config.platforms) ? config.platforms : []

  const x = numberOr(state.x, 0)
  const z = numberOr(state.z, 0)
  const feetY = numberOr(state.feetY, 0)
  const yaw = numberOr(command.yaw, numberOr(state.yaw, 0))
  let forward = clampAxis(command.forward)
  let strafe = clampAxis(command.strafe)

  const length = Math.hypot(forward, strafe)
  if (length > 1) {
    forward /= length
    strafe /= length
  }

  if (dt === 0 || length === 0) return { ...state, x, z, yaw }

  const sprinting = command.sprint === true
  const speed = Math.max(0, options.walkSpeed) *
    (sprinting ? Math.max(1, options.sprintMultiplier) : 1)
  const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * dt
  const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed * dt
  const platform = platformAt(x, z, feetY, platforms)

  let nextX = x + dx
  let nextZ = z
  if (!canOccupy(nextX, nextZ, feetY, platform, obstacles, options)) nextX = x

  const candidateZ = z + dz
  if (canOccupy(nextX, candidateZ, feetY, platform, obstacles, options)) nextZ = candidateZ

  return { ...state, x: nextX, z: nextZ, yaw }
}


const GRAVITY = 25
const JUMP_SPEED = 8
const LADDER_JUMP_SPEED = 6
const LADDER_WALK_SPEED = 3
const LADDER_SPRINT_SPEED = 5

function assertDeltaTime(dt) {
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError('dt must be a finite non-negative number')
  }
}

function requireState(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('state is required')
  }
}

function requireLadder(ladder) {
  if (
    !ladder ||
    ![ladder.x, ladder.z, ladder.bottom, ladder.top].every(Number.isFinite) ||
    ladder.top < ladder.bottom
  ) {
    throw new RangeError('ladder must have finite coordinates and a valid height')
  }
}

// Start a normal jump, or jump away from a ladder.
export function startJump(state) {
  requireState(state)

  if (state.climbing) return leaveLadder(state, true)
  if (state.grounded !== true) return { ...state }

  return { ...state, verticalVel: JUMP_SPEED, grounded: false }
}

// Attach only after the caller has verified that the player is near this ladder.
export function attachLadder(state, ladder, fromTop = false) {
  requireState(state)
  requireLadder(ladder)

  return {
    ...state,
    x: ladder.x,
    z: ladder.z + 0.55,
    feetY: fromTop ? ladder.top - 0.35 : numberOr(state.feetY, ladder.bottom),
    verticalVel: 0,
    grounded: false,
    climbing: { x: ladder.x, z: ladder.z, bottom: ladder.bottom, top: ladder.top },
  }
}

// Leave with E (jump=false) or Space (jump=true).
export function leaveLadder(state, jump = false) {
  requireState(state)
  if (!state.climbing) return { ...state }

  const ladder = state.climbing
  return {
    ...state,
    z: jump ? ladder.z + 0.9 : numberOr(state.z, ladder.z + 0.55),
    verticalVel: jump ? LADDER_JUMP_SPEED : 0,
    grounded: false,
    climbing: null,
  }
}

// command.climb is 1 for W, -1 for S, and 0 for no vertical input.
export function stepLadder(state, command, dt) {
  requireState(state)
  assertDeltaTime(dt)
  if (!state.climbing) return { ...state }

  const ladder = state.climbing
  requireLadder(ladder)
  command = command || {}

  const direction = clampAxis(command.climb)
  const speed = command.sprint === true ? LADDER_SPRINT_SPEED : LADDER_WALK_SPEED
  const feetY = numberOr(state.feetY, ladder.bottom) + direction * speed * dt

  if (direction > 0 && feetY >= ladder.top) {
    return {
      ...state,
      x: ladder.x,
      z: ladder.z - 1.0,
      feetY: ladder.top,
      verticalVel: 0,
      grounded: true,
      climbing: null,
    }
  }

  if (direction < 0 && feetY <= ladder.bottom) {
    return {
      ...state,
      x: ladder.x,
      z: ladder.z + 1.2,
      feetY: ladder.bottom,
      verticalVel: 0,
      grounded: true,
      climbing: null,
    }
  }

  return {
    ...state,
    x: ladder.x,
    z: ladder.z + 0.55,
    feetY,
    verticalVel: 0,
    grounded: false,
  }
}

// Integrate vertical motion using fixed dt. Landing surfaces are ground level
// and the deterministic layout's platforms. Horizontal movement is handled separately.
export function stepVerticalMovement(state, dt, platforms = []) {
  requireState(state)
  assertDeltaTime(dt)

  const x = numberOr(state.x, 0)
  const z = numberOr(state.z, 0)
  const feetY = numberOr(state.feetY, 0)
  const velocity = numberOr(state.verticalVel, 0)

  if (state.climbing) return { ...state, x, z, feetY, verticalVel: 0, grounded: false }
  if (dt === 0) return { ...state, x, z, feetY, verticalVel: velocity }

  const nextFeetY = feetY + velocity * dt
  const nextVelocity = velocity - GRAVITY * dt

  // Use the higher of the old/new feet positions to detect crossing a deck
  // while falling, but do not snap an ascending player onto its underside.
  const surface = platformAt(x, z, Math.max(feetY, nextFeetY), platforms)
  const floorY = surface ? surface.y : 0

  if (velocity <= 0 && nextFeetY <= floorY) {
    return {
      ...state,
      x,
      z,
      feetY: floorY,
      verticalVel: 0,
      grounded: true,
    }
  }

  return {
    ...state,
    x,
    z,
    feetY: nextFeetY,
    verticalVel: nextVelocity,
    grounded: false,
  }
}
