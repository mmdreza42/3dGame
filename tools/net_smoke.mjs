// Real-socket smoke test: 3 bots join one room, walk, and must see each other (same seed).
//   node tools/net_smoke.mjs --spawn            starts the Node server in-process on a random port
//   node tools/net_smoke.mjs ws://localhost:8787  uses a server you already started (node server/node.mjs)
// Needs Node 22+ (global WebSocket) and, for --spawn, the "ws" package.
const arg = process.argv[2]
let base = arg && !arg.startsWith('--') ? arg : 'ws://localhost:8787'
let stop = async () => {}
if (arg === '--spawn') {
  const { createGameServer } = await import('../server/node.mjs')
  const srv = createGameServer({ port: 0, log: () => {} })
  const port = await srv.listen()
  base = `ws://localhost:${port}`
  stop = () => srv.close()
}
const room = 'smoke' + Math.floor(Math.random() * 1e6)
const fails = []
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

function bot(name, x) {
  const b = { name, x, id: 0, seed: 0, seen: new Map(), roster: [], msgs: 0, closed: false }
  b.ws = new WebSocket(`${base.replace(/\/room.*/, '')}/room/${room}`)
  b.ws.onopen = () => b.ws.send(JSON.stringify({ t: 'h', v: 1, n: name }))
  b.ws.onmessage = (ev) => {
    b.msgs++
    const m = JSON.parse(ev.data)
    if (m.t === 'w') { b.id = m.id; b.seed = m.sd; b.roster = m.pl.map((p) => p[1]) }
    if (m.t === 'j') b.roster.push(m.n)
    if (m.t === 's') for (const r of m.p) if (r[0] !== b.id) b.seen.set(r[0], r[1])
  }
  b.ws.onclose = () => { b.closed = true }
  let seq = 0
  b.timer = setInterval(() => { if (b.ws.readyState === 1 && b.id) { b.x += 0.3; b.ws.send(JSON.stringify({ t: 'i', s: ++seq, p: [b.x, 1, 0], y: 0, a: 0, w: 0 })) } }, 33)
  return b
}

const bots = [bot('ALPHA', 0), bot('BETA', 10), bot('GAMMA', 20)]
await new Promise((r) => setTimeout(r, 1500))
check(bots.every((b) => b.id > 0), 'all 3 bots got a welcome')
check(new Set(bots.map((b) => b.seed)).size === 1, `same seed for everyone (${bots[0].seed})`)
check(bots.every((b) => b.seen.size === 2), 'each bot receives snapshots with the 2 other players')
check(bots.every((b) => b.roster.length === 3), `each bot knows 3 names: ${bots.map((b) => b.roster.join('/')).join(' | ')}`)
const b0x = bots[1].seen.get(bots[0].id)
check(b0x > 0, `BETA sees ALPHA moving (x=${b0x})`)
const dup = bot('ALPHA', 0)
for (let i = 0; i < 50 && !dup.id; i++) await new Promise((r) => setTimeout(r, 100))
await new Promise((r) => setTimeout(r, 200))
check(dup.roster.includes('ALPHA2') || dup.roster.some((n) => n !== 'ALPHA' && n.startsWith('ALPHA')), `duplicate name was renamed (${dup.roster.join('/')})`)
bots.push(dup)
for (const b of bots) { clearInterval(b.timer); b.ws.close() }
await new Promise((r) => setTimeout(r, 200))
await stop()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nSMOKE OK')
process.exit(fails.length ? 1 : 0)
