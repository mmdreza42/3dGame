import { getHub } from '../roomHub.js'

export default defineEventHandler(() => ({ ok: true, rooms: getHub().rooms.size }))
