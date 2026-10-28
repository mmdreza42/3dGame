#!/usr/bin/env bash
# Step 3b: multiplayer UI integration. Run from the project root.
set -e
[ -f app/components/PvpGame.vue ] || { echo "ABORT: run from project root (app/components/PvpGame.vue missing)"; exit 1; }
[ -f app/pvp/net/NetClient.js ] || { echo "ABORT: app/pvp/net/NetClient.js missing"; exit 1; }
[ -f nuxt.config.ts ] || { echo "ABORT: nuxt.config.ts missing"; exit 1; }

mkdir -p .backup_3d
cp app/components/PvpGame.vue .backup_3d/PvpGame.vue.bak
cp nuxt.config.ts .backup_3d/nuxt.config.ts.bak
for f in app/pvp/net/netMode.js app/pvp/net/RemotePlayers.js tests/pvp/netMode.test.js tests/pvp/RemotePlayers.test.js; do
  if [ -e "$f" ]; then mkdir -p ".backup_3d/$(dirname "$f")"; cp "$f" ".backup_3d/$f.bak"; fi
done

# ---------- patches to existing files: all anchors are checked first, nothing is written unless all match once ----------
python3 - <<'PY'
import sys

def load(p):
    return open(p, encoding="utf-8").read()

patches = []  # (file, name, old, new)

# ===== nuxt.config.ts =====
patches.append(("nuxt.config.ts", "runtimeConfig",
r'''  compatibilityDate: '2025-07-15',
''',
r'''  compatibilityDate: '2025-07-15',
  // NUXT_PUBLIC_WS_URL (build time) overrides the game server URL; empty = same origin in production, :8787 in dev
  runtimeConfig: { public: { wsUrl: '' } },
'''))

V = "app/components/PvpGame.vue"

patches.append((V, "imports",
r'''import { createProfileStore, safeStorage } from '../pvp/profile.js'
''',
r'''import { createProfileStore, safeStorage } from '../pvp/profile.js'
import { NetClient } from '../pvp/net/NetClient.js'
import { WebSocketTransport, resolveWsUrl } from '../pvp/net/WebSocketTransport.js'
import { RemotePlayers } from '../pvp/net/RemotePlayers.js'
import { parseNetMode, wsBaseFor, ROOM_CAPACITY } from '../pvp/net/netMode.js'
'''))

patches.append((V, "seed / mode",
r'''const seed = parseSeed(route.query.seed, 1)
''',
r'''const runtimeConfig = useRuntimeConfig()
// multiplayer is the default: the seed comes from the room code. ?seed= alone or ?solo=1 stays solo.
const netMode = parseNetMode(route.query)
const seed = netMode.multi ? netMode.seed : parseSeed(route.query.seed, 1)
'''))

patches.append((V, "net refs",
r'''const scopeVisible = ref(false)
''',
r'''const scopeVisible = ref(false)
// ---- multiplayer UI state (inert in solo) ----
const netStatus = ref('idle')
const netPing = ref(0)
const netRoster = ref([])
const netNote = ref('')
const roomLink = ref('')
const linkCopied = ref(false)
const showScoreboard = ref(false)
const lockLost = ref(false)
let net = null, remotes = null, offNet = [], statTimer = null, spawnedOnce = false, prevRoster = null
'''))

patches.append((V, "submitName / changeName / net functions",
r'''  gameState.value = 'menu'
}
function changeName() { nameInput.value = playerName.value; nameError.value = ''; gameState.value = 'name' }
''',
r'''  gameState.value = 'menu'
  startNet()
}
function changeName() { stopNet(); nameInput.value = playerName.value; nameError.value = ''; gameState.value = 'name' }

// ===== multiplayer (step 3b) =====
function goToRoom(code) {
  const q = new URLSearchParams(window.location.search)
  q.delete('seed'); q.set('room', code)
  window.location.replace(`${window.location.pathname}?${q.toString()}`) // new room = new seed = new world: reload
}

function placeAtSpawn() {
  const pts = layout && layout.playerSpawns
  if (!net || net.status !== 'playing' || !pts || !pts.length) return false
  const s = pts[net.slot % pts.length]
  me.x = s.x; me.z = s.z; me.ry = s.ry
  camera.position.x = s.x; camera.position.z = s.z; camera.position.y = 1.6
  verticalVel = 0; isGrounded = true; climbing = null
  spawnedOnce = true
  return true
}

function syncNetUi() {
  if (!net) return
  netPing.value = Math.round(net.rtt)
  const list = net.scoreboard()
  list.sort((a, b) => (Number(b.self) - Number(a.self)) || a.name.localeCompare(b.name))
  netRoster.value = list
}

function startNet() {
  if (!netMode.multi || net || !playerName.value) return
  const base = wsBaseFor({ configured: runtimeConfig.public.wsUrl, dev: import.meta.dev, location: window.location })
  roomLink.value = `${window.location.origin}${window.location.pathname}?room=${netMode.room}`
  net = new NetClient({
    room: netMode.room,
    name: playerName.value,
    transportFactory: (room) => new WebSocketTransport({ url: resolveWsUrl(room, { base, hostname: window.location.hostname }) }),
    getInput: () => {
      if (!camera || gameState.value !== 'playing') return null // at the menu you are not in the world yet
      return { p: [me.x, camera.position.y - 1.6, me.z], y: me.ry, a: camera.rotation.x, w: Math.max(0, WEAPON_LIST.indexOf(currentWeapon.value)) }
    },
  })
  remotes = new RemotePlayers(scene)
  prevRoster = null
  offNet = [
    net.on('status', (s) => { netStatus.value = s; if (s === 'playing') netNote.value = '' }),
    net.on('welcome', () => { if (!spawnedOnce && gameState.value === 'playing') placeAtSpawn() }),
    net.on('roster', (m) => {
      const cur = new Map([...m.values()].map((p) => [p.id, p.name]))
      if (prevRoster) {
        for (const [id, name] of cur) if (!prevRoster.has(id) && id !== net.selfId) addKillFeed(`${name} joined`)
        for (const [id, name] of prevRoster) if (!cur.has(id)) addKillFeed(`${name} left`)
      }
      prevRoster = cur
      syncNetUi()
    }),
    net.on('seedmismatch', (d) => { netNote.value = `SEED MISMATCH (${d.expected} vs ${d.got}): maps differ, reload` }),
    net.on('shard', (d) => goToRoom(d.to)),
    net.on('full', () => { netNote.value = 'ROOM FULL' }),
    net.on('lost', () => { netNote.value = 'CONNECTION LOST: reload the page' }),
    net.on('server-error', (d) => { if (d.code === 'version') netNote.value = 'VERSION MISMATCH: reload the page' }),
  ]
  statTimer = setInterval(syncNetUi, 250)
  net.connect()
}

function stopNet() {
  for (const off of offNet) off()
  offNet = []
  if (statTimer !== null) { clearInterval(statTimer); statTimer = null }
  if (net) { net.close(); net = null }
  if (remotes) { remotes.dispose(); remotes = null }
  netStatus.value = 'idle'; netRoster.value = []; netNote.value = ''; spawnedOnce = false; prevRoster = null
}

async function copyRoomLink() {
  try {
    await navigator.clipboard.writeText(roomLink.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 1500)
  } catch { netNote.value = roomLink.value } // clipboard blocked: show the link instead
}
'''))

patches.append((V, "Tab down",
r'''  onKeyDown = (e) => {
    keys[e.code] = true
''',
r'''  onKeyDown = (e) => {
    keys[e.code] = true
    if (e.code === 'Tab' && netMode.multi && gameState.value === 'playing') { e.preventDefault(); showScoreboard.value = true }
'''))

patches.append((V, "Tab up",
r'''  onKeyUp = (e) => { keys[e.code] = false }
''',
r'''  onKeyUp = (e) => {
    keys[e.code] = false
    if (e.code === 'Tab') showScoreboard.value = false
  }
'''))

patches.append((V, "pointer lock (no pause in multiplayer)",
r'''    if (!document.pointerLockElement && gameState.value === 'playing') gameState.value = 'paused'
''',
r'''    if (netMode.multi) { lockLost.value = !document.pointerLockElement && gameState.value === 'playing'; return }
    if (!document.pointerLockElement && gameState.value === 'playing') gameState.value = 'paused'
'''))

patches.append((V, "startGame spawn",
r'''    enemies = []; lootItems.length = 0; playerLasers.length = 0
    spawnWave()
    gameState.value = 'playing'
''',
r'''    enemies = []; lootItems.length = 0; playerLasers.length = 0
    if (netMode.multi) { spawnedOnce = false; placeAtSpawn() } else spawnWave() // multiplayer: no PvE waves until step 6
    gameState.value = 'playing'
'''))

patches.append((V, "render remotes",
r'''    camera.rotation.y = me.ry

    crossGap.value = Math.round(5 + currentSpread() * innerHeight * 0.7)
''',
r'''    camera.rotation.y = me.ry

    if (net && remotes) remotes.update(net.sample())

    crossGap.value = Math.round(5 + currentSpread() * innerHeight * 0.7)
'''))

patches.append((V, "mount / unmount",
r'''  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
''',
r'''  loop()
  startNet()
})

onBeforeUnmount(() => {
  stopNet()
  cancelAnimationFrame(frame)
'''))

patches.append((V, "hide PvE HUD in multiplayer",
r'''<div v-if="gameState === 'playing'" style="position:fixed;top:20px;left:20px;''',
r'''<div v-if="gameState === 'playing' && !netMode.multi" style="position:fixed;top:20px;left:20px;'''))

patches.append((V, "template: net HUD, scoreboard, overlays",
r'''    <!-- NAME SCREEN (names are rendered with {{ }} only, never innerHTML) -->
''',
r'''    <!-- MULTIPLAYER (names are rendered with {{ }} only, never innerHTML) -->
    <div v-if="netMode.multi" style="position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:120;display:flex;gap:12px;align-items:center;font:12px 'Courier New', monospace;color:#00ffff;background:rgba(0,0,0,0.65);border:1px solid #00ffff;padding:4px 10px;box-shadow:0 0 10px rgba(0,255,255,0.3);">
      <span>ROOM {{ netMode.room.toUpperCase() }}</span>
      <span :style="{ color: netStatus === 'playing' ? '#00ffaa' : '#ff0055' }">{{ netStatus.toUpperCase() }}</span>
      <span v-if="netStatus === 'playing'">{{ netPing }} ms · {{ netRoster.length }}/{{ ROOM_CAPACITY }}</span>
      <button @click="copyRoomLink" style="font:bold 12px 'Courier New', monospace;color:#000;background:#00ffff;border:none;padding:3px 8px;cursor:pointer;">{{ linkCopied ? 'COPIED' : 'COPY LINK' }}</button>
    </div>
    <div v-if="netMode.multi && netNote" style="position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:120;font:bold 14px 'Courier New', monospace;color:#ff0055;background:rgba(0,0,0,0.75);border:1px solid #ff0055;padding:6px 14px;max-width:80vw;word-break:break-all;">{{ netNote }}</div>
    <div v-if="netMode.multi && showScoreboard" style="position:fixed;top:18%;left:50%;transform:translateX(-50%);z-index:30;min-width:320px;background:rgba(0,0,0,0.8);border:2px solid #00ffff;box-shadow:0 0 20px rgba(0,255,255,0.35);padding:14px 22px;font:16px 'Courier New', monospace;color:#fff;">
      <div style="color:#00ffff;font-weight:bold;letter-spacing:3px;margin-bottom:8px;">PLAYERS · {{ netRoster.length }}/{{ ROOM_CAPACITY }}</div>
      <div v-for="p in netRoster" :key="p.id" :style="{ color: p.self ? '#00ffff' : '#fff', padding: '2px 0' }">{{ p.name }}<span v-if="p.self" style="color:#ff0055;"> (YOU)</span></div>
    </div>
    <div v-if="netMode.multi && gameState === 'playing' && lockLost" style="position:fixed;top:60%;left:50%;transform:translateX(-50%);z-index:90;pointer-events:none;font:bold 28px 'Courier New', monospace;color:#00ffff;text-shadow:0 0 15px #00ffff,0 2px 4px #000;">CLICK TO RESUME</div>
    <div v-if="netMode.multi && netStatus === 'full'" style="position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:130;color:#fff;font-family:'Courier New', monospace;">
      <h1 style="font-size:48px;margin:0;color:#ff0055;text-shadow:0 0 20px #ff0055;">ROOM FULL</h1>
      <p style="margin-top:16px;color:#aaa;">This room has {{ ROOM_CAPACITY }} players. Ask for another room code (?room=...).</p>
    </div>

    <!-- NAME SCREEN (names are rendered with {{ }} only, never innerHTML) -->
'''))

# ---------- check every anchor first ----------
texts = {}
bad = False
for f, name, old, new in patches:
    texts.setdefault(f, load(f))
for f, name, old, new in patches:
    n = texts[f].count(old)
    if n != 1:
        print("PATCH FAILED: %s / %s found %d times (nothing changed)" % (f, name, n))
        bad = True
if bad:
    sys.exit(1)
for f, name, old, new in patches:
    texts[f] = texts[f].replace(old, new, 1)
for f, t in texts.items():
    open(f, "w", encoding="utf-8").write(t)
print("patched: " + ", ".join(sorted(texts)) + " (%d edits)" % len(patches))
PY

# ---------- new files ----------
cat > app/pvp/net/netMode.js <<'EOT'
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
EOT

cat > app/pvp/net/RemotePlayers.js <<'EOT'
// Remote players as simple capsule-like figures with name tags, fed by NetClient.sample().
// Feet position is the origin; yaw uses the same convention as the local camera (forward = -Z at yaw 0).
// Names are drawn on a canvas with fillText only (never HTML).
import * as THREE from 'three'

function makeTag(T, name) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 64
  const ctx = canvas.getContext && canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = "bold 28px 'Courier New', monospace"
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#000'; ctx.lineWidth = 6
  ctx.strokeText(name, 128, 32)
  ctx.fillStyle = '#00ffff'
  ctx.fillText(name, 128, 32)
  return new T.CanvasTexture(canvas)
}

export class RemotePlayers {
  // T is injectable so the bookkeeping can be unit-tested without WebGL
  constructor(scene, T = THREE) {
    this.scene = scene
    this.T = T
    this.map = new Map() // id -> { group, name, mat, tagMat, tagTex }
    this.bodyGeo = new T.CylinderGeometry(0.35, 0.35, 1.1, 12)
    this.headGeo = new T.SphereGeometry(0.25, 12, 8)
    this.noseGeo = new T.BoxGeometry(0.12, 0.1, 0.3)
  }

  get count() { return this.map.size }

  update(list) {
    const seen = new Set()
    for (const p of list) {
      seen.add(p.id)
      let e = this.map.get(p.id)
      if (e && e.name !== p.name) { this._remove(p.id); e = null }
      if (!e) { e = this._create(p); this.map.set(p.id, e) }
      e.group.position.set(p.x, p.y, p.z)
      e.group.rotation.y = p.yaw
    }
    for (const id of [...this.map.keys()]) if (!seen.has(id)) this._remove(id)
  }

  _create(p) {
    const T = this.T
    const color = new T.Color().setHSL((p.slot % 16) / 16, 0.8, 0.5)
    const mat = new T.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 })
    const group = new T.Group()
    const body = new T.Mesh(this.bodyGeo, mat); body.position.y = 0.65
    const head = new T.Mesh(this.headGeo, mat); head.position.y = 1.45
    const nose = new T.Mesh(this.noseGeo, mat); nose.position.set(0, 1.45, -0.3) // points along -Z = forward
    group.add(body, head, nose)
    const e = { group, name: p.name, mat, tagMat: null, tagTex: null }
    const tex = makeTag(T, p.name)
    if (tex) {
      const tagMat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
      const sprite = new T.Sprite(tagMat)
      sprite.position.y = 2.2
      sprite.scale.set(2, 0.5, 1)
      group.add(sprite)
      e.tagMat = tagMat; e.tagTex = tex
    }
    this.scene.add(group)
    return e
  }

  _remove(id) {
    const e = this.map.get(id)
    if (!e) return
    this.scene.remove(e.group)
    e.mat.dispose()
    if (e.tagMat) e.tagMat.dispose()
    if (e.tagTex) e.tagTex.dispose()
    this.map.delete(id)
  }

  dispose() {
    for (const id of [...this.map.keys()]) this._remove(id)
    this.bodyGeo.dispose(); this.headGeo.dispose(); this.noseGeo.dispose()
  }
}
EOT

cat > tests/pvp/netMode.test.js <<'EOT'
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
EOT

cat > tests/pvp/RemotePlayers.test.js <<'EOT'
import { describe, it, expect } from 'vitest'
import { RemotePlayers } from '../../app/pvp/net/RemotePlayers.js'

// Minimal fake of the three.js classes RemotePlayers uses (no WebGL needed).
class V3 { constructor() { this.x = 0; this.y = 0; this.z = 0 } set(x, y, z) { this.x = x; this.y = y; this.z = z } }
class Obj { constructor() { this.position = new V3(); this.rotation = { y: 0 }; this.scale = new V3(); this.children = [] } add(...c) { this.children.push(...c) } }
class Geo { constructor() { this.disposed = false } dispose() { this.disposed = true } }
class Mat { constructor() { this.disposed = false } dispose() { this.disposed = true } }
const FakeTHREE = {
  CylinderGeometry: Geo, SphereGeometry: Geo, BoxGeometry: Geo,
  MeshStandardMaterial: Mat, SpriteMaterial: Mat, CanvasTexture: Mat,
  Color: class { setHSL() { return this } },
  Group: Obj, Mesh: Obj, Sprite: Obj,
}
const mkScene = () => ({ items: [], add(o) { this.items.push(o) }, remove(o) { this.items = this.items.filter((x) => x !== o) } })
const P = (id, name, x = 0) => ({ id, name, slot: id, x, y: 0, z: 0, yaw: 0, pitch: 0, w: 0 })

describe('RemotePlayers', () => {
  it('adds, moves and removes players', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE)
    r.update([P(2, 'BOB', 1), P(3, 'CAL', 2)])
    expect(r.count).toBe(2)
    expect(scene.items.length).toBe(2)
    r.update([P(2, 'BOB', 5)])
    expect(r.count).toBe(1)
    expect(scene.items.length).toBe(1)
    expect(scene.items[0].position.x).toBe(5)
  })
  it('rebuilds when a name changes and keeps one figure per id', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE)
    r.update([P(2, 'BOB')])
    r.update([P(2, 'BOB#2')])
    expect(r.count).toBe(1)
    expect(scene.items.length).toBe(1)
  })
  it('dispose removes everything and frees geometries', () => {
    const scene = mkScene()
    const r = new RemotePlayers(scene, FakeTHREE)
    r.update([P(2, 'BOB'), P(3, 'CAL')])
    const geo = r.bodyGeo
    r.dispose()
    expect(r.count).toBe(0)
    expect(scene.items.length).toBe(0)
    expect(geo.disposed).toBe(true)
  })
})
EOT

echo "patched PvpGame.vue + nuxt.config.ts, wrote netMode.js, RemotePlayers.js, 2 test files"

