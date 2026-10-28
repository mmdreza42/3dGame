<template>
  <div style="position:fixed;inset:0;overflow:hidden;">
    <div ref="root" style="position:fixed;inset:0;"></div>

    <!-- HUD -->
    <div v-if="gameState === 'playing'" style="position:fixed;bottom:20px;left:20px;color:#fff;font:bold 20px 'Courier New', monospace;text-shadow:0 0 10px #00ffff;z-index:5;">
      <div style="color:#ff0055;">HP: {{ playerHp }} / {{ maxHp }}</div>
      <div style="font-size:24px;color:#00ffff;margin-top:4px;font-weight:bold;">
        {{ currentWeapon.toUpperCase() }}:
        <span v-if="isReloading" style="color:#ffaa00;">RELOADING...</span>
        <span v-else>{{ currentAmmo }} / {{ maxAmmo }}</span>
      </div>
      <div style="display:flex;gap:12px;margin-top:6px;font-size:13px;">
        <span v-for="(w, i) in WEAPON_LIST" :key="w" :style="{ color: currentWeapon === w ? '#00ffff' : '#6a7a8a' }">{{ i + 1 }} {{ w.toUpperCase() }}</span>
      </div>
      <div v-if="overchargeTimer > 0" style="font-size:16px;color:#ff00ff;margin-top:4px;">⚡ OVERCHARGE: {{ Math.ceil(overchargeTimer) }}s</div>
      <div v-if="comboCount > 1" style="font-size:22px;color:#ffd700;margin-top:4px;text-shadow:0 0 10px #ffd700;">🔥 COMBO x{{ comboCount }}</div>
    </div>

    <div v-if="gameState === 'playing'" style="position:fixed;top:20px;left:20px;color:#fff;font:bold 24px 'Courier New', monospace;text-shadow:0 0 10px #00ffff;z-index:5;">
      <div>WAVE: <span style="color:#00ffff">{{ wave }}</span> <span v-if="wave % 5 === 0" style="color:red;font-size:18px;text-shadow:0 0 10px red;">[BOSS]</span></div>
      <div>SCORE: <span style="color:#ffd700">{{ score }}</span></div>
      <div>SCRAP: <span style="color:#00ffaa">{{ scrap }}</span></div>
      <div style="font-size:16px;color:#ff0055;margin-top:4px;">Enemies Left: {{ enemiesLeft }}</div>
    </div>

    <div v-if="gameState === 'playing'" style="position:fixed;top:20px;right:240px;z-index:6;display:flex;flex-direction:column;align-items:flex-end;">
      <div v-for="k in killFeed" :key="k.id" style="background:rgba(0,0,0,0.7);color:#00ffff;padding:6px 12px;margin-bottom:4px;border-radius:2px;font:14px 'Courier New', monospace;border-left:2px solid #ff0055;box-shadow:0 0 10px rgba(0,255,255,0.2);">{{ k.text }}</div>
    </div>

    <div v-if="announceVisible" style="position:fixed;top:35%;left:50%;transform:translate(-50%,-50%);z-index:25;pointer-events:none;text-align:center;">
      <div style="font:bold 72px 'Courier New', monospace;color:#00ffff;text-shadow:0 0 30px #00ffff,0 0 60px #00ffff,0 4px 8px #000;letter-spacing:8px;">{{ announceText }}</div>
      <div v-if="announceSub" style="font:bold 24px 'Courier New', monospace;color:#ff0055;text-shadow:0 0 20px #ff0055,0 2px 4px #000;margin-top:8px;">{{ announceSub }}</div>
    </div>

    <div v-if="gameState === 'playing'" style="position:fixed; top:20px; right:20px; width:200px; height:200px; border:2px solid #00ffff; pointer-events:none; z-index:5; background:rgba(0,0,0,0.6); box-shadow: 0 0 15px rgba(0,255,255,0.3);"></div>

    <!-- Hip crosshair: the four ticks open up with your current spread (moving, jumping, rapid fire) -->
    <div v-if="gameState === 'playing' && !isAiming" style="position:fixed;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:20;">
      <div style="position:absolute;left:-1.5px;top:-1.5px;width:3px;height:3px;background:#fff;border-radius:50%;box-shadow:0 0 4px #00ffff;"></div>
      <div v-for="t in crossTicks" :key="t.k" :style="{ position: 'absolute', background: '#00ffff', boxShadow: '0 0 3px #000, 0 0 6px #00ffff', ...t.s }"></div>
    </div>

    <!-- Iron sights / red dot while aiming (not scoped) -->
    <div v-if="gameState === 'playing' && isAiming && !scopeVisible" style="position:fixed;top:50%;left:50%;width:4px;height:4px;transform:translate(-50%,-50%);background:rgba(255,40,40,0.85);border-radius:50%;box-shadow:0 0 6px red;pointer-events:none;z-index:20;"></div>

    <!-- Sniper scope -->
    <div v-if="gameState === 'playing' && scopeVisible" style="position:fixed;inset:0;pointer-events:none;z-index:20;">
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%, transparent 0, transparent 30vmin, #000 30.4vmin);"></div>
      <div style="position:absolute;top:50%;left:calc(50% - 30vmin);width:60vmin;height:1px;background:rgba(0,0,0,0.9);"></div>
      <div style="position:absolute;left:50%;top:calc(50% - 30vmin);height:60vmin;width:1px;background:rgba(0,0,0,0.9);"></div>
      <div style="position:absolute;top:50%;left:50%;width:4px;height:4px;background:red;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 10px red;"></div>
    </div>

    <div v-if="gameState === 'playing' && hitmarker" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:21;width:24px;height:24px;">
      <div :style="{position:'absolute',width:'100%',height:'3px',background:hitmarkerColor,transform:'rotate(45deg)',top:'11px',boxShadow:'0 0 8px '+hitmarkerColor}"></div>
      <div :style="{position:'absolute',width:'100%',height:'3px',background:hitmarkerColor,transform:'rotate(-45deg)',top:'11px',boxShadow:'0 0 8px '+hitmarkerColor}"></div>
    </div>

    <!-- Ladder prompt -->
    <div v-if="gameState === 'playing' && climbPrompt" style="position:fixed;top:58%;left:50%;transform:translateX(-50%);z-index:21;pointer-events:none;font:bold 18px 'Courier New', monospace;color:#00ffff;text-shadow:0 0 10px #00ffff,0 2px 4px #000;background:rgba(0,0,0,0.45);padding:6px 14px;border:1px solid #00ffff;white-space:nowrap;">{{ climbPrompt }}</div>

    <div v-if="showHitDir" style="position:fixed;inset:0;pointer-events:none;z-index:18;">
      <div :style="{position:'absolute',top:'50%',left:'50%',transform:`rotate(${hitDirAngle}rad)`}">
        <div style="position:absolute;top:-160px;left:-40px;width:80px;height:60px;background:radial-gradient(ellipse at bottom, rgba(255,0,0,1), transparent 70%);border-radius:50%;opacity:0.9;filter:drop-shadow(0 0 10px red);"></div>
      </div>
    </div>

    <div v-if="isHurt" style="position:fixed;inset:0;background:radial-gradient(circle, transparent 50%, rgba(255,0,0,0.6) 100%);pointer-events:none;z-index:20;"></div>

    <!-- SHOP -->
    <div v-if="gameState === 'shop'" style="position:fixed;inset:0;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:'Courier New', monospace;">
      <h1 style="font-size:48px;color:#00ffff;text-shadow:0 0 20px #00ffff;margin:0;letter-spacing:4px;">WAVE CLEARED</h1>
      <h2 style="font-size:24px;color:#ffd700;margin-top:10px;">Scrap Available: {{ scrap }}</h2>
      <div style="display:flex;gap:20px;margin-top:40px;">
        <div style="background:rgba(255,0,85,0.1);padding:20px;border-radius:4px;border:2px solid #ff0055;text-align:center;width:220px;box-shadow:0 0 15px rgba(255,0,85,0.3);">
          <h3 style="color:#ff0055;margin:0 0 10px 0;">Max HP +20</h3>
          <p style="font-size:12px;color:#aaa;height:30px;">Current: {{ maxHp }} HP</p>
          <button @click="buyUpgrade('hp')" :disabled="scrap < 150" style="width:100%;padding:10px;background:#ff0055;color:#fff;border:none;border-radius:2px;cursor:pointer;font-weight:bold;">150 SCRAP</button>
        </div>
        <div style="background:rgba(255,170,0,0.1);padding:20px;border-radius:4px;border:2px solid #ffaa00;text-align:center;width:220px;box-shadow:0 0 15px rgba(255,170,0,0.3);">
          <h3 style="color:#ffaa00;margin:0 0 10px 0;">Damage +25%</h3>
          <p style="font-size:12px;color:#aaa;height:30px;">Current: {{ (damageMult * 100).toFixed(0) }}%</p>
          <button @click="buyUpgrade('damage')" :disabled="scrap < 250" style="width:100%;padding:10px;background:#ffaa00;color:#fff;border:none;border-radius:2px;cursor:pointer;font-weight:bold;">250 SCRAP</button>
        </div>
        <div style="background:rgba(0,255,204,0.1);padding:20px;border-radius:4px;border:2px solid #00ffcc;text-align:center;width:220px;box-shadow:0 0 15px rgba(0,255,204,0.3);">
          <h3 style="color:#00ffcc;margin:0 0 10px 0;">Reload +20%</h3>
          <p style="font-size:12px;color:#aaa;height:30px;">Current: {{ (reloadMult * 100).toFixed(0) }}%</p>
          <button @click="buyUpgrade('reload')" :disabled="scrap < 200" style="width:100%;padding:10px;background:#00ffcc;color:#000;border:none;border-radius:2px;cursor:pointer;font-weight:bold;">200 SCRAP</button>
        </div>
      </div>
      <button @click="startNextWave" style="margin-top:50px;padding:15px 40px;font-size:24px;font-weight:bold;background:#00ffff;color:#000;border:none;border-radius:2px;cursor:pointer;box-shadow:0 0 20px #00ffff;">START WAVE {{ wave + 1 }}</button>
    </div>

    <div v-if="gameState === 'menu' || gameState === 'paused' || gameState === 'dead'" style="position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:'Courier New', monospace;">
      <h1 v-if="gameState === 'menu'" style="font-size:72px;margin:0;color:#00ffff;text-shadow:0 0 30px #00ffff;letter-spacing:10px;">NEXUS STRIKE</h1>
      <h1 v-if="gameState === 'paused'" style="font-size:48px;margin:0;color:#00ffff;">PAUSED</h1>
      <h1 v-if="gameState === 'dead'" style="font-size:64px;margin:0;color:#ff0055;text-shadow:0 0 20px #ff0055;">YOU DIED</h1>
      <p v-if="gameState === 'menu' && highScore > 0" style="color:#ffd700;margin-top:10px;font-size:20px;">HIGH SCORE: {{ highScore }}</p>
      <p v-if="gameState === 'dead' && score >= highScore && score > 0" style="color:#ffd700;margin-top:10px;font-size:20px;">🏆 NEW HIGH SCORE!</p>
      <p v-if="gameState === 'menu'" style="font-size:18px;color:#aaa;margin-top:20px;max-width:460px;text-align:center;line-height:1.6;">
        WASD • Mouse look • Shift sprint • Space jump<br>
        LMB shoot (hold to keep firing) • Hold RMB to aim • R reload • 1/2/3 weapons<br>
        E (or W at the foot) climbs watchtower ladders<br>
        Headshots deal 2x damage • Tank weakpoints deal 3x<br>
        Waves are endless — survive as long as you can.
      </p>
      <button @click="startGame" style="margin-top:40px;padding:15px 40px;font-size:24px;font-weight:bold;background:#00ffff;color:#000;border:none;border-radius:2px;cursor:pointer;box-shadow:0 0 20px #00ffff;">
        {{ gameState === 'menu' ? 'INITIALIZE' : gameState === 'dead' ? 'REBOOT' : 'RESUME' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { WEAPON_CONFIG, weaponAmmo, ENEMY_CONFIG } from '../game/config.js'
import { CinematicShader } from '../game/shader.js'
import { initAudio, playSound } from '../game/audio.js'
import { buildWorld } from '../game/world.js'
import { buildGuns } from '../game/guns.js'
import { enemyExtras, buildEnemyMesh, updateEnemyVisuals, hideEnemyExtras } from '../game/enemies.js'

const WEAPON_LIST = ['pistol', 'shotgun', 'sniper']

const root = ref(null)
const playerHp = ref(100)
const maxHp = ref(100)
const isHurt = ref(false)
const hitmarker = ref(false)
const hitmarkerColor = ref('#ff0000')
const currentWeapon = ref('pistol')
const gameState = ref('menu')
const wave = ref(1)
const score = ref(0)
const scrap = ref(0)
const enemiesLeft = ref(0)
const isAiming = ref(false)
const currentAmmo = ref(12)
const maxAmmo = ref(12)
const isReloading = ref(false)
const overchargeTimer = ref(0)
const damageMult = ref(1.0)
const reloadMult = ref(1.0)
const comboCount = ref(1)
const announceText = ref('')
const announceSub = ref('')
const announceVisible = ref(false)
const killFeed = ref([])
const hitDirAngle = ref(0)
const showHitDir = ref(false)
const climbPrompt = ref('')
const crossGap = ref(12)
const scopeVisible = ref(false)
const highScore = ref(parseInt(localStorage.getItem('nexus_highscore') || '0'))

const crossTicks = computed(() => {
  const g = crossGap.value, L = 9
  return [
    { k: 't', s: { left: '-1px', top: `${-g - L}px`, width: '2px', height: `${L}px` } },
    { k: 'b', s: { left: '-1px', top: `${g}px`, width: '2px', height: `${L}px` } },
    { k: 'l', s: { top: '-1px', left: `${-g - L}px`, width: `${L}px`, height: '2px' } },
    { k: 'r', s: { top: '-1px', left: `${g}px`, width: `${L}px`, height: '2px' } }
  ]
})

let renderer, frame, onResize, onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp, onPointerLockChange, onContextMenu
let scene, camera, miniMapCamera
let composer, bloomPass, rgbShiftPass, smaaPass, vignettePass, outputPass
let soldier = null
let world = null
let groundMesh = null
let explosionLight = null
let explosionTimer = 0

const playerLasers = [], enemyBullets = [], particles = [], ragdolls = [], lootItems = [], damageNumbers = []
const keys = {}
const me = { x: 0, z: 0, ry: 0 }
let verticalVel = 0, isGrounded = true

// ---- weapon / view model state ----
let guns = null, activeGun = null
const gunSway = new THREE.Vector3(0, 0, 0)
let moveBobTime = 0, currentMoveAmount = 0, lastShootTime = 0, cameraShake = 0
let landingKick = 0, fovKick = 0
let adsT = 0, sprintT = 0, swapT = 0, flashT = 0, cycleT = 0
let kickZ = 0, kickRot = 0, recoilAccum = 0, bloom = 0
let reloadStart = 0, reloadDur = 1
let rmbDown = false, lmbDown = false
let fovBase = 70, sensMul = 1, camRoll = 0
let prevRy = 0, prevPitch = 0

// ---- ladders / platforms ----
let climbing = null, ladders = [], platforms = []

const obstacles = [], barrels = []
let enemies = []
const groundRaycaster = new THREE.Raycaster()

let hurtTimer = null, hitmarkerTimer = null, hitDirTimer = null, announceTimer = null
let reloadToken = 0

const _up = new THREE.Vector3(0, 1, 0)
const _camDir = new THREE.Vector3()
const _cp = new THREE.Vector3()
const _aimRay = new THREE.Raycaster()
const _aimHit = new THREE.Vector3()

const smooth = (t) => t * t * (3 - 2 * t)

function spawnDamageNumber(pos, damage, color = '#ff5555', scale = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.font = 'bold 64px Arial'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#000'; ctx.lineWidth = 10
  ctx.strokeText(Math.floor(damage), 128, 64)
  ctx.fillStyle = color
  ctx.fillText(Math.floor(damage), 128, 64)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.position.copy(pos); sprite.position.y += 1.5
  sprite.scale.set(2 * scale, 1 * scale, 1)
  scene.add(sprite)
  damageNumbers.push({ sprite, mat, tex, life: 0.8, vy: 2 })
}

let killFeedId = 0
function addKillFeed(text) {
  const id = killFeedId++
  killFeed.value.push({ id, text })
  setTimeout(() => { killFeed.value = killFeed.value.filter(k => k.id !== id) }, 3000)
}

function announce(text, sub = '', duration = 1500) {
  announceText.value = text; announceSub.value = sub; announceVisible.value = true
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => { announceVisible.value = false }, duration)
}

// Line of sight now checks height too, so enemies can see (and shoot) a player standing on a tower
const _losRay = new THREE.Raycaster()
function hasLineOfSight(fromX, fromZ, toX, toZ, toY = 1.5) {
  const dx = toX - fromX, dy = toY - 1.5, dz = toZ - fromZ
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (dist < 0.1) return true
  _losRay.set(new THREE.Vector3(fromX, 1.5, fromZ), new THREE.Vector3(dx / dist, dy / dist, dz / dist))
  _losRay.far = dist
  return _losRay.intersectObjects(obstacles, true).length === 0
}

function triggerHurt() { isHurt.value = true; clearTimeout(hurtTimer); hurtTimer = setTimeout(() => { isHurt.value = false }, 150) }
function triggerHitmarker(color = '#ff0000') {
  hitmarkerColor.value = color; hitmarker.value = true
  clearTimeout(hitmarkerTimer); hitmarkerTimer = setTimeout(() => { hitmarker.value = false }, 120)
}
function triggerHitDirection(sx, sz) {
  const fdx = -Math.sin(me.ry), fdz = -Math.cos(me.ry)
  const tdx = sx - me.x, tdz = sz - me.z
  hitDirAngle.value = Math.atan2(fdx * tdz - fdz * tdx, fdx * tdx + fdz * tdz)
  showHitDir.value = true
  clearTimeout(hitDirTimer)
  hitDirTimer = setTimeout(() => { showHitDir.value = false }, 900)
}
function damagePlayer(amount, sx, sz) {
  playerHp.value -= amount
  triggerHurt(); triggerHitDirection(sx, sz)
  cameraShake = Math.max(cameraShake, 0.15)
  rgbShiftPass.uniforms['amount'].value = 0.005
  playSound('hurt')
  if (comboCount.value > 1) { comboCount.value = 1; addKillFeed('💔 Combo Broken') }
  if (playerHp.value <= 0) checkDeath()
}

function reloadWeapon() {
  if (isReloading.value) return
  const cfg = WEAPON_CONFIG[currentWeapon.value]
  if (currentAmmo.value === cfg.maxAmmo) return
  isReloading.value = true
  playSound('reload')
  reloadStart = performance.now()
  reloadDur = cfg.reloadTime / reloadMult.value
  const weaponAtStart = currentWeapon.value
  const myToken = ++reloadToken
  setTimeout(() => {
    if (myToken !== reloadToken || currentWeapon.value !== weaponAtStart) return
    isReloading.value = false
    weaponAmmo[currentWeapon.value] = cfg.maxAmmo
    currentAmmo.value = cfg.maxAmmo
  }, reloadDur)
}

function buyUpgrade(type) {
  if (type === 'hp' && scrap.value >= 150) { scrap.value -= 150; maxHp.value += 20; playerHp.value += 20; playSound('heal') }
  else if (type === 'damage' && scrap.value >= 250) { scrap.value -= 250; damageMult.value += 0.25; playSound('reload') }
  else if (type === 'reload' && scrap.value >= 200) { scrap.value -= 200; reloadMult.value += 0.20; playSound('reload') }
}

function startNextWave() { wave.value++; climbing = null; gameState.value = 'playing'; renderer.domElement.requestPointerLock(); spawnWave() }

function spawnParticles(pos, color, count) {
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color }))
    p.position.copy(pos)
    p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15)
    p.userData.life = 0.6
    scene.add(p); particles.push(p)
  }
}

// ======================= WEAPONS =======================

function equipGun(name) {
  if (!guns) return
  for (const k in guns.models) {
    const g = guns.models[k]
    g.group.visible = k === name
    if (g.cycle) g.cycle.position.z = g.cycleBaseZ
  }
  activeGun = guns.models[name]
  activeGun.muzzle.add(guns.flash, guns.light)
  guns.flash.visible = false
  guns.light.intensity = 0
  cycleT = 0; flashT = 0
}

function switchWeapon(name) {
  if (currentWeapon.value === name || !guns) return
  weaponAmmo[currentWeapon.value] = currentAmmo.value
  currentWeapon.value = name
  currentAmmo.value = weaponAmmo[name]
  maxAmmo.value = WEAPON_CONFIG[name].maxAmmo
  isReloading.value = false
  reloadToken++
  equipGun(name)
  swapT = 1
}

// Where the crosshair is pointing: nearest wall/obstacle or enemy along the view ray
function getAimPoint(dir) {
  _aimRay.set(camera.position, dir)
  _aimRay.far = 200
  let dist = 200
  const wall = _aimRay.intersectObjects(obstacles, true)[0]
  if (wall) dist = wall.distance
  for (const e of enemies) {
    if (e.dead) continue
    const m = scene.getObjectByName(e.id)
    if (!m) continue
    if (_aimRay.ray.intersectBox(enemyHitBox(m, e), _aimHit)) {
      const d = _aimHit.distanceTo(camera.position)
      if (d < dist) dist = d
    }
  }
  return { point: camera.position.clone().addScaledVector(dir, dist), dist }
}

// Cone half-angle (radians) of the current shot spread. Also drives the crosshair gap.
function currentSpread() {
  const cfg = WEAPON_CONFIG[currentWeapon.value]
  const k = smooth(adsT)
  const hip = cfg.hipSpread + cfg.moveSpread * currentMoveAmount + bloom + (isGrounded ? 0 : 0.03)
  return hip + (cfg.adsSpread - hip) * k
}

function ejectShell() {
  if (!activeGun || !camera) return
  const p = new THREE.Vector3()
  activeGun.eject.getWorldPosition(p)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.012, 0.034),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 })
  )
  shell.position.copy(p)
  shell.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
  shell.userData.vel = right.multiplyScalar(2 + Math.random() * 1.5).addScaledVector(up, 1.5 + Math.random())
  shell.userData.life = 0.7
  shell.userData.spin = 20
  scene.add(shell); particles.push(shell)
}

function shoot() {
  if (isReloading.value || climbing || !activeGun) return
  const cfg = WEAPON_CONFIG[currentWeapon.value]
  const now = performance.now()
  let fireRate = cfg.fireRate
  if (overchargeTimer.value > 0) fireRate *= 0.5
  if (now - lastShootTime < fireRate) return
  if (currentAmmo.value <= 0) { playSound('empty'); lastShootTime = now; reloadWeapon(); return }

  lastShootTime = now
  currentAmmo.value--
  weaponAmmo[currentWeapon.value] = currentAmmo.value
  const isCrit = overchargeTimer.value > 0
  const damage = cfg.damage * damageMult.value * (isCrit ? 2 : 1)
  const k = smooth(adsT)

  // make sure the view is current, otherwise we'd shoot where we were looking a frame ago
  camera.rotation.y = me.ry
  camera.updateMatrixWorld(true)
  camera.getWorldDirection(_camDir)
  const aim = getAimPoint(_camDir)

  // Bullets leave the muzzle and fly to the point under the crosshair. While aiming, or when a
  // wall is right in front of us, they start at the eye so you never shoot "into" your own gun.
  const origin = new THREE.Vector3()
  if (aim.dist < 1.8 || k > 0.6) origin.copy(camera.position).addScaledVector(_camDir, Math.min(0.6, aim.dist * 0.5))
  else activeGun.muzzle.getWorldPosition(origin)

  const base = aim.point.clone().sub(origin).normalize()
  const right = new THREE.Vector3().crossVectors(base, _up)
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.normalize()
  const upv = new THREE.Vector3().crossVectors(right, base).normalize()
  const spread = currentSpread()

  for (let i = 0; i < cfg.bullets; i++) {
    const shootDir = base.clone()
    if (spread > 0) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread
      shootDir.addScaledVector(right, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r).normalize()
    }
    const t = cfg.tracer
    const laserGeo = new THREE.CylinderGeometry(t.radius, t.radius, t.len, 6)
    laserGeo.rotateX(Math.PI / 2)
    const laserMat = new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.85 })
    const laser = new THREE.Mesh(laserGeo, laserMat)
    laser.position.copy(origin).addScaledVector(shootDir, t.len * 0.5)
    laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), shootDir)
    scene.add(laser)
    playerLasers.push({ mesh: laser, geo: laserGeo, mat: laserMat, vel: shootDir.clone().multiplyScalar(cfg.speed), life: 1.5, damage, color: cfg.color, crit: isCrit })
  }

  playSound(currentWeapon.value)

  // muzzle flash (small while aiming so it doesn't blind you)
  guns.flash.visible = true
  guns.flash.rotation.z = Math.random() * Math.PI
  guns.flash.scale.setScalar(cfg.flashSize * (1 - 0.75 * k) * (0.85 + Math.random() * 0.3))
  guns.light.intensity = cfg.flashLight
  flashT = 0.05
  cycleT = 1                                   // slide / pump / bolt animation
  setTimeout(ejectShell, cfg.ejectDelay)

  // recoil: camera kicks up and then settles back, gun model kicks back
  const rk = cfg.recoil * (1 - 0.35 * k)
  camera.rotation.x += rk
  recoilAccum += rk
  me.ry += (Math.random() - 0.5) * rk * 0.8
  kickZ += cfg.kickZ * (1 - 0.4 * k)
  kickRot += cfg.kickRot * (1 - 0.4 * k)
  cameraShake = Math.max(cameraShake, cfg.shake)
  fovKick = cfg.fovKick * (1 - 0.6 * k)
  bloom = Math.min(0.04, bloom + cfg.bloom)
}

// Moves the gun model every frame: hip/ADS blend, sway, bob, sprint pose, reload, weapon swap, recoil
function updateViewModel(dt, now, k, moving, sprinting) {
  const g = activeGun
  if (!g) return

  const dRy = THREE.MathUtils.clamp(me.ry - prevRy, -0.15, 0.15)
  const dPitch = THREE.MathUtils.clamp(camera.rotation.x - prevPitch, -0.15, 0.15)
  prevRy = me.ry; prevPitch = camera.rotation.x
  gunSway.x += dRy * 0.05
  gunSway.y += dPitch * 0.05
  const decay = Math.pow(0.85, dt * 60)
  gunSway.x *= decay; gunSway.y *= decay
  const swayK = 1 - 0.8 * k

  moveBobTime += dt * (moving ? (sprinting ? 14 : 9.5) : 1.6)
  currentMoveAmount += ((moving ? 1 : 0) - currentMoveAmount) * Math.min(1, dt * 10)
  const bobK = currentMoveAmount * (1 - 0.9 * k) * (sprinting ? 1.6 : 1)
  const bobX = Math.cos(moveBobTime) * 0.012 * bobK
  const bobY = Math.sin(moveBobTime * 2) * 0.009 * bobK
  const breathe = Math.sin(now * 0.0017) * 0.0015 * (1 - currentMoveAmount) * (1 - 0.7 * k)

  kickZ += (0 - kickZ) * Math.min(1, dt * 14)
  kickRot += (0 - kickRot) * Math.min(1, dt * 12)
  swapT = Math.max(0, swapT - dt * 4.5)
  flashT = Math.max(0, flashT - dt)
  guns.flash.visible = flashT > 0
  if (flashT <= 0) guns.light.intensity = 0

  if (g.cycle) {
    let off = 0
    if (cycleT > 0) {
      cycleT = Math.max(0, cycleT - dt / g.cycleTime)
      const prog = THREE.MathUtils.clamp((1 - cycleT - g.cycleDelay) / (1 - g.cycleDelay), 0, 1)
      off = Math.sin(Math.PI * prog) * g.cycleDist
    }
    g.cycle.position.z = g.cycleBaseZ + off
  }

  let reloadPose = 0
  if (isReloading.value) reloadPose = Math.sin(Math.min(1, (now - reloadStart) / reloadDur) * Math.PI)

  g.group.position.set(
    THREE.MathUtils.lerp(g.hip.x, g.ads.x, k) + bobX + gunSway.x * swayK - 0.05 * sprintT,
    THREE.MathUtils.lerp(g.hip.y, g.ads.y, k) + bobY + breathe + gunSway.y * swayK - 0.07 * sprintT - 0.17 * reloadPose - 0.28 * swapT,
    THREE.MathUtils.lerp(g.hip.z, g.ads.z, k) + kickZ + 0.04 * sprintT
  )
  g.group.rotation.set(
    gunSway.y * 2 * swayK + kickRot - 0.5 * sprintT - 0.5 * reloadPose - 0.9 * swapT,
    gunSway.x * 2 * swayK + 0.55 * sprintT + 0.25 * reloadPose,
    0.3 * reloadPose - 0.25 * sprintT
  )

  // the scoped sniper model would fill the screen, so hide it once the scope overlay is up
  g.group.visible = !(currentWeapon.value === 'sniper' && adsT > 0.9)
}

// ======================= LADDERS / PLATFORMS =======================

function platformAt(x, z, feetY) {
  let best = null
  for (const p of platforms) {
    if (Math.abs(x - p.x) <= p.hw && Math.abs(z - p.z) <= p.hd && p.y <= feetY + 0.5 && (!best || p.y > best.y)) best = p
  }
  return best
}
function floorAt(x, z, feetY) { return platformAt(x, z, feetY)?.y ?? 0 }

function findLadder() {
  if (climbing) return null
  const feetY = camera.position.y - 1.6
  for (const L of ladders) {
    if (Math.abs(me.x - L.x) > 0.9) continue
    const dz = me.z - L.z                       // > 0 means in front of the ladder (outside the tower)
    if (feetY < 1.2 && dz > 0 && dz < 1.8) return { L, fromTop: false }
    if (Math.abs(feetY - L.top) < 0.7 && dz > -1.6 && dz < 0.4) return { L, fromTop: true }
  }
  return null
}
function attachLadder(L, fromTop) {
  climbing = L
  verticalVel = 0; isGrounded = false; landingKick = 0
  me.x = L.x; me.z = L.z + 0.55
  if (fromTop) camera.position.y = L.top - 0.35 + 1.6
}
function leaveLadder(jump) {
  if (!climbing) return
  const L = climbing
  climbing = null
  isGrounded = false
  verticalVel = jump ? 6 : 0
  if (jump) me.z = L.z + 0.9
}
function updateClimb(dt) {
  const L = climbing
  const dy = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)
  const spd = (keys.ShiftLeft || keys.ShiftRight) ? 5 : 3
  me.x = L.x; me.z = L.z + 0.55
  verticalVel = 0; landingKick = 0
  camera.position.y += dy * spd * dt
  const feet = camera.position.y - 1.6
  if (dy > 0 && feet >= L.top) {                // top: step onto the deck
    me.z = L.z - 1.0
    camera.position.y = L.top + 1.6
    climbing = null; isGrounded = true
  } else if (dy < 0 && feet <= L.bottom) {      // bottom: step off
    camera.position.y = L.bottom + 1.6
    me.z = L.z + 1.2
    climbing = null; isGrounded = true
  }
}

// ======================= ENEMIES / GAME FLOW =======================

function killEnemy(enemy, isHeadshot = false) {
  const mesh = scene.getObjectByName(enemy.id)
  if (!mesh) return
  if (mesh.userData.mixer) mesh.userData.mixer.stopAllAction()
  hideEnemyExtras(mesh)

  const isCartoon = enemy.type !== 'boss'

  if (isCartoon) {
    ragdolls.push({
      mesh, cartoon: true, state: 'freeze', stateTimer: 0.15, bounces: 0,
      vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, life: 4.0
    })
  } else {
    const impulseDir = new THREE.Vector3(enemy.x - me.x, 0, enemy.z - me.z).normalize()
    ragdolls.push({
      mesh, cartoon: false,
      vx: impulseDir.x * 15 + (Math.random() - 0.5) * 10,
      vy: Math.random() * 12 + 5,
      vz: impulseDir.z * 15 + (Math.random() - 0.5) * 10,
      rx: (Math.random() - 0.5) * 20, ry: (Math.random() - 0.5) * 20, rz: (Math.random() - 0.5) * 20,
      life: 4.0
    })
  }

  if (enemy.type === 'boss') { spawnParticles(mesh.position, 0xffaa00, 40); cameraShake = 0.6 }

  const names = { normal: 'Soldier', runner: 'Runner', tank: 'Tank', sniper: 'Sniper', bomber: 'Bomber', elite: 'Elite', boss: 'BOSS' }
  const comboTag = comboCount.value > 1 ? ` [x${comboCount.value}]` : ''
  const hsTag = isHeadshot ? ' 🎯' : ''
  addKillFeed(`☠ ${names[enemy.type]}${hsTag}${comboTag}`)

  const baseScore = enemy.type === 'boss' ? 500 : 100
  const comboMult = 1 + (comboCount.value - 1) * 0.5
  score.value += Math.floor(baseScore * comboMult)
  scrap.value += enemy.type === 'boss' ? 500 : 25

  comboCount.value = Math.min(10, comboCount.value + 1)
  if (comboCount.value > 1) playSound('combo')

  const roll = Math.random()
  let lootType = null
  if (roll < 0.3) lootType = 'health'
  else if (roll < 0.6) lootType = 'ammo'
  else if (roll < 0.7) lootType = 'overcharge'
  if (lootType) {
    const colors = { health: 0x00ff00, ammo: 0xffaa00, overcharge: 0xff00ff }
    const emissives = { health: 0x003300, ammo: 0x442200, overcharge: 0x440044 }
    const loot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: colors[lootType], emissive: emissives[lootType] }))
    loot.position.set(enemy.x, 0.3, enemy.z)
    scene.add(loot)
    lootItems.push({ mesh: loot, type: lootType })
  }
}

function explode(x, z) {
  playSound('explosion')
  const pos = new THREE.Vector3(x, 2, z)

  explosionLight.position.copy(pos)
  explosionLight.intensity = 4
  explosionTimer = 0.15

  spawnParticles(pos, 0xffaa00, 20)
  cameraShake = 0.3
  for (const e of enemies) {
    if (e.dead) continue
    const dx = e.x - x, dz = e.z - z
    if (Math.sqrt(dx * dx + dz * dz) < 15) { e.hp -= 200; if (e.hp <= 0) { e.dead = true; killEnemy(e) } }
  }
  if (Math.sqrt((me.x - x) ** 2 + (me.z - z) ** 2) < 12) damagePlayer(40, x, z)
}

function startGame() {
  initAudio()
  if (gameState.value === 'paused') { renderer.domElement.requestPointerLock(); return }
  if (gameState.value === 'menu' || gameState.value === 'dead') {
    playerHp.value = 100; maxHp.value = 100
    me.x = 0; me.z = 0; me.ry = 0; camera.rotation.x = 0
    camera.position.y = 1.6; verticalVel = 0; isGrounded = true; climbing = null
    adsT = 0; sprintT = 0; recoilAccum = 0; bloom = 0; kickZ = 0; kickRot = 0
    lmbDown = false; rmbDown = false
    wave.value = 1; score.value = 0; scrap.value = 0
    damageMult.value = 1.0; reloadMult.value = 1.0
    isReloading.value = false; overchargeTimer.value = 0
    comboCount.value = 1
    weaponAmmo.pistol = 12; weaponAmmo.shotgun = 6; weaponAmmo.sniper = 4
    currentWeapon.value = 'pistol'; currentAmmo.value = 12; maxAmmo.value = 12
    equipGun('pistol'); swapT = 0
    for (const en of enemies) { const m = scene.getObjectByName(en.id); if (m) scene.remove(m) }
    for (const l of lootItems) { scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose() }
    for (const l of playerLasers) { scene.remove(l.mesh); l.geo.dispose(); l.mat.dispose() }
    enemies = []; lootItems.length = 0; playerLasers.length = 0
    spawnWave()
    gameState.value = 'playing'
    renderer.domElement.requestPointerLock()
  }
}

const _tv = new THREE.Vector3()
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

function spawnWave() {
  const count = Math.min(4 + wave.value, 20)
  enemiesLeft.value = count
  const waveScale = 1 + (wave.value - 1) * 0.06
  const bossType = (wave.value % 5 === 0) ? 'boss' : null

  for (let i = 0; i < count; i++) {
    let type = 'normal'
    if (bossType && i === 0) type = bossType
    else {
      const r = Math.random()
      if (r < 0.2) type = 'runner'
      else if (r < 0.33) type = 'tank'
      else if (r < 0.43) type = 'sniper'
      else if (r < 0.53 && wave.value >= 2) type = 'bomber'
      else if (r < 0.65 && wave.value >= 3) type = 'elite'
    }
    const cfg = ENEMY_CONFIG[type]
    const hp = Math.round(cfg.hp * (type === 'boss' ? 1 : waveScale))

    let sx, sz
    do { sx = (Math.random() - 0.5) * 160; sz = (Math.random() - 0.5) * 160 } while (Math.hypot(sx - me.x, sz - me.z) < 25 || isBlocked(sx, sz, 2))

    enemies.push({
      id: 'enemy' + i + '_' + Math.random(),
      type, x: sx, z: sz, ry: 0, hp, maxHp: hp, dead: false,
      attackT: 1 + Math.random() * 1.5, hitT: 0, hitDir: new THREE.Vector3(), ...enemyExtras(type, cfg),
      scale: cfg.scale, speed: cfg.speed * waveScale, color: cfg.color,
      attackDist: cfg.attackDist, bulletDmg: cfg.bulletDmg, bulletColor: cfg.bulletColor,
      weakPoint: cfg.weakPoint,
      strafeDir: Math.random() > 0.5 ? 1 : -1
    })
  }
  if (bossType) announce(`WAVE ${wave.value}`, '☠ BOSS INCOMING ☠', 2000)
  else announce(`WAVE ${wave.value}`, '', 1200)
}

function checkDeath() {
  if (playerHp.value <= 0) {
    gameState.value = 'dead'
    climbing = null; lmbDown = false; rmbDown = false
    if (document.pointerLockElement) document.exitPointerLock()
    if (score.value > highScore.value) { highScore.value = score.value; localStorage.setItem('nexus_highscore', score.value.toString()) }
  }
}

onMounted(() => {
  scene = new THREE.Scene()

  scene.background = new THREE.Color(0x9fc3df)
  scene.fog = new THREE.FogExp2(0xb9cfdb, 0.006)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 horizon = vec3(0.72, 0.81, 0.86); vec3 top = vec3(0.16, 0.38, 0.75); vec3 col = mix(horizon, top, pow(h, 0.45)); float d = max(dot(vP, normalize(vec3(80.0, 90.0, 60.0))), 0.0); col += vec3(1.0, 0.85, 0.6) * (pow(d, 64.0) * 0.6 + pow(d, 1500.0) * 4.0); gl_FragColor = vec4(col, 1.0); }`
    })
  )
  sky.renderOrder = -1
  scene.add(sky)

  // near plane 0.05 so the gun can sit close to the eye when aiming without being clipped
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1000)
  camera.rotation.order = 'YXZ'

  renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9

  root.value.appendChild(renderer.domElement)
  renderer.domElement.style.cursor = 'crosshair'

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5

  // --- SETUP POST PROCESSING PIPELINE ---
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 0.8)
  bloomPass.threshold = 1.2
  bloomPass.strength = 0.08
  bloomPass.radius = 0.4
  composer.addPass(bloomPass)

  rgbShiftPass = new ShaderPass(RGBShiftShader)
  rgbShiftPass.uniforms['amount'].value = 0.0
  composer.addPass(rgbShiftPass)

  vignettePass = new ShaderPass(CinematicShader)
  vignettePass.uniforms['intensity'].value = 1.0
  composer.addPass(vignettePass)

  smaaPass = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio())
  composer.addPass(smaaPass)

  outputPass = new OutputPass()
  composer.addPass(outputPass)

  // ===== LIGHTING =====
  const hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x5a6a3a, 1.2)
  hemiLight.position.set(0, 200, 0)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xfff1d6, 3.0)
  dirLight.position.set(80, 90, 60)
  dirLight.castShadow = true
  dirLight.shadow.camera.top = 100
  dirLight.shadow.camera.bottom = -100
  dirLight.shadow.camera.left = -100
  dirLight.shadow.camera.right = 100
  dirLight.shadow.mapSize.width = 1024
  dirLight.shadow.mapSize.height = 1024
  dirLight.shadow.bias = -0.0005
  scene.add(dirLight)

  explosionLight = new THREE.PointLight(0xff5500, 0, 30)
  scene.add(explosionLight)

  // Ground
  const gc = document.createElement('canvas'); gc.width = gc.height = 256
  const gctx = gc.getContext('2d')
  gctx.fillStyle = '#5d6e36'; gctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 6000; i++) {
    const g = 90 + Math.random() * 60
    gctx.fillStyle = `rgba(${(g * 0.7) | 0},${g | 0},${(g * 0.35) | 0},0.35)`
    gctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  const groundTex = new THREE.CanvasTexture(gc)
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping
  groundTex.repeat.set(80, 80)
  groundTex.colorSpace = THREE.SRGBColorSpace
  const groundGeo = new THREE.PlaneGeometry(400, 400)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTex, roughness: 1, metalness: 0 })
  groundMesh = new THREE.Mesh(groundGeo, groundMat)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.receiveShadow = true
  scene.add(groundMesh)

  const grid = new THREE.GridHelper(400, 100, 0x00ffff, 0x003366)
  grid.position.y = 0.01
  grid.material.opacity = 0.2
  grid.material.transparent = true
  // grid removed

  // Pillars (trees)
  for (let i = 0; i < 40; i++) {
    const pillar = new THREE.Group()
    const h = 4 + Math.random() * 6

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, h, 8), new THREE.MeshStandardMaterial({ color: 0x5b4630, metalness: 0, roughness: 1 }))
    base.position.y = h / 2; base.castShadow = true; base.receiveShadow = true
    pillar.add(base)

    const lightStrip = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshStandardMaterial({ color: 0x2f5a22, roughness: 1, metalness: 0, flatShading: true }))
    lightStrip.position.y = h + 0.8; lightStrip.scale.set(1.3, 0.8, 1.3); lightStrip.castShadow = true
    pillar.add(lightStrip)

    let x, z
    do { x = (Math.random() - 0.5) * 300; z = (Math.random() - 0.5) * 300 } while (Math.abs(x) < 15 && Math.abs(z) < 15)
    pillar.position.set(x, 0, z)
    scene.add(pillar)
    obstacles.push(base)
  }

  // Crates
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5a36, metalness: 0, roughness: 0.9 })
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x3b2b18, roughness: 1, metalness: 0 })
  for (let i = 0; i < 30; i++) {
    const w = 2 + Math.random() * 4
    const h = 2 + Math.random() * 4
    const d = 2 + Math.random() * 4
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat)
    let bx, bz
    do { bx = (Math.random() - 0.5) * 200; bz = (Math.random() - 0.5) * 200 } while (Math.abs(bx) < 14 && Math.abs(bz) < 14)
    box.position.set(bx, h / 2, bz)
    box.castShadow = true; box.receiveShadow = true
    scene.add(box)
    obstacles.push(box)

    if (Math.random() > 0.6) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.1, d * 1.02), neonMat)
      strip.position.copy(box.position)
      strip.position.y = h * 0.8
      scene.add(strip)
    }
  }

  // Rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7b7a73, metalness: 0, roughness: 1, flatShading: true })
  for (let i = 0; i < 20; i++) {
    const size = 1 + Math.random() * 3
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size), rockMat)
    let rx, rz
    do { rx = (Math.random() - 0.5) * 250; rz = (Math.random() - 0.5) * 250 } while (Math.abs(rx) < 14 && Math.abs(rz) < 14)
    rock.position.set(rx, size / 2, rz)
    rock.rotation.set(Math.random(), Math.random(), Math.random())
    rock.castShadow = true; rock.receiveShadow = true
    scene.add(rock)
    obstacles.push(rock)
  }

  // Barrels
  for (let i = 0; i < 15; i++) {
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0xa31a12, emissive: 0x000000, emissiveIntensity: 0, metalness: 0.4, roughness: 0.6 })
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.5, 16), barrelMat)
    barrel.position.set((Math.random() - 0.5) * 160, 0.75, (Math.random() - 0.5) * 160)
    barrel.castShadow = true; scene.add(barrel); barrels.push(barrel)
  }

  world = buildWorld(scene, obstacles, barrels)
  ladders = world.ladders
  platforms = world.platforms

  miniMapCamera = new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 1000)
  miniMapCamera.position.set(0, 100, 0); miniMapCamera.up.set(0, 0, -1); miniMapCamera.lookAt(0, 0, 0)

  // ===== PLAYER GUNS (pistol, shotgun, sniper) =====
  guns = buildGuns(WEAPON_CONFIG)
  for (const k in guns.models) camera.add(guns.models[k].group)
  scene.add(camera)
  equipGun('pistol')

  new GLTFLoader().load('/models/Soldier.glb', (gltf) => { soldier = gltf }, undefined, (err) => console.error('Model failed', err))

  onKeyDown = (e) => {
    keys[e.code] = true
    if (gameState.value !== 'playing') return
    if (e.code === 'Space') {
      if (climbing) leaveLadder(true)
      else if (isGrounded) { verticalVel = 8; isGrounded = false; landingKick = 0.1 }
    }
    if (e.code === 'KeyE' && !e.repeat) {
      if (climbing) leaveLadder(false)
      else { const lad = findLadder(); if (lad) attachLadder(lad.L, lad.fromTop) }
    }
    if (e.code === 'KeyR') reloadWeapon()
    if (e.code === 'Digit1') switchWeapon('pistol')
    if (e.code === 'Digit2') switchWeapon('shotgun')
    if (e.code === 'Digit3') switchWeapon('sniper')
  }
  onKeyUp = (e) => { keys[e.code] = false }
  onMouseMove = (e) => {
    if (document.pointerLockElement !== renderer.domElement) return
    if (gameState.value !== 'playing') return
    // sensitivity follows the zoom, so a 20 degree scope isn't 3x too twitchy
    const sens = 0.002 * sensMul
    me.ry -= e.movementX * sens
    camera.rotation.x -= e.movementY * sens
    camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x))
  }
  onMouseDown = (e) => {
    if (document.pointerLockElement !== renderer.domElement) { if (gameState.value === 'playing') renderer.domElement.requestPointerLock(); return }
    if (gameState.value !== 'playing') return
    if (e.button === 0) { lmbDown = true; shoot() }
    if (e.button === 2) rmbDown = true
  }
  onMouseUp = (e) => {
    if (e.button === 0) lmbDown = false
    if (e.button === 2) rmbDown = false
  }
  onPointerLockChange = () => {
    if (!document.pointerLockElement) { lmbDown = false; rmbDown = false }
    if (!document.pointerLockElement && gameState.value === 'playing') gameState.value = 'paused'
    else if (document.pointerLockElement && gameState.value === 'paused') gameState.value = 'playing'
  }
  onContextMenu = (e) => e.preventDefault()
  onResize = () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    composer.setSize(innerWidth, innerHeight)
    smaaPass.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio())
  }

  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp)
  addEventListener('mousemove', onMouseMove); addEventListener('mousedown', onMouseDown)
  addEventListener('mouseup', onMouseUp); addEventListener('pointerlockchange', onPointerLockChange)
  addEventListener('contextmenu', onContextMenu); addEventListener('resize', onResize)

  let lastTime = performance.now()
  const loop = () => {
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now

    if (explosionTimer > 0) {
      explosionTimer -= dt
      explosionLight.intensity = Math.max(0, explosionTimer / 0.15) * 4
    }

    if (gameState.value === 'playing') {
      updatePlayer(dt)
      if (lmbDown) shoot()           // hold the button to keep firing at the weapon's fire rate
      updateCombat(dt)
      updateAI(dt)
      updateRenderables(dt)
    }

    world?.update(dt, now / 1000)
    composer.render()

    if (gameState.value === 'playing') {
      const fog = scene.fog
      scene.fog = null
      renderer.setViewport(innerWidth - 220, innerHeight - 220, 200, 200)
      renderer.setScissor(innerWidth - 220, innerHeight - 220, 200, 200)
      renderer.setScissorTest(true)
      renderer.render(scene, miniMapCamera)
      renderer.setViewport(0, 0, innerWidth, innerHeight)
      renderer.setScissor(0, 0, innerWidth, innerHeight)
      renderer.setScissorTest(false)
      scene.fog = fog
    }

    frame = requestAnimationFrame(loop)
  }

  function updatePlayer(dt) {
    const now = performance.now()
    const cfg = WEAPON_CONFIG[currentWeapon.value]
    rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, 0, dt * 10)
    if (overchargeTimer.value > 0) { overchargeTimer.value -= dt; if (overchargeTimer.value < 0) overchargeTimer.value = 0 }

    // ---- input state ----
    const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)
    const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)
    const isMoving = !climbing && (fwd !== 0 || strafe !== 0)
    const aiming = rmbDown && !isReloading.value && !climbing
    const sprinting = isMoving && !aiming && (keys.ShiftLeft || keys.ShiftRight)
    isAiming.value = aiming

    // ---- aim transition (hip <-> sights) ----
    const adsTarget = aiming ? 1 : 0
    adsT += (adsTarget - adsT) * Math.min(1, dt * cfg.adsSpeed)
    if (Math.abs(adsT - adsTarget) < 0.005) adsT = adsTarget
    const k = smooth(adsT)
    sprintT += ((sprinting && now - lastShootTime > 350 ? 1 : 0) - sprintT) * Math.min(1, dt * 9)
    scopeVisible.value = currentWeapon.value === 'sniper' && adsT > 0.9

    // ---- FOV (the shot kick is added on top, never accumulated) ----
    fovKick = THREE.MathUtils.lerp(fovKick, 0, Math.min(1, dt * 10))
    fovBase = 70 + (cfg.adsFov - 70) * k + sprintT * 4
    camera.fov = fovBase + fovKick
    camera.updateProjectionMatrix()
    sensMul = Math.tan((fovBase * Math.PI) / 360) / Math.tan((35 * Math.PI) / 180)

    // ---- camera roll / shake ----
    const tilt = (keys.KeyA ? 0.02 : 0) - (keys.KeyD ? 0.02 : 0)
    camRoll = THREE.MathUtils.lerp(camRoll, tilt, Math.min(1, dt * 6))
    if (cameraShake > 0) {
      cameraShake = Math.max(0, cameraShake - dt * 2)
      camera.rotation.z = camRoll + (Math.random() - 0.5) * cameraShake
    } else camera.rotation.z = camRoll

    // ---- recoil recovery ----
    const rec = recoilAccum * Math.min(1, dt * 7)
    recoilAccum -= rec
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - rec, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1)
    bloom = Math.max(0, bloom - dt * 0.05)
    camera.rotation.y = me.ry

    crossGap.value = Math.round(5 + currentSpread() * innerHeight * 0.7)
    updateViewModel(dt, now, k, isMoving, sprinting)

    // ---- ladder / platform movement ----
    const feetY = camera.position.y - 1.6
    const floorY = floorAt(me.x, me.z, feetY)

    if (climbing) {
      climbPrompt.value = 'W / S  CLIMB    SPACE  JUMP OFF'
      updateClimb(dt)
    } else {
      const lad = findLadder()
      climbPrompt.value = lad ? (lad.fromTop ? '[E]  CLIMB DOWN' : '[E]  CLIMB LADDER') : ''
      if (lad && !lad.fromTop && keys.KeyW && Math.cos(me.ry) > 0.35) attachLadder(lad.L, false)
    }

    if (!climbing) {
      const speed = (aiming ? cfg.adsMove : 6) * (sprinting ? 1.8 : 1)
      let f = fwd, s = strafe
      const len = Math.hypot(f, s)
      if (len > 1) { f /= len; s /= len }     // diagonal movement is no longer faster
      const nextX = me.x + (-Math.sin(me.ry) * f + Math.cos(me.ry) * s) * speed * dt
      const nextZ = me.z + (-Math.cos(me.ry) * f - Math.sin(me.ry) * s) * speed * dt

      const plat = floorY > 0 ? platformAt(me.x, me.z, feetY) : null
      const checkCollision = (nx, nz) => {
        if (nx < -99.5 || nx > 99.5 || nz < -99.5 || nz > 99.5) return true
        if (plat) {
          // on a tower deck: the railing stops you, except at the ladder gap
          const inside = Math.abs(nx - plat.x) < plat.hw - 0.4 && Math.abs(nz - plat.z) < plat.hd - 0.4
          const inGap = plat.gap && Math.abs(nx - plat.gap.x) < plat.gap.hw && nz >= plat.z
          if (!inside && !inGap) return true
        }
        _cp.set(nx, floorY + 1.0, nz)
        for (const obs of obstacles) {
          const b = (obs.userData.boxP ||= new THREE.Box3().setFromObject(obs).expandByScalar(0.5))
          if (b.containsPoint(_cp)) return true
        }
        return false
      }
      if (!checkCollision(nextX, me.z)) me.x = nextX
      if (!checkCollision(me.x, nextZ)) me.z = nextZ

      const newFloor = floorAt(me.x, me.z, feetY)
      camera.position.y += verticalVel * dt; verticalVel -= 25 * dt
      if (camera.position.y <= newFloor + 1.6) {
        if (!isGrounded) landingKick = 0.15
        camera.position.y = newFloor + 1.6; verticalVel = 0; isGrounded = true
      } else isGrounded = false
      landingKick = THREE.MathUtils.lerp(landingKick, 0, Math.min(1, dt * 10))
      camera.position.y -= landingKick
    }
    camera.position.x = me.x; camera.position.z = me.z
  }

  function updateCombat(dt) {
    for (let i = playerLasers.length - 1; i >= 0; i--) {
      const l = playerLasers[i]
      const px0 = l.mesh.position.x, py0 = l.mesh.position.y, pz0 = l.mesh.position.z
      l.mesh.position.add(l.vel.clone().multiplyScalar(dt))
      l.life -= dt
      let hit = pathBlocked(px0, py0, pz0, l.mesh.position.x, l.mesh.position.y, l.mesh.position.z)
      if (hit) spawnParticles(l.mesh.position, 0xcccccc, 4)
      const laserBox = hit ? new THREE.Box3() : new THREE.Box3().setFromCenterAndSize(l.mesh.position, new THREE.Vector3(0.8, 0.8, 2))

      for (const e of enemies) {
        if (e.dead) continue
        const mesh = scene.getObjectByName(e.id)
        if (!mesh) continue
        const enemyBox = enemyHitBox(mesh, e)
        if (!laserBox.intersectsBox(enemyBox)) continue

        const hitY = l.mesh.position.y
        const enemyFeetY = enemyBox.min.y
        const enemyHeadY = enemyBox.max.y
        const headZoneStart = enemyHeadY - (enemyHeadY - enemyFeetY) * 0.25
        const isHeadshot = hitY >= headZoneStart && e.type !== 'boss'

        let isWeakpoint = false
        if (e.weakPoint) {
          const backX = e.x + Math.sin(e.ry + Math.PI) * 0.6 * e.scale
          const backZ = e.z + Math.cos(e.ry + Math.PI) * 0.6 * e.scale
          const weakY = enemyBox.min.y + (enemyBox.max.y - enemyBox.min.y) * 0.55
          const distToWeak = Math.sqrt((l.mesh.position.x - backX) ** 2 + (l.mesh.position.y - weakY) ** 2 + (l.mesh.position.z - backZ) ** 2)
          isWeakpoint = distToWeak < 0.6 * e.scale
        }

        let finalDamage = l.damage
        if (isHeadshot) finalDamage *= 2
        if (isWeakpoint) finalDamage *= 3

        if (e.shield > 0) { const soak = Math.min(e.shield, finalDamage); e.shield -= soak; finalDamage -= soak }
        e.hp -= finalDamage
        e.hitT = 0.15
        e.hitDir = l.vel.clone().normalize()

        if (isHeadshot) { playSound('headshot'); spawnDamageNumber(l.mesh.position, finalDamage, '#ffaa00', 1.3); triggerHitmarker('#ffaa00') }
        else if (isWeakpoint) { playSound('headshot'); spawnDamageNumber(l.mesh.position, finalDamage, '#ff00ff', 1.3); triggerHitmarker('#ff00ff') }
        else { playSound('hit'); spawnDamageNumber(l.mesh.position, finalDamage, '#ff5555', 1); triggerHitmarker('#ff0000') }

        spawnParticles(l.mesh.position, isHeadshot ? 0xffaa00 : 0xff0000, 5)
        if (e.hp <= 0) { e.dead = true; killEnemy(e, isHeadshot) }
        hit = true
        break
      }

      if (!hit) {
        for (const b of barrels) {
          if (l.mesh.position.distanceTo(b.position) < 1.0) {
            explode(b.position.x, b.position.z)
            scene.remove(b); b.geometry.dispose(); b.material.dispose()
            barrels.splice(barrels.indexOf(b), 1)
            hit = true; break
          }
        }
      }

      if (hit || l.life <= 0) { scene.remove(l.mesh); l.geo.dispose(); l.mat.dispose(); playerLasers.splice(i, 1) }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i]
      b.position.add(b.userData.vel.clone().multiplyScalar(dt))
      b.userData.life -= dt
      if (isBlocked(b.position.x, b.position.z, 0, b.position.y)) b.userData.life = 0
      if (b.position.distanceTo(new THREE.Vector3(me.x, camera.position.y, me.z)) < 0.8) {
        damagePlayer(b.userData.dmg || 15, b.position.x, b.position.z)
        b.userData.life = 0
      }
      if (b.userData.life <= 0) { scene.remove(b); b.geometry.dispose(); b.material.dispose(); enemyBullets.splice(i, 1) }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.userData.life -= dt
      p.position.add(p.userData.vel.clone().multiplyScalar(dt))
      p.userData.vel.y -= 9.8 * dt
      if (p.userData.spin) p.rotation.x += p.userData.spin * dt
      if (p.userData.life <= 0) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); particles.splice(i, 1) }
    }

    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const d = damageNumbers[i]
      d.life -= dt
      d.sprite.position.y += d.vy * dt
      d.mat.opacity = Math.min(1, d.life * 2)
      if (d.life <= 0) { scene.remove(d.sprite); d.tex.dispose(); d.mat.dispose(); damageNumbers.splice(i, 1) }
    }

    for (let i = ragdolls.length - 1; i >= 0; i--) {
      const r = ragdolls[i]
      r.life -= dt

      if (r.cartoon) {
        if (r.state === 'freeze') {
          r.stateTimer -= dt
          r.mesh.scale.set(1.3, 0.7, 1.3)
          if (r.stateTimer <= 0) {
            r.state = 'fly'
            playSound('boing')
            const dir = new THREE.Vector3(r.mesh.position.x - me.x, 0, r.mesh.position.z - me.z).normalize()
            r.vx = dir.x * 15; r.vy = 28; r.vz = dir.z * 15
            r.rx = 20; r.ry = 5; r.rz = 15
            r.mesh.scale.set(1, 1, 1)
            spawnParticles(r.mesh.position, 0xffffff, 5)
          }
        }
        else if (r.state === 'fly' || r.state === 'bounce') {
          r.vy -= 30 * dt
          r.mesh.position.x += r.vx * dt
          r.mesh.position.y += r.vy * dt
          r.mesh.position.z += r.vz * dt
          r.mesh.rotation.x += r.rx * dt
          r.mesh.rotation.y += r.ry * dt
          r.mesh.rotation.z += r.rz * dt

          if (r.mesh.userData.bones) {
            const time = performance.now() * 0.02
            for (const k in r.mesh.userData.bones) {
              const bone = r.mesh.userData.bones[k]
              if (k.toLowerCase().includes('arm') || k.toLowerCase().includes('leg') || k.toLowerCase().includes('hand') || k.toLowerCase().includes('foot')) {
                bone.rotation.z = Math.sin(time + k.length) * 1.5
                bone.rotation.x = Math.cos(time + k.length) * 1.5
              }
            }
          }

          if (r.mesh.position.y <= 0.4) {
            r.mesh.position.y = 0.4
            r.bounces++

            if (r.bounces >= 2) {
              r.state = 'settle'
              r.stateTimer = 0.4
              r.vx = 0; r.vz = 0; r.vy = 0
              r.rx = 0; r.ry = 0; r.rz = 0
              r.mesh.rotation.x = Math.PI / 2
              r.mesh.rotation.z = Math.random() * Math.PI
            } else {
              playSound('boing')
              r.vy = 15
              r.vx *= 0.5; r.vz *= 0.5
              r.mesh.scale.set(1.5, 0.4, 1.5)
              r.rx = (Math.random() - 0.5) * 25
              r.rz = (Math.random() - 0.5) * 25
            }
          }
        }
        else if (r.state === 'settle') {
          r.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 15)
          r.stateTimer -= dt
          if (r.stateTimer <= 0) {
            r.state = 'twitch'
            if (r.mesh.userData.bones) {
              for (const k in r.mesh.userData.bones) {
                const bone = r.mesh.userData.bones[k]
                bone.rotation.z = 0; bone.rotation.x = 0
                if (k.toLowerCase().includes('arm') || k.toLowerCase().includes('hand')) {
                  bone.rotation.z = Math.PI / 2
                }
              }
            }
          }
        }
        else if (r.state === 'twitch') {
          r.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 15)
          if (r.mesh.userData.bones) {
            const time = performance.now() * 0.03
            for (const k in r.mesh.userData.bones) {
              if (k.toLowerCase().includes('rightleg') || k.toLowerCase().includes('right_leg')) {
                r.mesh.userData.bones[k].rotation.x = Math.sin(time) * 0.5
              }
            }
          }
          if (r.life < 1.0) {
            r.mesh.scale.setScalar(Math.max(0.01, r.life / 1.0))
          }
          if (r.life <= 0) {
            scene.remove(r.mesh)
            ragdolls.splice(i, 1)
          }
        }

      } else {
        r.vy -= 30 * dt
        r.mesh.position.x += r.vx * dt; r.mesh.position.y += r.vy * dt; r.mesh.position.z += r.vz * dt
        r.mesh.rotation.x += r.rx * dt; r.mesh.rotation.y += r.ry * dt; r.mesh.rotation.z += r.rz * dt
        if (r.mesh.position.y <= 0.4) {
          r.mesh.position.y = 0.4
          r.vy = -r.vy * 0.5; r.vx *= 0.7; r.vz *= 0.7; r.rx *= 0.7; r.ry *= 0.7; r.rz *= 0.7
          r.mesh.scale.set(1.5, 0.5, 1.5)
        }
        r.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 5)
        if (r.life < 1.5) r.mesh.scale.setScalar(Math.max(0.01, r.life / 1.5))
        if (r.life <= 0) { scene.remove(r.mesh); ragdolls.splice(i, 1) }
      }
    }
  }

  function updateAI(dt) {
    for (const l of lootItems) {
      l.mesh.rotation.y += dt * 3
      if (Math.hypot(l.mesh.position.x - me.x, l.mesh.position.z - me.z) < 1.5) {
        if (l.type === 'health') { playerHp.value = Math.min(maxHp.value, playerHp.value + 30); playSound('heal') }
        if (l.type === 'ammo') { weaponAmmo[currentWeapon.value] = WEAPON_CONFIG[currentWeapon.value].maxAmmo; currentAmmo.value = weaponAmmo[currentWeapon.value]; playSound('reload') }
        if (l.type === 'overcharge') { overchargeTimer.value = 10; playSound('loot') }
        scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose()
        lootItems.splice(lootItems.indexOf(l), 1)
      }
    }

    const alive = enemies.filter(e => !e.dead).length
    enemiesLeft.value = alive
    if (alive === 0 && enemies.length > 0) {
      for (const en of enemies) { const m = scene.getObjectByName(en.id); if (m) scene.remove(m) }
      enemies = []
      climbing = null
      gameState.value = 'shop'
      if (document.pointerLockElement) document.exitPointerLock()
      return
    }

    trackPlayer(dt)
    for (const e of enemies) {
      if (e.dead) continue
      updateEnemyAI(e, dt)
    }

    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i]; if (a.dead) continue
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j]; if (b.dead) continue
        const dx = a.x - b.x, dz = a.z - b.z
        const d2 = dx * dx + dz * dz
        const minDist = (a.scale + b.scale) * 1.2
        if (d2 > 0.001 && d2 < minDist * minDist) {
          const d = Math.sqrt(d2)
          const push = (minDist - d) * 0.5
          const nx = dx / d, nz = dz / d
          a.x += nx * push; a.z += nz * push
          b.x -= nx * push; b.z -= nz * push
        }
      }
    }
  }

  let pvx = 0, pvz = 0, lpx = 0, lpz = 0
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
    // standing on a tower puts you out of reach of the blast
    if (Math.hypot(me.x - e.x, me.z - e.z) < 7 && camera.position.y < 4) damagePlayer(35, e.x, e.z)
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
    if (e.losT <= 0) { e.los = dist < 3 || hasLineOfSight(e.x, e.z, me.x, me.z, camera.position.y); e.losT = 0.15 + Math.random() * 0.1 }
    const los = e.los
    const elevated = camera.position.y > 4        // player is up on a tower: melee can't reach
    const ang = Math.atan2(dx, dz)
    e.ry = ang
    if (Math.random() < dt * 0.5) e.strafeDir *= -1
    const side = (Math.PI / 2) * e.strafeDir
    const melee = (dmg, cd) => { e.attackT -= dt; if (e.attackT <= 0) { if (!elevated) damagePlayer(dmg, e.x, e.z); e.attackT = cd } }

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

  function updateRenderables(dt) {
    const activeIds = new Set()
    for (const e of enemies) {
      if (e.dead) continue
      activeIds.add(e.id)
      let m = scene.getObjectByName(e.id)
      if (!m) { m = createEnemyMesh(e); scene.add(m) }

      let diff = e.ry - m.rotation.y
      while (diff < -Math.PI) diff += Math.PI * 2
      while (diff > Math.PI) diff -= Math.PI * 2
      m.rotation.y += diff * dt * 10

      const targetTilt = e.hitT > 0 ? -0.5 : 0
      m.rotation.x = THREE.MathUtils.lerp(m.rotation.x, targetTilt, dt * 15)

      m.position.x += (e.x - m.position.x) * 15 * dt
      m.position.z += (e.z - m.position.z) * 15 * dt

      groundRaycaster.set(new THREE.Vector3(e.x, 50, e.z), new THREE.Vector3(0, -1, 0))
      const hits = groundRaycaster.intersectObject(groundMesh, true)
      let groundY = 0
      if (hits.length > 0) { groundY = hits[0].point.y }

      m.position.y = THREE.MathUtils.lerp(m.position.y, groundY, dt * 10)

      const isMoving = Math.abs(e.x - m.position.x) > 0.1 || Math.abs(e.z - m.position.z) > 0.1
      if (m.userData.mixer) {
        if (isMoving && e.hitT <= 0) {
          if (m.userData.state !== 'run') { m.userData.idle.fadeOut(0.3); m.userData.run.reset().fadeIn(0.3).play(); m.userData.state = 'run' }
        } else {
          if (m.userData.state !== 'idle') { m.userData.run.fadeOut(0.3); m.userData.idle.reset().fadeIn(0.3).play(); m.userData.state = 'idle' }
        }
        m.userData.mixer.update(dt)
      }

      updateEnemyVisuals(m, e, dt)
    }

    for (const child of scene.children) {
      if (child.name.startsWith('enemy') && !activeIds.has(child.name) && !ragdolls.find(r => r.mesh === child)) scene.remove(child)
    }
  }

  function createEnemyMesh(e) {
    return buildEnemyMesh(e, soldier)
  }

  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  removeEventListener('resize', onResize)
  removeEventListener('keydown', onKeyDown)
  removeEventListener('keyup', onKeyUp)
  removeEventListener('mousemove', onMouseMove)
  removeEventListener('mousedown', onMouseDown)
  removeEventListener('mouseup', onMouseUp)
  removeEventListener('pointerlockchange', onPointerLockChange)
  removeEventListener('contextmenu', onContextMenu)
  renderer?.dispose()
})
</script>
