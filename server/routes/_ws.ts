const g = globalThis as any
const players: Map<string, any> = g.__players || (g.__players = new Map())
const MAX = 4

const clamp = (v: number) => Math.max(-24, Math.min(24, v))
const spawn = (team: string) => ({ x: (Math.random() - 0.5) * 20, z: team === 'red' ? 20 : -20 })
const pub = (p: any) => ({ id: p.id, name: p.name, team: p.team, x: p.x, z: p.z, ry: p.ry, hp: p.hp, kills: p.kills, deaths: p.deaths })
const send = (m: any) => {
  const s = JSON.stringify(m)
  for (const p of players.values()) p.peer.send(s)
}

if (!g.__tick) {
  g.__tick = setInterval(() => {
    if (players.size) send({ t: 'players', list: [...players.values()].map(pub) })
  }, 50)
}

export default defineWebSocketHandler({
  message(peer, message) {
    let m: any
    try { m = JSON.parse(message.text()) } catch { return }
    const p = players.get(peer.id)

    if (m.t === 'join') {
      if (p) return
      const red = [...players.values()].filter((q) => q.team === 'red').length
      const blue = players.size - red
      if (red >= MAX && blue >= MAX) {
        peer.send(JSON.stringify({ t: 'full' }))
        return
      }
      const team = red < MAX && (red <= blue || blue >= MAX) ? 'red' : 'blue'
      const s = spawn(team)
      players.set(peer.id, {
        id: peer.id, peer, team, x: s.x, z: s.z, ry: 0, hp: 100, kills: 0, deaths: 0, last: 0,
        name: String(m.name || 'Player').slice(0, 12)
      })
      peer.send(JSON.stringify({ t: 'hello', id: peer.id, team, x: s.x, z: s.z }))
      return
    }

    if (!p || p.hp <= 0) return

    if (m.t === 'move') {
      p.x = clamp(+m.x || 0)
      p.z = clamp(+m.z || 0)
      p.ry = +m.ry || 0
    }

    if (m.t === 'shoot') {
      const now = Date.now()
      if (now - p.last < 150) return
      p.last = now
      p.x = clamp(+m.x || 0)
      p.z = clamp(+m.z || 0)
      let dx = +m.dx || 0
      let dz = +m.dz || 0
      const l = Math.hypot(dx, dz) || 1
      dx /= l
      dz /= l
      let best: any = null
      let bestT = 40
      for (const q of players.values()) {
        if (q.team === p.team || q.hp <= 0) continue
        const rx = q.x - p.x
        const rz = q.z - p.z
        const t = rx * dx + rz * dz
        if (t < 0 || t > bestT) continue
        const d = Math.abs(rx * dz - rz * dx)
        if (d < 0.7) { best = q; bestT = t }
      }
      if (best) {
        const b = best
        b.hp -= 25
        if (b.hp <= 0) {
          b.hp = 0
          b.deaths++
          p.kills++
          setTimeout(() => {
            if (!players.has(b.id)) return
            const s = spawn(b.team)
            b.hp = 100
            b.x = s.x
            b.z = s.z
            send({ t: 'respawn', id: b.id, x: b.x, z: b.z })
          }, 3000)
        }
      }
      send({ t: 'shot', id: p.id, x: p.x, z: p.z, dx, dz, len: bestT })
    }
  },
  close(peer) {
    players.delete(peer.id)
  }
})
