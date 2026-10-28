<script setup>
// Debug page: open /layout-check?seed=123 in two tabs/browsers. The hash must be identical.
import { generateLayout, layoutHash, parseSeed } from '~~/shared/layout.js'
import { rayVsList } from '~~/shared/collide.js'

const route = useRoute()
const seed = parseSeed(route.query.seed, 1)
const layout = generateLayout(seed)
const hash = layoutHash(layout)
// fixed test rays from the origin; compare these numbers with `node tools/layout-info.mjs <seed>`
const rays = []
for (let i = 0; i < 8; i++) {
  const a = i * (Math.PI / 4) + 0.1
  const h = rayVsList(0, 1, 0, Math.cos(a), 0, Math.sin(a), layout.obstacles)
  rays.push(h ? `${h.index}:${h.t.toFixed(3)}` : 'miss')
}
</script>

<template>
  <div style="padding:24px;font:16px 'Courier New', monospace;color:#00ffff;background:#05070d;min-height:100vh;">
    <h2>layout check</h2>
    <div>seed: {{ seed }}</div>
    <div>hash: <b style="color:#ffd700">{{ hash }}</b></div>
    <div>obstacles: {{ layout.obstacles.length }} | spawns: {{ layout.playerSpawns.length }} | barrels: {{ layout.barrels.length }}</div>
    <div>rays: {{ rays.join('  ') }}</div>
  </div>
</template>
