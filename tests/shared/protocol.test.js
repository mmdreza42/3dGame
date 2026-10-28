import { describe, it, expect } from 'vitest'
import {
  PROTOCOL_VERSION, T, LIMITS, RATES, decodeClient, decodeServer, encode, decode,
  normalizeRoomCode, nextShard, seedFromRoom, makeToken, makeRoomCode, isPublicRoom,
} from '../../shared/protocol.js'

const input = (o = {}) => encode({ t: 'i', s: 1, p: [1, 2, 3], y: 0.5, a: 0.1, w: 1, ...o })
const hello = (o = {}) => encode({ t: 'h', v: PROTOCOL_VERSION, n: 'Neo', ...o })

describe('constants', () => {
  it('has the agreed rates and limits', () => {
    expect(RATES).toEqual({ INPUT_HZ: 30, SNAPSHOT_HZ: 20, TICK_HZ: 30 })
    expect(LIMITS.MAX_PLAYERS).toBe(8)
    expect(LIMITS.MAX_MSG_BYTES).toBe(1024)
    expect(LIMITS.MAX_MSG_PER_SEC).toBe(120)
    expect(LIMITS.RECONNECT_MS).toBe(60000)
  })
})

describe('client message validation', () => {
  it('accepts well-formed hello / input / ping', () => {
    expect(decodeClient(hello()).ok).toBe(true)
    expect(decodeClient(hello({ k: 'a'.repeat(36) })).ok).toBe(true)
    expect(decodeClient(input()).ok).toBe(true)
    expect(decodeClient(encode({ t: 'p', c: 12.5 })).ok).toBe(true)
  })

  it('rejects garbage', () => {
    const bad = [
      'not json', '', '[]', 'null', '42', '"x"', '{}', '{"t":"zzz"}', '{"t":5}',
      '{"__proto__":{"t":"h"}}', '{"t":"constructor"}', '{"t":"toString"}',
      input({ extra: 1 }), input({ s: -1 }), input({ s: 1.5 }), input({ s: 2 ** 40 }),
      input({ p: [1, 2] }), input({ p: [1, 2, 3, 4] }), input({ p: ['1', 2, 3] }), input({ p: null }),
      input({ p: [9999, 0, 0] }), input({ p: [0, 9999, 0] }), input({ p: [0, 0, -9999] }),
      input({ y: 'x' }), input({ y: 1e9 }), input({ a: 99 }), input({ w: 16 }), input({ w: -1 }), input({ w: 1.2 }),
      hello({ v: 'x' }), hello({ n: 5 }), hello({ n: 'x'.repeat(65) }), hello({ k: 'short' }), hello({ k: 'a b'.repeat(10) }), hello({ zzz: 1 }),
      encode({ t: 'p' }), encode({ t: 'p', c: 'x' }),
    ]
    for (const raw of bad) expect(decodeClient(raw).ok, raw).toBe(false)
  })

  it('rejects NaN / Infinity (JSON turns them into null, and raw tokens are not JSON)', () => {
    expect(decodeClient(input({ p: [NaN, 0, 0] })).ok).toBe(false)
    expect(decodeClient(input({ y: Infinity })).ok).toBe(false)
    expect(decodeClient('{"t":"i","s":1,"p":[NaN,0,0],"y":0,"a":0,"w":0}').ok).toBe(false)
  })

  it('rejects oversize and binary frames', () => {
    expect(decodeClient(hello({ n: 'x'.repeat(60) }) + ' '.repeat(1100)).reason).toBe('too big')
    expect(decode('é'.repeat(600)).reason).toBe('too big') // 1200 bytes in utf8, 600 chars
    expect(decodeClient(new ArrayBuffer(4)).reason).toBe('binary')
    expect(decodeClient(new Uint8Array(4)).ok).toBe(false)
  })
})

describe('server message validation', () => {
  const welcome = { t: 'w', v: 1, id: 1, k: 'a'.repeat(36), r: 'abcd', sd: 5, si: 0, hz: [30, 20, 30], ts: 1, pl: [[1, 'Neo', 0]] }
  it('accepts valid server messages', () => {
    expect(decodeServer(encode(welcome)).ok).toBe(true)
    expect(decodeServer(encode({ t: 's', n: 1, ts: 2, p: [[1, 0, 0, 0, 0, 0, 0, 3]] })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'j', id: 2, n: 'B', si: 1 })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'l', id: 2 })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'f', r: 'public-1', x: 'public-2' })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'f', r: 'abcd', x: null })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'e', c: 'bad' })).ok).toBe(true)
    expect(decodeServer(encode({ t: 'o', c: 1, ts: 2 })).ok).toBe(true)
  })
  it('rejects malformed server messages', () => {
    for (const m of [
      { ...welcome, pl: 'x' }, { ...welcome, si: 99 }, { ...welcome, extra: 1 }, { ...welcome, r: 'BAD ROOM' },
      { t: 's', n: 1, ts: 2, p: [[1, 0, 0]] }, { t: 's', n: 1, ts: 2, p: [[0, 0, 0, 0, 0, 0, 0, 0]] },
      { t: 'f', r: 'abcd' }, { t: 'f', r: 'abcd', x: 5 }, { t: 'zzz' },
    ]) expect(decodeServer(encode(m)).ok, JSON.stringify(m)).toBe(false)
  })
})

describe('rooms, seeds, tokens', () => {
  it('normalizes room codes', () => {
    expect(normalizeRoomCode(' ABCD ')).toBe('abcd')
    expect(normalizeRoomCode('public-1')).toBe('public-1')
    for (const x of ['', 'a b', '-abc', 'a'.repeat(25), 5, null, undefined, '../x', 'a/b']) expect(normalizeRoomCode(x)).toBe(null)
  })
  it('shards', () => {
    expect(nextShard('public-1')).toBe('public-2')
    expect(nextShard('public-9')).toBe('public-10')
    expect(nextShard('public-99')).toBe(null)
    expect(nextShard('abcd')).toBe(null)
    expect(isPublicRoom('public-3')).toBe(true)
    expect(isPublicRoom('abcd')).toBe(false)
  })
  it('seedFromRoom is deterministic and in range', () => {
    expect(seedFromRoom('abcd')).toBe(seedFromRoom('abcd'))
    expect(seedFromRoom('abcd')).not.toBe(seedFromRoom('abce'))
    for (const c of ['a', 'public-1', 'zzzzzz']) { const s = seedFromRoom(c); expect(s >= 1 && s <= 999999).toBe(true) }
  })
  it('makeToken / makeRoomCode', () => {
    expect(makeToken()).toMatch(/^[0-9a-f]{36}$/)
    expect(makeToken()).not.toBe(makeToken())
    expect(() => makeToken({})).toThrow()
    expect(normalizeRoomCode(makeRoomCode())).toBeTruthy()
  })
  it('T has no duplicate wire codes', () => {
    const v = Object.values(T)
    expect(new Set(v).size).toBe(v.length)
  })
})
