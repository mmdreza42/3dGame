// Builds app/components/PvpGame.vue from app/components/Game.vue with exact, checked replacements.
// Every anchor must match exactly once, otherwise nothing is written.
// usage: node tools/make_pvp.mjs [src] [dst]
import fs from 'node:fs'

const src = process.argv[2] || 'app/components/Game.vue'
const dst = process.argv[3] || 'app/components/PvpGame.vue'
let s = fs.readFileSync(src, 'utf8')

const rep = (a, b) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(`anchor matched ${n} times (need 1): ${a.slice(0, 70)}`)
  s = s.replace(a, () => b)
}
const cut = (startMarker, endMarker, replacement) => {
  const i = s.indexOf(startMarker), j = s.indexOf(endMarker)
  if (i < 0 || j < 0 || j < i || s.indexOf(startMarker, i + 1) >= 0) throw new Error('cut markers invalid: ' + startMarker.slice(0, 40))
  s = s.slice(0, i) + replacement + s.slice(j)
}

// ---------- imports ----------
rep("import { buildWorld } from '../game/world.js'", `import { buildWorld } from '../pvp/world.js'
import { generateLayout, layoutHash, parseSeed } from '~~/shared/layout.js'
import { rayVsList, segmentClear, pointInAABB } from '~~/shared/collide.js'
import { validateName } from '~~/shared/names.js'
import { createProfileStore, safeStorage } from '../pvp/profile.js'`)

// ---------- state ----------
rep("const root = ref(null)\n", `const root = ref(null)
const route = useRoute()
const seed = parseSeed(route.query.seed, 1)
const layoutHashStr = ref('')
const nameInput = ref('')
const nameError = ref('')
const playerName = ref('')
`)
rep("const gameState = ref('menu')", "const gameState = ref('menu')   // 'name' | 'menu' | 'playing' | 'paused' | 'dead' | 'shop' (waves are removed in a later step)")
rep("const highScore = ref(parseInt(localStorage.getItem('nexus_highscore') || '0'))", `// profile (name, best score, lifetime stats) lives in localStorage; see app/pvp/profile.js
const store = createProfileStore(safeStorage(() => window.localStorage))
const highScore = ref(store.get().bestScore)
playerName.value = store.get().name
if (!playerName.value) gameState.value = 'name'
let detachProfileHooks = null
function submitName() {
  const r = validateName(nameInput.value)
  if (!r.ok) { nameError.value = r.error; return }
  nameError.value = ''
  store.setName(r.name)
  playerName.value = store.get().name
  gameState.value = 'menu'
}
function changeName() { nameInput.value = playerName.value; nameError.value = ''; gameState.value = 'name' }`)

// layout + colliders replace the THREE-mesh obstacle list
rep("const obstacles = [], barrels = []", "// colliders are plain AABBs from the seeded layout (shared/layout.js), not THREE meshes\nlet layout = null, colliders = []\nconst barrels = []")

// ---------- line of sight ----------
cut("const _losRay = new THREE.Raycaster()\n", "function triggerHurt()", `function hasLineOfSight(fromX, fromZ, toX, toZ, toY = 1.5) {
  return segmentClear(fromX, 1.5, fromZ, toX, toY, toZ, colliders)
}

`)

// ---------- aim ray ----------
rep(`  const wall = _aimRay.intersectObjects(obstacles, true)[0]
  if (wall) dist = wall.distance`, `  const wall = rayVsList(camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z, colliders, 200)
  if (wall) dist = wall.t`)

// ---------- isBlocked ----------
rep(`  _tv.set(x, y, z)
  for (const obs of obstacles) {
    const b = (obs.userData.boxE ||= new THREE.Box3().setFromObject(obs))
    if (margin > 0 ? b.distanceToPoint(_tv) < margin : b.containsPoint(_tv)) return true
  }
  return false`, `  for (let i = 0; i < colliders.length; i++) if (pointInAABB(x, y, z, colliders[i], margin)) return true
  return false`)

// ---------- player collision (same 0.5 m expansion as before) ----------
rep(`        _cp.set(nx, floorY + 1.0, nz)
        for (const obs of obstacles) {
          const b = (obs.userData.boxP ||= new THREE.Box3().setFromObject(obs).expandByScalar(0.5))
          if (b.containsPoint(_cp)) return true
        }
        return false`, `        for (let i = 0; i < colliders.length; i++) if (pointInAABB(nx, floorY + 1.0, nz, colliders[i], 0.5)) return true
        return false`)

// ---------- remove the random inline world, build from layout ----------
cut("  // Pillars (trees)\n", "  world = buildWorld(scene, obstacles, barrels)\n", "")
rep("  world = buildWorld(scene, obstacles, barrels)\n", `  layout = generateLayout(seed)
  colliders = layout.obstacles
  layoutHashStr.value = layoutHash(layout)
  world = buildWorld(scene, layout, barrels)
`)

// ---------- profile hooks ----------
rep("  addEventListener('contextmenu', onContextMenu); addEventListener('resize', onResize)\n", `  addEventListener('contextmenu', onContextMenu); addEventListener('resize', onResize)
  detachProfileHooks = store.attachPageHooks(document, window)
`)
rep("  renderer?.dispose()\n", "  detachProfileHooks?.()\n  store.flush()\n  renderer?.dispose()\n")
rep("    if (score.value > highScore.value) { highScore.value = score.value; localStorage.setItem('nexus_highscore', score.value.toString()) }",
  "    store.addStat('deaths')\n    if (store.submitScore(score.value)) highScore.value = store.get().bestScore")
rep("  currentAmmo.value--\n", "  currentAmmo.value--\n  store.addStat('shots')\n")
rep("  hideEnemyExtras(mesh)\n", "  hideEnemyExtras(mesh)\n  store.addStat('enemyKills')\n  if (isHeadshot) store.addStat('headshots')\n")

// ---------- template ----------
rep(`    <!-- HUD -->`, `    <div v-if="layoutHashStr" style="position:fixed;bottom:4px;right:8px;z-index:4;color:#3a5a6a;font:11px 'Courier New', monospace;pointer-events:none;">seed {{ seed }} · layout {{ layoutHashStr }}</div>

    <!-- HUD -->`)
rep(`    <div v-if="gameState === 'menu' || gameState === 'paused' || gameState === 'dead'" style="position:fixed;inset:0;`, `    <!-- NAME SCREEN (names are rendered with {{ }} only, never innerHTML) -->
    <div v-if="gameState === 'name'" style="position:fixed;inset:0;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:110;color:#fff;font-family:'Courier New', monospace;">
      <h1 style="font-size:56px;margin:0;color:#00ffff;text-shadow:0 0 30px #00ffff;letter-spacing:8px;">NEXUS STRIKE</h1>
      <p style="color:#ff0055;margin:10px 0 30px;font-size:18px;letter-spacing:3px;">ENTER YOUR CALLSIGN</p>
      <input v-model="nameInput" maxlength="16" autofocus placeholder="3-16 characters" @keydown.enter.prevent="submitName" @keydown.stop @keyup.stop
        style="width:320px;padding:12px;font:bold 22px 'Courier New', monospace;text-align:center;color:#00ffff;background:#05121a;border:2px solid #00ffff;outline:none;box-shadow:0 0 15px rgba(0,255,255,0.3);" />
      <div style="height:24px;margin-top:10px;color:#ff0055;font-size:14px;">{{ nameError }}</div>
      <button @click="submitName" style="margin-top:10px;padding:14px 40px;font-size:22px;font-weight:bold;background:#00ffff;color:#000;border:none;border-radius:2px;cursor:pointer;box-shadow:0 0 20px #00ffff;">CONFIRM</button>
    </div>

    <div v-if="gameState === 'menu' || gameState === 'paused' || gameState === 'dead'" style="position:fixed;inset:0;`)
rep(`HIGH SCORE: {{ highScore }}</p>
`, `HIGH SCORE: {{ highScore }}</p>
      <p v-if="gameState === 'menu'" style="color:#00ffff;margin-top:8px;font-size:18px;">PLAYER: {{ playerName }} <a href="#" @click.prevent="changeName" style="color:#ff0055;font-size:14px;margin-left:8px;">[change name]</a></p>
`)

fs.writeFileSync(dst, s)
console.log(`wrote ${dst} (${s.split('\n').length} lines)`)
