import {
  attachLadder,
  leaveLadder,
  startJump,
  stepHorizontalMovement,
  stepLadder,
  stepVerticalMovement,
} from './movement.js'

function findNearbyLadder(state, ladders) {
  for (const ladder of ladders) {
    if (Math.abs(state.x - ladder.x) > 0.9) continue
    const dz = state.z - ladder.z
    if (state.feetY < 1.2 && dz > 0 && dz < 1.8) {
      return { ladder, fromTop: false }
    }
    if (
      Math.abs(state.feetY - ladder.top) < 0.7 &&
      dz > -1.6 && dz < 0.4
    ) {
      return { ladder, fromTop: true }
    }
  }
  return null
}

// Runs one fixed simulation step using the same command rules as GameRoom.
export function stepCommandPrediction(state, command, dt, config = {}) {
  if (!state || !command) throw new TypeError('state and command are required')
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError('dt must be a finite non-negative number')
  }

  const input = {
    forward: Number.isFinite(command.f) ? command.f : 0,
    strafe: Number.isFinite(command.d) ? command.d : 0,
    sprint: command.r === true,
    jump: command.j === true,
    climb: Number.isFinite(command.c) ? command.c : 0,
    interact: command.e === true,
  }

  let next = {
    ...state,
    yaw: Number.isFinite(command.y) ? command.y : state.yaw,
    pitch: Number.isFinite(command.a) ? command.a : state.pitch ?? 0,
    weapon: Number.isFinite(command.w) ? command.w : state.weapon ?? 0,
  }

  const jumpPressed = input.jump && state.jumpWasDown !== true
  const interactPressed = input.interact && state.interactWasDown !== true
  next.jumpWasDown = input.jump
  next.interactWasDown = input.interact

  const ladders = config.ladders || []
  if (interactPressed) {
    if (next.climbing) {
      next = leaveLadder(next, false)
    } else {
      const found = findNearbyLadder(next, ladders)
      if (found) next = attachLadder(next, found.ladder, found.fromTop)
    }
  }

  if (
    !next.climbing && !interactPressed &&
    input.forward > 0 && Math.cos(next.yaw) > 0.35
  ) {
    const found = findNearbyLadder(next, ladders)
    if (found && !found.fromTop) {
      next = attachLadder(next, found.ladder, false)
    }
  }

  if (jumpPressed) next = startJump(next)

  if (next.climbing) {
    next = stepLadder(next, {
      climb: input.climb,
      sprint: input.sprint,
    }, dt)
  } else {
    next = stepHorizontalMovement(next, {
      forward: input.forward,
      strafe: input.strafe,
      sprint: input.sprint,
      yaw: next.yaw,
    }, dt, {
      obstacles: config.obstacles || [],
      platforms: config.platforms || [],
      worldLimit: 99.5,
    })
    next = stepVerticalMovement(next, dt, config.platforms || [])
  }

  return next
}
