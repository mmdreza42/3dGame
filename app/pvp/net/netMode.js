// Pure helpers: solo vs multiplayer, room code, server URL base. No DOM, no three.
import { DEFAULT_ROOM, LIMITS, normalizeRoomCode, seedFromRoom } from '../../../shared/protocol.js'

export const ROOM_CAPACITY = LIMITS.MAX_PLAYERS

const first = (v) => (Array.isArray(v) ? v[0] : v)
const has = (v) => v !== undefined && v !== null && v !== ''

// /pvp            -> multiplayer, room public-1
// /pvp?room=ABCD  -> multiplayer, room abcd (the seed always comes from the room code)
// /pvp?seed=5     -> solo (the old behaviour);  /pvp?solo=1 -> solo
export function parseNetMode(query = {}) {
  const roomQ = first(query.room)
  const seedQ = first(query.seed)
  const soloQ = first(query.solo)
  if ((has(soloQ) && soloQ !== '0') || (!has(roomQ) && has(seedQ))) {
    return { multi: false, room: null, seed: null, invalidRoom: false }
  }
  const norm = has(roomQ) ? normalizeRoomCode(String(roomQ)) : null
  const room = norm || DEFAULT_ROOM
  return { multi: true, room, seed: seedFromRoom(room), invalidRoom: has(roomQ) && !norm }
}

// base for resolveWsUrl(code, { base }): configured URL wins; dev -> '' (page host, port 8787); production -> page origin
export function wsBaseFor({ configured = '', dev = false, location = null } = {}) {
  const c = (configured || '').trim()
  if (c) return c
  if (dev || !location) return ''
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
}
