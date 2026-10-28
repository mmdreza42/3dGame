// Bot test for PvP combat. Usage: node tools/net_bots.mjs ws://localhost:8787   (Node 22+, global WebSocket)
import { generateLayout } from '../shared/layout.js'
import { segmentClear } from '../shared/collide.js'
import { teamOf, pickSpawn, KILL_LIMIT, RESPAWN_MS, MATCH_END_MS, SPAWN_PROTECT_MS } from '../shared/combat.js'

const base = (process.argv[2] || 'ws://localhost:8787').replace(/\/$/, '')
const code = 'bots-' + (Math.random().toString(36) + 'xxxx').slice(2, 6)
const url = base + '/room/' + code
const NAMES = ['BOTA', 'BOTB', 'BOTC', 'BOTD', 'BOTE', 'BOTF', 'BOTG', 'BOTH']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const check = (ok, name) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (!ok) fails.push(name) }
async function waitFor(fn, ms) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50) }
  return !!fn()
}

let layout = null
const slotOf = new Map() // player id -> spawn slot
const bots = []
const events = { dmg: [], respawn: [], match: [], scores: null, scoreLog: [] } // recorded from bot 0 (everything is broadcast)

const send = (b, obj) => { if (b.ws.readyState === 1) b.ws.send(JSON.stringify(obj)) }
const dmgOn = (vid, bid, since) => events.dmg.filter((d) => d.id === vid && d.by === bid && d.at >= since)

function setSpawn(b, si) {
  const s = pickSpawn(layout.playerSpawns, b.team, si)
  b.pos = [s.x, 0, s.z]
}

function onMsg(b, m) {
  switch (m.t) {
    case 'w':
      b.id = m.id; b.slot = m.si; b.team = teamOf(m.si)
      if (!layout) layout = generateLayout(m.sd)
      for (const [id, , slot] of m.pl) slotOf.set(id, slot)
      slotOf.set(m.id, m.si)
      setSpawn(b, m.si)
      b.timers.push(setInterval(() => send(b, { t: 'i', s: ++b.seq, p: b.pos, y: 0, a: 0, w: 0 }), 33))
      b.timers.push(setInterval(() => fightTick(b), 220))
      break
    case 'j': slotOf.set(m.id, m.si); break
    case 's': {
      const ids = new Set()
      for (const r of m.p) { ids.add(r[0]); if (r[0] !== b.id) b.seen.set(r[0], { x: r[1], y: r[2], z: r[3] }) }
      for (const id of [...b.seen.keys()]) if (!ids.has(id)) b.seen.delete(id)
      break
    }
    case 'm':
      if (m.id === b.id && m.hp <= 0) b.alive = false
      if (b.i === 0) events.dmg.push({ id: m.id, by: m.by, hp: m.hp, h: m.h, at: Date.now() })
      break
    case 'r':
      if (m.id === b.id) { b.alive = true; setSpawn(b, m.si) }
      if (b.i === 0) events.respawn.push({ id: m.id, at: Date.now() })
      break
    case 'z':
      if (b.i === 0) { events.scores = m; events.scoreLog.push({ at: Date.now(), p: m.p }) }
      break
    case 'n':
      if (b.i === 0) events.match.push({ w: m.w, ms: m.ms, at: Date.now(), scores: events.scores })
      break
  }
}

function makeBot(i) {
  const b = { i, name: NAMES[i], id: 0, slot: -1, team: 0, seq: 0, pos: [0, 0, 0], alive: true, seen: new Map(), fight: false, timers: [] }
  b.ws = new WebSocket(url)
  b.ws.onopen = () => b.ws.send(JSON.stringify({ t: 'h', v: 1, n: b.name }))
  b.ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data) } catch { return } onMsg(b, m) }
  b.ws.onerror = () => {}
  return b
}

// a spot around the target with a clear line (same test as the server: eye 1.6 to chest 1.0)
function findShot(b, tid) {
  const t = b.seen.get(tid)
  if (!t || !layout) return null
  for (const d of [6, 9, 13]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d
      if (Math.abs(x) > 95 || Math.abs(z) > 95) continue
      if (segmentClear(x, 1.6, z, t.x, t.y + 1.0, t.z, layout.obstacles)) return [x, 0, z]
    }
  }
  return null
}

function shoot(b, tid, head, w) {
  const p = findShot(b, tid)
  if (!p) return false
  b.pos = p
  send(b, { t: 'i', s: ++b.seq, p: b.pos, y: 0, a: 0, w })
  send(b, { t: 'x', g: tid, h: head, w })
  return true
}

function fightTick(b) {
  if (!b.fight || !b.alive || !layout) return
  for (const id of b.seen.keys()) {
    if (!slotOf.has(id) || teamOf(slotOf.get(id)) === b.team) continue
    if (shoot(b, id, 1, 0)) return
  }
}

async function run() {
  console.log('room ' + code + ' on ' + base)
  for (let i = 0; i < 8; i++) bots.push(makeBot(i))
  const joined = await waitFor(() => bots.every((b) => b.id > 0), 8000)
  check(joined, 'all 8 bots got a welcome')
  if (!joined) return
  const t0n = bots.filter((b) => b.team === 0).length
  check(t0n === 4, 'teams are 4 v 4 (' + t0n + ' : ' + (8 - t0n) + ')')
  await waitFor(() => bots.every((b) => b.seen.size >= 7), 4000)

  const b0 = bots[0]
  const mate = bots.find((x) => x !== b0 && x.team === b0.team)
  const victim = bots.filter((x) => x.team !== b0.team).find((e) => findShot(b0, e.id))
  let t0 = Date.now()
  for (let i = 0; i < 5; i++) { send(b0, { t: 'x', g: mate.id, h: 1, w: 0 }); await sleep(60) }
  await sleep(300)
  check(dmgOn(mate.id, b0.id, t0).length === 0, 'friendly fire is ignored (5 hits on a teammate)')

  check(!!victim, 'a clear line of fire to an enemy exists')
  if (!victim) return
  t0 = Date.now()
  shoot(b0, victim.id, 0, 0)
  await sleep(250)
  shoot(b0, victim.id, 0, 0)
  await waitFor(() => dmgOn(victim.id, b0.id, t0).some((d) => d.hp === 0), 2500)
  const hps = dmgOn(victim.id, b0.id, t0).map((d) => d.hp)
  check(hps.join() === '50,0', 'two pistol body shots: hp ' + hps.join(' > '))
  await sleep(250)
  const sc = events.scores ? events.scores.p : []
  const row = (id) => sc.find((r) => r[0] === id) || [id, -1, -1]
  check(row(b0.id)[1] === 1 && row(victim.id)[2] === 1, 'scores: killer has 1 kill, victim has 1 death')

  const dead = dmgOn(victim.id, b0.id, t0).find((d) => d.hp === 0)
  const back = await waitFor(() => events.respawn.some((r) => r.id === victim.id && r.at > dead.at), RESPAWN_MS + 2500)
  const rs = events.respawn.find((r) => r.id === victim.id && r.at > dead.at)
  const dt = rs ? rs.at - dead.at : -1
  check(back && dt >= RESPAWN_MS - 400 && dt <= RESPAWN_MS + 1500, 'victim respawns after about ' + RESPAWN_MS + ' ms (' + dt + ' ms)')

  await sleep(300)
  t0 = Date.now()
  const fired = shoot(b0, victim.id, 1, 0)
  await sleep(400)
  check(fired && dmgOn(victim.id, b0.id, t0).length === 0, 'spawn protection blocks a hit')
  await sleep(SPAWN_PROTECT_MS)
  t0 = Date.now()
  const fired2 = shoot(b0, victim.id, 1, 0)
  check(fired2 && await waitFor(() => dmgOn(victim.id, b0.id, t0).length > 0, 1500), 'hits work again after spawn protection')

  console.log('--- full match (all bots shoot enemies, first team to ' + KILL_LIMIT + ' wins)')
  for (const b of bots) b.fight = true
  const t1 = Date.now()
  let lastLog = 0
  const done = await waitFor(() => {
    if (Date.now() - lastLog > 10000) {
      lastLog = Date.now()
      console.log('  ... kills so far: ' + (events.scores ? events.scores.p.reduce((s, r) => s + r[1], 0) : 0))
    }
    return events.match.length > 0
  }, 150000)
  check(done, 'a team reaches ' + KILL_LIMIT + ' kills and the match ends (' + ((Date.now() - t1) / 1000).toFixed(0) + ' s)')
  if (!done) return
  const mt = events.match[0]
  const tk = [0, 0]
  for (const r of (mt.scores ? mt.scores.p : [])) tk[teamOf(slotOf.get(r[0]) ?? 0)] += r[1]
  check(tk[mt.w] >= KILL_LIMIT, 'winner team ' + mt.w + ' has >= ' + KILL_LIMIT + ' kills (' + tk.join(' : ') + ')')

  const wait = mt.at + MATCH_END_MS - 800 - Date.now()
  if (wait > 0) await sleep(wait)
  check(events.dmg.filter((d) => d.at > mt.at + 100).length === 0, 'no damage during the ' + (MATCH_END_MS / 1000) + ' s freeze')
  const gotReset = await waitFor(() => events.scoreLog.some((s) => s.at > mt.at + 100), MATCH_END_MS + 3000)
  const rz = events.scoreLog.find((s) => s.at > mt.at + 100)
  check(gotReset && rz.p.length === 8 && rz.p.every((r) => r[1] === 0 && r[2] === 0), 'scores reset to 0 : 0 for all 8')
  const allBack = await waitFor(() => new Set(events.respawn.filter((r) => r.at > mt.at + 100).map((r) => r.id)).size === 8, 2500)
  check(allBack, 'all 8 players respawn after the match')
}

function finish() {
  for (const b of bots) { b.timers.forEach(clearInterval); try { b.ws.close() } catch { /* ignore */ } }
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nBOTS OK')
  setTimeout(() => process.exit(fails.length ? 1 : 0), 300)
}
run().then(finish, (e) => { console.log('ERROR ' + (e && e.message)); fails.push('exception'); finish() })
