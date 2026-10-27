import re, sys, shutil

P = 'app/components/Game.vue'
s = open(P, encoding='utf-8').read()

def fail(msg):
    print('PATCH FAILED -> ' + msg + '\nNothing was written.')
    sys.exit(1)

def rep(old, new, label):
    global s
    c = s.count(old)
    if c != 1:
        fail(f'{label} (found {c} matches)')
    s = s.replace(old, new)

def rep_re(pattern, new, label):
    global s
    s2, n = re.subn(pattern, lambda m: new, s, flags=re.M)
    if n != 1:
        fail(f'{label} (found {n} matches)')
    s = s2

# 1. imports
rep("import { initAudio, playSound } from '../game/audio.js'",
    "import { initAudio, playSound } from '../game/audio.js'\n"
    "import { buildWorld } from '../game/world.js'\n"
    "import { enemyExtras, buildEnemyMesh, updateEnemyVisuals, hideEnemyExtras } from '../game/enemies.js'",
    'imports')

# 2. lint fixes (unused vars)
rep_re(r"^[ \t]*const isCyan = Math\.random\(\) > 0\.5\n", '', 'lint isCyan')
rep_re(r"^[ \t]*const color = isCyan \? 0x00ffff : 0xff00ff\n", '', 'lint color')
rep_re(r"^[ \t]*const colors = \{ pistol: 0x00ffff, shotgun: 0xffff00, sniper: 0xff00ff \}\n", '', 'lint colors')

# 3. world handle + build + per-frame update
rep("let soldier = null", "let soldier = null\nlet world = null", 'world var')
rep("miniMapCamera = new THREE.OrthographicCamera(",
    "world = buildWorld(scene, obstacles, barrels)\n  miniMapCamera = new THREE.OrthographicCamera(", 'world build')
rep_re(r"^[ \t]*composer\.render\(\)",
       "    world?.update(dt, now / 1000)\n    composer.render()", 'world update')

# 4. spawning: new types, avoid spawning inside objects, extra fields
rep_re(r"if \(r < 0\.25\) type = 'runner'\s+else if \(r < 0\.4\) type = 'tank'\s+else if \(r < 0\.5\) type = 'sniper'",
       "if (r < 0.2) type = 'runner'\n"
       "      else if (r < 0.33) type = 'tank'\n"
       "      else if (r < 0.43) type = 'sniper'\n"
       "      else if (r < 0.53 && wave.value >= 2) type = 'bomber'\n"
       "      else if (r < 0.65 && wave.value >= 3) type = 'elite'",
       'spawn types')
rep("} while (Math.hypot(sx - me.x, sz - me.z) < 25)",
    "} while (Math.hypot(sx - me.x, sz - me.z) < 25 || isBlocked(sx, sz, 2))", 'spawn blocked')
rep("attackT: 0, hitT: 0, hitDir: new THREE.Vector3(),",
    "attackT: 1 + Math.random() * 1.5, hitT: 0, hitDir: new THREE.Vector3(), ...enemyExtras(type, cfg),",
    'enemy fields')

# 5. kill feed names + hide bars on death
rep("sniper: 'Sniper', boss: 'BOSS' }", "sniper: 'Sniper', bomber: 'Bomber', elite: 'Elite', boss: 'BOSS' }", 'names')
rep("if (mesh.userData.mixer) mesh.userData.mixer.stopAllAction()",
    "if (mesh.userData.mixer) mesh.userData.mixer.stopAllAction()\n  hideEnemyExtras(mesh)", 'hide extras')

# 6. combat: cleaner hitbox, shield absorb, bullets blocked by cover
rep("const enemyBox = new THREE.Box3().setFromObject(mesh)", "const enemyBox = enemyHitBox(mesh, e)", 'hitbox')
rep("e.hp -= finalDamage",
    "if (e.shield > 0) { const soak = Math.min(e.shield, finalDamage); e.shield -= soak; finalDamage -= soak }\n"
    "        e.hp -= finalDamage", 'shield')
rep("l.mesh.position.add(l.vel.clone().multiplyScalar(dt))",
    "const px0 = l.mesh.position.x, py0 = l.mesh.position.y, pz0 = l.mesh.position.z\n"
    "      l.mesh.position.add(l.vel.clone().multiplyScalar(dt))", 'laser prev pos')
rep("let hit = false",
    "let hit = pathBlocked(px0, py0, pz0, l.mesh.position.x, l.mesh.position.y, l.mesh.position.z)\n"
    "      if (hit) spawnParticles(l.mesh.position, 0xcccccc, 4)", 'laser blocked')
rep("const laserBox = new THREE.Box3().setFromCenterAndSize(l.mesh.position, new THREE.Vector3(0.8, 0.8, 2))",
    "const laserBox = hit ? new THREE.Box3() : new THREE.Box3().setFromCenterAndSize(l.mesh.position, new THREE.Vector3(0.8, 0.8, 2))",
    'laserBox')
rep("b.userData.life -= dt",
    "b.userData.life -= dt\n      if (isBlocked(b.position.x, b.position.z, 0, b.position.y)) b.userData.life = 0", 'enemy bullet blocked')

# 7. top-level helpers (before spawnWave)
HELPERS = r'''const _tv = new THREE.Vector3()
const _eb = new THREE.Box3()

function isBlocked(x, z, margin = 0, y = 1) {
  _tv.set(x, y, z)
  for (const obs of obstacles) {
    const b = (obs.userData.boxE ||= new THREE.Box3().setFromObject(obs))
    if (margin > 0 ? b.distanceToPoint(_tv) < margin : b.containsPoint(_tv)) return true
  }
  return false
}

function pathBlocked(x0, y0, z0, x1, y1, z1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 0.5))
  for (let i = 1; i <= n; i++) {
    const t = i / n
    if (isBlocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0, y0 + (y1 - y0) * t)) return true
  }
  return false
}

function enemyHitBox(mesh, e) {
  const w = 0.45 * e.scale
  const h = 1.85 * e.scale
  const p = mesh.position
  _eb.min.set(p.x - w, p.y, p.z - w)
  _eb.max.set(p.x + w, p.y + h, p.z + w)
  return _eb
}

function spawnWave() {'''
rep("function spawnWave() {", HELPERS, 'helpers')

# 8. AI: replace the old per-enemy loop inside updateAI
a = s.find("const dx = me.x - e.x, dz = me.z - e.z")
b = s.find("const a = enemies[i]; if (a.dead) continue")
if a < 0 or b < 0: fail('AI markers')
start = s.rfind("for (const e of enemies) {", 0, a)
end = s.rfind("for (let i = 0; i < enemies.length; i++) {", 0, b)
if start < 0 or end < 0 or end < start: fail('AI loop bounds')
s = s[:start] + "trackPlayer(dt)\n    for (const e of enemies) {\n      if (e.dead) continue\n      updateEnemyAI(e, dt)\n    }\n\n    " + s[end:]

# 9. AI functions (replaces fireEnemyBullet)
AI = r'''  let pvx = 0, pvz = 0, lpx = 0, lpz = 0
  const UP = new THREE.Vector3(0, 1, 0)
  const _dir = new THREE.Vector3()

  function trackPlayer(dt) {
    if (dt <= 0) return
    pvx += ((me.x - lpx) / dt - pvx) * 0.3
    pvz += ((me.z - lpz) / dt - pvz) * 0.3
    const sp = Math.hypot(pvx, pvz)
    if (sp > 12) { pvx *= 12 / sp; pvz *= 12 / sp }
    lpx = me.x; lpz = me.z
  }

  function moveEnemy(e, ang, mul, dt) {
    const step = e.speed * mul * dt
    const nx = e.x + Math.sin(ang) * step, nz = e.z + Math.cos(ang) * step
    if (!isBlocked(nx, nz)) { e.x = nx; e.z = nz }
    else if (!isBlocked(nx, e.z)) e.x = nx
    else if (!isBlocked(e.x, nz)) e.z = nz
    else {
      const side = ang + (Math.PI / 2) * e.strafeDir
      const sx = e.x + Math.sin(side) * step, sz = e.z + Math.cos(side) * step
      if (!isBlocked(sx, sz)) { e.x = sx; e.z = sz } else e.strafeDir *= -1
    }
    e.x = Math.max(-98, Math.min(98, e.x))
    e.z = Math.max(-98, Math.min(98, e.z))
  }

  function makeEnemy(type, x, z) {
    const cfg = ENEMY_CONFIG[type]
    const waveScale = 1 + (wave.value - 1) * 0.06
    const hp = Math.round(cfg.hp * waveScale)
    return {
      id: 'enemy_m' + Math.random(), type, x, z, ry: 0, hp, maxHp: hp, dead: false,
      attackT: 1, hitT: 0, hitDir: new THREE.Vector3(),
      scale: cfg.scale, speed: cfg.speed * waveScale, color: cfg.color,
      attackDist: cfg.attackDist, bulletDmg: cfg.bulletDmg, bulletColor: cfg.bulletColor,
      weakPoint: cfg.weakPoint, strafeDir: Math.random() > 0.5 ? 1 : -1,
      ...enemyExtras(type, cfg)
    }
  }
  function spawnMinion(type, x, z) { enemies.push(makeEnemy(type, x, z)) }

  function bomberBlast(e) {
    playSound('explosion')
    spawnParticles(new THREE.Vector3(e.x, 1, e.z), 0xff5522, 25)
    cameraShake = Math.max(cameraShake, 0.35)
    if (Math.hypot(me.x - e.x, me.z - e.z) < 7) damagePlayer(35, e.x, e.z)
    e.dead = true
    const m = scene.getObjectByName(e.id)
    if (m) scene.remove(m)
  }

  function fireEnemyBullet(e, speed, opts = {}) {
    const { yaw = 0, err = 0, size = 1, dmgMult = 1, lead = true, aim = true } = opts
    const sy = Math.min(1.5 * e.scale, 2.2)
    if (aim) {
      const d = Math.hypot(me.x - e.x, me.z - e.z)
      const t = lead ? (d / speed) * 0.8 : 0
      _dir.set(me.x + pvx * t - e.x, camera.position.y - 0.3 - sy, me.z + pvz * t - e.z).normalize()
      const a = yaw + (Math.random() - 0.5) * 2 * err * Math.max(0.5, 1.3 - wave.value * 0.06)
      if (a !== 0) _dir.applyAxisAngle(UP, a)
    } else {
      _dir.set(Math.sin(yaw), 0, Math.cos(yaw))
    }
    const geo = new THREE.SphereGeometry(0.15 * size, 6, 6)
    const mat = new THREE.MeshBasicMaterial({ color: e.bulletColor || 0xffc766 })
    const eb = new THREE.Mesh(geo, mat)
    eb.position.set(e.x + Math.sin(e.ry) * 0.7, sy, e.z + Math.cos(e.ry) * 0.7)
    eb.userData.vel = _dir.clone().multiplyScalar(speed)
    eb.userData.life = Math.min(4, (e.attackDist * 1.2) / speed)
    eb.userData.dmg = e.bulletDmg * dmgMult
    e.flashT = 0.06
    scene.add(eb); enemyBullets.push(eb)
  }

  function updateEnemyAI(e, dt) {
    const dx = me.x - e.x, dz = me.z - e.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    e.dist = dist
    if (e.hitT > 0) { e.hitT -= dt; if (!e.heavy) return }
    e.dashCd -= dt; e.dashT -= dt; e.losT -= dt
    if (e.losT <= 0) { e.los = dist < 3 || hasLineOfSight(e.x, e.z, me.x, me.z); e.losT = 0.15 + Math.random() * 0.1 }
    const los = e.los
    const ang = Math.atan2(dx, dz)
    e.ry = ang
    if (Math.random() < dt * 0.5) e.strafeDir *= -1
    const side = (Math.PI / 2) * e.strafeDir
    const melee = (dmg, cd) => { e.attackT -= dt; if (e.attackT <= 0) { damagePlayer(dmg, e.x, e.z); e.attackT = cd } }

    switch (e.type) {
      case 'normal': {
        if (dist > 28) moveEnemy(e, ang, 1, dt)
        else if (dist > 13) moveEnemy(e, ang + side, 0.8, dt)
        else if (dist > 3) moveEnemy(e, ang + Math.PI - side * 0.4, 0.6, dt)
        if (dist <= 3) melee(15, 1)
        else if (dist < e.attackDist && los) {
          e.attackT -= dt
          if (e.attackT <= 0) {
            fireEnemyBullet(e, 30, { err: 0.07 })
            e.burstLeft--
            if (e.burstLeft > 0) e.attackT = 0.14
            else { e.burstLeft = 3; e.attackT = 1.4 + Math.random() * 0.8 }
          }
        }
        break
      }
      case 'elite': {
        if (e.dashCd <= 0) { e.dashCd = 2 + Math.random() * 2; e.dashT = 0.3; e.strafeDir *= -1 }
        const dash = e.dashT > 0
        if (dist > 30) moveEnemy(e, ang, 1, dt)
        else if (dist > 6) moveEnemy(e, ang + side, dash ? 3.2 : 0.9, dt)
        else moveEnemy(e, ang + Math.PI - side * 0.3, 0.9, dt)
        if (dist < e.attackDist && los) {
          e.attackT -= dt
          if (e.attackT <= 0) {
            fireEnemyBullet(e, 38, { err: 0.03 })
            e.burstLeft--
            if (e.burstLeft > 0) e.attackT = 0.1
            else { e.burstLeft = 4; e.attackT = 1.1 + Math.random() * 0.5 }
          }
        }
        break
      }
      case 'runner': {
        if (dist > 2.2) {
          if (e.dashCd <= 0 && dist < 10) { e.dashCd = 3 + Math.random() * 2; e.dashT = 0.4 }
          const zig = Math.sin(performance.now() * 0.008 + e.seed) * (dist > 6 ? 0.6 : 0.15)
          moveEnemy(e, ang + zig, e.dashT > 0 ? 2.4 : 1, dt)
        } else melee(10, 0.8)
        break
      }
      case 'tank': {
        if (dist > 4) {
          moveEnemy(e, ang, 1, dt)
          if (dist < e.attackDist && los) {
            e.attackT -= dt
            if (e.attackT <= 0) {
              for (const y of [-0.1, 0, 0.1]) fireEnemyBullet(e, 24, { yaw: y, err: 0.02, size: 1.5 })
              e.attackT = 2.2
            }
          }
        } else melee(30, 1.5)
        break
      }
      case 'sniper': {
        if (dist < 28) moveEnemy(e, ang + Math.PI, 1, dt)
        else if (dist > 65) moveEnemy(e, ang, 0.5, dt)
        else moveEnemy(e, ang + side, 0.3, dt)
        if (dist < e.attackDist && dist > 10 && los) {
          e.attackT -= dt
          if (e.attackT <= 0) { fireEnemyBullet(e, 55, { err: 0.006, size: 1.2 }); e.attackT = 2.8 + Math.random() }
        }
        break
      }
      case 'bomber': {
        if (e.fuse > 0) {
          e.fuse -= dt
          moveEnemy(e, ang, 0.3, dt)
          if (e.fuse <= 0) { bomberBlast(e); return }
        } else {
          const zig = Math.sin(performance.now() * 0.006 + e.seed) * 0.35
          moveEnemy(e, ang + zig, 1, dt)
          if (dist < 4.5) e.fuse = 0.7
        }
        break
      }
      case 'boss': {
        const ratio = e.hp / e.maxHp
        const phase = ratio < 0.33 ? 3 : ratio < 0.66 ? 2 : 1
        if (phase > e.phase) {
          e.phase = phase
          announce(phase === 2 ? 'PHASE 2' : 'ENRAGED', '☠ BOSS ☠', 1600)
          cameraShake = Math.max(cameraShake, 0.5)
          const kind = phase === 2 ? 'runner' : 'bomber'
          for (let k = -1; k <= 1; k++) spawnMinion(kind, e.x + k * 5, e.z + 5)
        }
        const mul = phase === 3 ? 1.5 : 1
        if (dist > 14) moveEnemy(e, ang, mul, dt)
        else if (dist > 5) moveEnemy(e, ang + side, 0.6 * mul, dt)
        if (dist <= 5) melee(50, 1.2)
        else if (dist < e.attackDist && los) {
          e.attackT -= dt
          if (e.attackT <= 0) {
            const spread = phase === 1 ? [-0.12, 0, 0.12] : [-0.2, -0.1, 0, 0.1, 0.2]
            for (const y of spread) fireEnemyBullet(e, 28, { yaw: y, err: 0.01, size: 2, lead: false })
            e.attackT = phase === 3 ? 0.7 : 1
          }
          if (phase === 3) {
            e.ringT -= dt
            if (e.ringT <= 0) {
              e.ringT = 3
              const off = Math.random() * Math.PI
              for (let k = 0; k < 16; k++) fireEnemyBullet(e, 14, { aim: false, yaw: off + (k / 16) * Math.PI * 2, size: 1.6, dmgMult: 0.6 })
            }
          }
        }
        break
      }
      default:
        break
    }
  }

'''
a = s.find("  function fireEnemyBullet(e, dx, dz, speed) {")
b = s.find("  function updateRenderables(dt) {")
if a < 0 or b < 0 or b < a: fail('fireEnemyBullet bounds')
s = s[:a] + AI + s[b:]

# 10. visuals hook in updateRenderables
rep_re(r"^[ \t]*if \(m\.userData\.flash\) m\.userData\.flash\.visible = .*$", "      updateEnemyVisuals(m, e, dt)", 'visuals hook')

# 11. enemy mesh now built in enemies.js
a = s.find("  function createEnemyMesh(e) {")
b = s.find("\n  loop()\n")
if a < 0 or b < 0 or b < a: fail('createEnemyMesh bounds')
s = s[:a] + "  function createEnemyMesh(e) {\n    return buildEnemyMesh(e, soldier)\n  }\n" + s[b:]

shutil.copy(P, 'Game.vue.bak')
open(P, 'w', encoding='utf-8').write(s)
print('OK - Game.vue patched (backup: Game.vue.bak)')
