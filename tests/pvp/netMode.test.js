import { describe, it, expect } from 'vitest'
import { parseNetMode, wsBaseFor, ROOM_CAPACITY } from '../../app/pvp/net/netMode.js'
import { seedFromRoom } from '../../shared/protocol.js'

describe('parseNetMode', () => {
  it('defaults to multiplayer in public-1', () => {
    const m = parseNetMode({})
    expect(m.multi).toBe(true)
    expect(m.room).toBe('public-1')
    expect(m.seed).toBe(seedFromRoom('public-1'))
  })
  it('?room= is normalized and decides the seed', () => {
    const m = parseNetMode({ room: 'ABCD' })
    expect(m.room).toBe('abcd')
    expect(m.seed).toBe(seedFromRoom('abcd'))
  })
  it('?seed= alone is solo', () => {
    expect(parseNetMode({ seed: '5' }).multi).toBe(false)
  })
  it('?room= wins over ?seed=', () => {
    const m = parseNetMode({ room: 'abcd', seed: '5' })
    expect(m.multi).toBe(true)
    expect(m.seed).toBe(seedFromRoom('abcd'))
  })
  it('?solo=1 is solo, ?solo=0 is not', () => {
    expect(parseNetMode({ solo: '1' }).multi).toBe(false)
    expect(parseNetMode({ solo: '0' }).multi).toBe(true)
  })
  it('invalid room falls back to the default and is flagged', () => {
    const m = parseNetMode({ room: 'bad room!' })
    expect(m.room).toBe('public-1')
    expect(m.invalidRoom).toBe(true)
  })
  it('accepts array query values', () => {
    expect(parseNetMode({ room: ['ABCD', 'x'] }).room).toBe('abcd')
  })
  it('capacity is 8', () => { expect(ROOM_CAPACITY).toBe(8) })
})

describe('wsBaseFor', () => {
  it('configured URL wins', () => {
    expect(wsBaseFor({ configured: ' wss://x.example ', dev: true })).toBe('wss://x.example')
  })
  it('dev uses the default host:8787 (empty base)', () => {
    expect(wsBaseFor({ dev: true, location: { protocol: 'http:', host: 'localhost:3000' } })).toBe('')
  })
  it('production on https uses wss and the page host', () => {
    expect(wsBaseFor({ location: { protocol: 'https:', host: 'a.workers.dev' } })).toBe('wss://a.workers.dev')
  })
  it('production on http keeps the port', () => {
    expect(wsBaseFor({ location: { protocol: 'http:', host: 'localhost:8787' } })).toBe('ws://localhost:8787')
  })
})
