// node tools/layout-info.mjs [seed]  -> prints the same hash and ray results as /layout-check
import { generateLayout, layoutHash, parseSeed } from '../shared/layout.js'
import { rayVsList } from '../shared/collide.js'

const seed = parseSeed(process.argv[2], 1)
const layout = generateLayout(seed)
const rays = []
for (let i = 0; i < 8; i++) {
  const a = i * (Math.PI / 4) + 0.1
  const h = rayVsList(0, 1, 0, Math.cos(a), 0, Math.sin(a), layout.obstacles)
  rays.push(h ? `${h.index}:${h.t.toFixed(3)}` : 'miss')
}
console.log('seed:', seed)
console.log('hash:', layoutHash(layout))
console.log('obstacles:', layout.obstacles.length, '| spawns:', layout.playerSpawns.length, '| barrels:', layout.barrels.length)
console.log('rays:', rays.join('  '))
