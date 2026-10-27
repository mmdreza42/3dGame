<template>
  <div style="position:fixed;inset:0;overflow:hidden;">
    <div ref="root" style="position:fixed;inset:0;"></div>

    <!-- HUD -->
    <div v-if="gameState === 'playing'" style="position:fixed;bottom:20px;left:20px;color:#fff;font:bold 20px sans-serif;text-shadow:0 2px 4px #000;z-index:5;">
      <div style="color:#ff5555;">HP: {{ playerHp }} / {{ maxHp }}</div>
      <div style="font-size:24px;color:#00ffcc;margin-top:4px;font-weight:bold;">
        {{ currentWeapon.toUpperCase() }}:
        <span v-if="isReloading" style="color:#ffaa00;">RELOADING...</span>
        <span v-else>{{ currentAmmo }} / {{ maxAmmo }}</span>
      </div>
      <div v-if="overchargeTimer > 0" style="font-size:16px;color:#ff00ff;margin-top:4px;">⚡ OVERCHARGE: {{ Math.ceil(overchargeTimer) }}s</div>
      <div v-if="comboCount > 1" style="font-size:22px;color:#ffd700;margin-top:4px;text-shadow:0 0 10px #ffd700;">🔥 COMBO x{{ comboCount }}</div>
    </div>

    <div v-if="gameState === 'playing'" style="position:fixed;top:20px;left:20px;color:#fff;font:bold 24px sans-serif;text-shadow:0 2px 4px #000;z-index:5;">
      <div>WAVE: <span style="color:#00ffcc">{{ wave }}</span> <span v-if="wave % 5 === 0" style="color:red;font-size:18px;">[BOSS]</span></div>
      <div>SCORE: <span style="color:#ffd700">{{ score }}</span></div>
      <div>SCRAP: <span style="color:#00ffaa">{{ scrap }}</span></div>
      <div style="font-size:16px;color:#ff8888;margin-top:4px;">Enemies Left: {{ enemiesLeft }}</div>
    </div>

    <div v-if="gameState === 'playing'" style="position:fixed;top:20px;right:240px;z-index:6;display:flex;flex-direction:column;align-items:flex-end;">
      <div v-for="k in killFeed" :key="k.id" style="background:rgba(0,0,0,0.75);color:#fff;padding:6px 12px;margin-bottom:4px;border-radius:4px;font:14px sans-serif;border-left:3px solid #ff3333;">{{ k.text }}</div>
    </div>

    <div v-if="announceVisible" style="position:fixed;top:35%;left:50%;transform:translate(-50%,-50%);z-index:25;pointer-events:none;text-align:center;">
      <div style="font:bold 72px sans-serif;color:#00ffcc;text-shadow:0 0 30px #00ffcc,0 4px 8px #000;letter-spacing:4px;">{{ announceText }}</div>
      <div v-if="announceSub" style="font:bold 24px sans-serif;color:#ff5555;text-shadow:0 0 20px #ff5555,0 2px 4px #000;margin-top:8px;">{{ announceSub }}</div>
    </div>

    <div v-if="gameState === 'playing'" style="position:fixed; top:20px; right:20px; width:200px; height:200px; border:2px solid #00ffcc; pointer-events:none; z-index:5; background:rgba(0,0,0,0.5); box-shadow: 0 0 10px rgba(0,255,204,0.5);"></div>

    <div v-if="gameState === 'playing' && !isAiming" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:20;display:flex;align-items:center;justify-content:center;">
      <div style="width:6px;height:6px;background:#00ffcc;border-radius:50%;box-shadow:0 0 6px #000;"></div>
      <div v-if="hitmarker" style="position:absolute;width:24px;height:24px;">
        <div :style="{position:'absolute',width:'100%',height:'3px',background:hitmarkerColor,transform:'rotate(45deg)',top:'11px',boxShadow:'0 0 6px '+hitmarkerColor}"></div>
        <div :style="{position:'absolute',width:'100%',height:'3px',background:hitmarkerColor,transform:'rotate(-45deg)',top:'11px',boxShadow:'0 0 6px '+hitmarkerColor}"></div>
      </div>
    </div>

    <div v-if="gameState === 'playing' && isAiming" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:20;">
      <div v-if="hitmarker" style="position:absolute;width:24px;height:24px;transform:translate(-50%,-50%);">
        <div :style="{position:'absolute',width:'100%',height:'3px',background:hitmarkerColor,transform:'rotate(45deg)',top:'11px',boxShadow:'0 0 6px '+hitmarkerColor}"></div>
        <div :style="{position:'absolute',width:'100%',height:'3px',background:hitmarkerColor,transform:'rotate(-45deg)',top:'11px',boxShadow:'0 0 6px '+hitmarkerColor}"></div>
      </div>
    </div>

    <div v-if="showHitDir" style="position:fixed;inset:0;pointer-events:none;z-index:18;">
      <div :style="{position:'absolute',top:'50%',left:'50%',transform:`rotate(${hitDirAngle}rad)`}">
        <div style="position:absolute;top:-160px;left:-40px;width:80px;height:60px;background:radial-gradient(ellipse at bottom, rgba(255,40,40,0.9), transparent 70%);border-radius:50%;opacity:0.85;"></div>
      </div>
    </div>

    <div v-if="isHurt" style="position:fixed;inset:0;background:radial-gradient(circle, transparent 40%, rgba(255,0,0,0.7) 100%);pointer-events:none;z-index:20;"></div>

    <!-- SHOP -->
    <div v-if="gameState === 'shop'" style="position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:sans-serif;">
      <h1 style="font-size:48px;color:#ffd700;margin:0;">WAVE CLEARED</h1>
      <h2 style="font-size:24px;color:#00ffaa;margin-top:10px;">Scrap: {{ scrap }}</h2>
      <div style="display:flex;gap:20px;margin-top:40px;">
        <div style="background:#222;padding:20px;border-radius:10px;border:2px solid #ff5555;text-align:center;width:200px;">
          <h3 style="color:#ff5555;margin:0 0 10px 0;">Max HP +20</h3>
          <p style="font-size:12px;color:#aaa;height:30px;">Current: {{ maxHp }}</p>
          <button @click="buyUpgrade('hp')" :disabled="scrap < 150" style="width:100%;padding:10px;background:#ff5555;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">150 SCRAP</button>
        </div>
        <div style="background:#222;padding:20px;border-radius:10px;border:2px solid #ffaa00;text-align:center;width:200px;">
          <h3 style="color:#ffaa00;margin:0 0 10px 0;">Damage +25%</h3>
          <p style="font-size:12px;color:#aaa;height:30px;">Current: {{ (damageMult * 100).toFixed(0) }}%</p>
          <button @click="buyUpgrade('damage')" :disabled="scrap < 250" style="width:100%;padding:10px;background:#ffaa00;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">250 SCRAP</button>
        </div>
        <div style="background:#222;padding:20px;border-radius:10px;border:2px solid #00ffcc;text-align:center;width:200px;">
          <h3 style="color:#00ffcc;margin:0 0 10px 0;">Reload +20%</h3>
          <p style="font-size:12px;color:#aaa;height:30px;">Current: {{ (reloadMult * 100).toFixed(0) }}%</p>
          <button @click="buyUpgrade('reload')" :disabled="scrap < 200" style="width:100%;padding:10px;background:#00ffcc;color:#000;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">200 SCRAP</button>
        </div>
      </div>
      <button @click="startNextWave" style="margin-top:50px;padding:15px 40px;font-size:24px;font-weight:bold;background:#fff;color:#000;border:none;border-radius:8px;cursor:pointer;">START WAVE {{ wave + 1 }}</button>
    </div>

    <div v-if="gameState === 'menu' || gameState === 'paused' || gameState === 'dead'" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:sans-serif;">
      <h1 v-if="gameState === 'menu'" style="font-size:64px;margin:0;color:#ffaa55;text-shadow:0 0 20px rgba(255,170,85,0.5);letter-spacing:4px;">NEXUS STRIKE</h1>
      <h1 v-if="gameState === 'paused'" style="font-size:48px;margin:0;">PAUSED</h1>
      <h1 v-if="gameState === 'dead'" style="font-size:64px;margin:0;color:#ff3333;">YOU DIED</h1>
      <p v-if="gameState === 'menu' && highScore > 0" style="color:#ffd700;margin-top:10px;font-size:20px;">HIGH SCORE: {{ highScore }}</p>
      <p v-if="gameState === 'dead' && score >= highScore && score > 0" style="color:#ffd700;margin-top:10px;font-size:20px;">🏆 NEW HIGH SCORE!</p>
      <p v-if="gameState === 'menu'" style="font-size:18px;color:#aaa;margin-top:20px;max-width:420px;text-align:center;line-height:1.6;">
        WASD • Mouse look • Shift sprint • LMB shoot • RMB aim • R reload<br>
        Headshots deal 2x damage • Tank weakpoints deal 3x<br>
        Waves are endless — survive as long as you can.
      </p>
      <button @click="startGame" style="margin-top:40px;padding:15px 40px;font-size:24px;font-weight:bold;background:#ffaa55;color:#000;border:none;border-radius:8px;cursor:pointer;">
        {{ gameState === 'menu' ? 'CLICK TO PLAY' : gameState === 'dead' ? 'RESPAWN' : 'RESUME' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

// --- POST PROCESSING IMPORTS ---
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

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
const highScore = ref(parseInt(localStorage.getItem('nexus_highscore') || '0'))

const WEAPON_CONFIG = {
  pistol:  { maxAmmo: 12, damage: 50,  fireRate: 200,  reloadTime: 1500, color: 0x00ffff, speed: 120, bullets: 1, spread: 0 },
  shotgun: { maxAmmo: 6,  damage: 25,  fireRate: 800,  reloadTime: 2500, color: 0xffff00, speed: 120, bullets: 5, spread: 0.2 },
  sniper:  { maxAmmo: 4,  damage: 150, fireRate: 1500, reloadTime: 3000, color: 0xff00ff, speed: 250, bullets: 1, spread: 0 }
}
const weaponAmmo = { pistol: 12, shotgun: 6, sniper: 4 }

const ENEMY_CONFIG = {
  normal:   { hp: 100,   scale: 1.0, speed: 3.5, color: 0xff0000, attackDist: 40,  bulletDmg: 15, bulletColor: 0xff0000, weakPoint: false },
  runner:   { hp: 50,    scale: 0.8, speed: 7,   color: 0xff5500, attackDist: 15,  bulletDmg: 0,  bulletColor: 0xff5500, weakPoint: false },
  tank:     { hp: 300,   scale: 1.5, speed: 1.8, color: 0x8800ff, attackDist: 50,  bulletDmg: 15, bulletColor: 0xff0000, weakPoint: true  },
  sniper:   { hp: 50,    scale: 0.9, speed: 3.5, color: 0xffff00, attackDist: 100, bulletDmg: 30, bulletColor: 0xffff00, weakPoint: false },
  boss:     { hp: 5000,  scale: 3.5, speed: 1.5, color: 0xff0000, attackDist: 60,  bulletDmg: 20, bulletColor: 0xff00ff, weakPoint: false }
}

let renderer, frame, onResize, onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp, onPointerLockChange, onContextMenu
let scene, camera, miniMapCamera
let composer, bloomPass, rgbShiftPass, smaaPass, vignettePass, outputPass
let soldier = null
let audioCtx = null
let groundMesh = null

const playerLasers = [], enemyBullets = [], particles = [], ragdolls = [], lootItems = [], damageNumbers = []
const keys = {}
let me = { x: 0, z: 0, ry: 0 }
let verticalVel = 0, isGrounded = true

let gunModel, muzzleLight, muzzleFlash, accentMat, sightGlass
const HIP_POS = new THREE.Vector3(0.25, -0.22, -0.5)
const ADS_POS = new THREE.Vector3(0, -0.075, -0.4)

let gunCurrentPos = HIP_POS.clone()
let gunRot = new THREE.Vector3(0, 0, 0)
let gunSway = new THREE.Vector3(0, 0, 0)
let moveBobTime = 0, currentMoveAmount = 0, lastShootTime = 0, cameraShake = 0
let landingKick = 0, fovKick = 0

const obstacles = [], barrels = []
let enemies = []
let groundRaycaster = new THREE.Raycaster()

let hurtTimer = null, hitmarkerTimer = null, hitDirTimer = null, announceTimer = null
let reloadToken = 0

// --- CLEAN VIGNETTE SHADER (No Grain) ---
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      // Soft vignette (darkens corners slightly)
      float dist = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.9, 0.3, dist);
      color.rgb *= mix(1.0, vignette, intensity * 0.6);

      gl_FragColor = color;
    }
  `
}

function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume() }
function playSound(type) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  const now = audioCtx.currentTime
  if (type === 'pistol') { osc.type='square'; osc.frequency.setValueAtTime(800,now); osc.frequency.exponentialRampToValueAtTime(100,now+0.1); gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.1); osc.start(now); osc.stop(now+0.1) }
  else if (type === 'shotgun') { osc.type='sawtooth'; osc.frequency.setValueAtTime(300,now); osc.frequency.exponentialRampToValueAtTime(40,now+0.3); gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.3); osc.start(now); osc.stop(now+0.3) }
  else if (type === 'sniper') { osc.type='sawtooth'; osc.frequency.setValueAtTime(1500,now); osc.frequency.exponentialRampToValueAtTime(50,now+0.4); gain.gain.setValueAtTime(0.4,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.4); osc.start(now); osc.stop(now+0.4) }
  else if (type === 'hit') { osc.type='sine'; osc.frequency.setValueAtTime(1200,now); osc.frequency.exponentialRampToValueAtTime(2000,now+0.05); gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.05); osc.start(now); osc.stop(now+0.05) }
  else if (type === 'headshot') { osc.type='square'; osc.frequency.setValueAtTime(2000,now); osc.frequency.exponentialRampToValueAtTime(3500,now+0.1); gain.gain.setValueAtTime(0.15,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.12); osc.start(now); osc.stop(now+0.12) }
  else if (type === 'hurt') { osc.type='triangle'; osc.frequency.setValueAtTime(200,now); osc.frequency.linearRampToValueAtTime(50,now+0.2); gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.2); osc.start(now); osc.stop(now+0.2) }
  else if (type === 'explosion') { osc.type='sawtooth'; osc.frequency.setValueAtTime(100,now); osc.frequency.linearRampToValueAtTime(10,now+0.8); gain.gain.setValueAtTime(0.6,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.8); osc.start(now); osc.stop(now+0.8) }
  else if (type === 'heal') { osc.type='sine'; osc.frequency.setValueAtTime(400,now); osc.frequency.linearRampToValueAtTime(800,now+0.2); gain.gain.setValueAtTime(0.2,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.3); osc.start(now); osc.stop(now+0.3) }
  else if (type === 'empty') { osc.type='square'; osc.frequency.setValueAtTime(200,now); gain.gain.setValueAtTime(0.05,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.05); osc.start(now); osc.stop(now+0.05) }
  else if (type === 'reload') { osc.type='triangle'; osc.frequency.setValueAtTime(300,now); osc.frequency.linearRampToValueAtTime(600,now+0.3); gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.3); osc.start(now); osc.stop(now+0.3) }
  else if (type === 'loot') { osc.type='sine'; osc.frequency.setValueAtTime(600,now); osc.frequency.linearRampToValueAtTime(1200,now+0.1); gain.gain.setValueAtTime(0.2,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.1); osc.start(now); osc.stop(now+0.1) }
  else if (type === 'combo') { osc.type='triangle'; osc.frequency.setValueAtTime(600,now); osc.frequency.linearRampToValueAtTime(1400,now+0.15); gain.gain.setValueAtTime(0.15,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.2); osc.start(now); osc.stop(now+0.2) }
  else if (type === 'boing') { osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(150, now + 0.3); gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3) }
}

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

const _losRay = new THREE.Raycaster()
function hasLineOfSight(fromX, fromZ, toX, toZ) {
  const dx = toX - fromX, dz = toZ - fromZ
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist < 0.1) return true
  _losRay.set(new THREE.Vector3(fromX, 1.5, fromZ), new THREE.Vector3(dx / dist, 0, dz / dist))
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
  rgbShiftPass.uniforms['amount'].value = 0.015
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
  const weaponAtStart = currentWeapon.value
  const myToken = ++reloadToken
  setTimeout(() => {
    if (myToken !== reloadToken || currentWeapon.value !== weaponAtStart) return
    isReloading.value = false
    weaponAmmo[currentWeapon.value] = cfg.maxAmmo
    currentAmmo.value = cfg.maxAmmo
  }, cfg.reloadTime / reloadMult.value)
}

function buyUpgrade(type) {
  if (type === 'hp' && scrap.value >= 150) { scrap.value -= 150; maxHp.value += 20; playerHp.value += 20; playSound('heal') }
  else if (type === 'damage' && scrap.value >= 250) { scrap.value -= 250; damageMult.value += 0.25; playSound('reload') }
  else if (type === 'reload' && scrap.value >= 200) { scrap.value -= 200; reloadMult.value += 0.20; playSound('reload') }
}

function startNextWave() { wave.value++; gameState.value = 'playing'; renderer.domElement.requestPointerLock(); spawnWave() }

function spawnParticles(pos, color, count) {
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color }))
    p.position.copy(pos)
    p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15)
    p.userData.life = 0.6
    scene.add(p); particles.push(p)
  }
}

function shoot() {
  if (isReloading.value) return
  const cfg = WEAPON_CONFIG[currentWeapon.value]
  const now = performance.now()
  let fireRate = cfg.fireRate
  if (overchargeTimer.value > 0) fireRate *= 0.5
  if (now - lastShootTime < fireRate) return
  if (currentAmmo.value <= 0) { playSound('empty'); return }

  lastShootTime = now
  currentAmmo.value--
  weaponAmmo[currentWeapon.value] = currentAmmo.value
  const isCrit = overchargeTimer.value > 0
  let damage = cfg.damage * damageMult.value * (isCrit ? 2 : 1)

  const dir = new THREE.Vector3(); camera.getWorldDirection(dir)

  for (let i = 0; i < cfg.bullets; i++) {
    const shootDir = dir.clone()
    if (cfg.spread > 0) {
      const spread = isAiming.value ? cfg.spread * 0.25 : cfg.spread
      shootDir.x += (Math.random() - 0.5) * spread
      shootDir.y += (Math.random() - 0.5) * spread
      shootDir.z += (Math.random() - 0.5) * spread
      shootDir.normalize()
    }
    const laserGeo = new THREE.CylinderGeometry(0.05, 0.05, 2, 8)
    laserGeo.rotateX(Math.PI / 2)
    const laserMat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.9 })
    const laser = new THREE.Mesh(laserGeo, laserMat)
    laser.position.copy(camera.position).add(shootDir.clone().multiplyScalar(1))
    laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), shootDir)
    scene.add(laser)
    playerLasers.push({ mesh: laser, geo: laserGeo, mat: laserMat, vel: shootDir.clone().multiplyScalar(cfg.speed), life: 1.5, damage, color: cfg.color, crit: isCrit })
  }

  playSound(currentWeapon.value)
  muzzleLight.intensity = currentWeapon.value === 'shotgun' ? 4 : currentWeapon.value === 'sniper' ? 5 : 2
  if (muzzleFlash) { muzzleFlash.visible = true; muzzleFlash.material.color.setHex(cfg.color) }
  setTimeout(() => { muzzleLight.intensity = 0; if (muzzleFlash) muzzleFlash.visible = false }, 50)

  const recoil = currentWeapon.value === 'sniper' ? 0.4 : currentWeapon.value === 'shotgun' ? 0.25 : 0.1
  gunCurrentPos.z += recoil
  gunRot.x += recoil * 1.5
  gunRot.y += (Math.random() - 0.5) * recoil
  cameraShake = recoil * 0.3
  fovKick = 6
}

function killEnemy(enemy, isHeadshot = false) {
  const mesh = scene.getObjectByName(enemy.id)
  if (!mesh) return
  if (mesh.userData.mixer) mesh.userData.mixer.stopAllAction()
  
  const isCartoon = (enemy.type === 'normal' || enemy.type === 'runner')

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
  
  const names = { normal: 'Soldier', runner: 'Runner', tank: 'Tank', sniper: 'Sniper', boss: 'BOSS' }
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
  const flash = new THREE.PointLight(0xff5500, 50, 30)
  flash.position.copy(pos); scene.add(flash)
  setTimeout(() => scene.remove(flash), 150)
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
  if (gameState.value === 'menu' || gameState.value === 'dead') {
    playerHp.value = 100; maxHp.value = 100
    me.x = 0; me.z = 0; me.ry = 0; camera.rotation.x = 0
    wave.value = 1; score.value = 0; scrap.value = 0
    damageMult.value = 1.0; reloadMult.value = 1.0
    isReloading.value = false; overchargeTimer.value = 0
    comboCount.value = 1
    weaponAmmo.pistol = 12; weaponAmmo.shotgun = 6; weaponAmmo.sniper = 4
    currentWeapon.value = 'pistol'; currentAmmo.value = 12; maxAmmo.value = 12
    for (const en of enemies) { const m = scene.getObjectByName(en.id); if (m) scene.remove(m) }
    for (const l of lootItems) { scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose() }
    for (const l of playerLasers) { scene.remove(l.mesh); l.geo.dispose(); l.mat.dispose() }
    enemies = []; lootItems.length = 0; playerLasers.length = 0
    spawnWave()
    gameState.value = 'playing'
    renderer.domElement.requestPointerLock()
  }
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
      if (r < 0.25) type = 'runner'
      else if (r < 0.4) type = 'tank'
      else if (r < 0.5) type = 'sniper'
    }
    const cfg = ENEMY_CONFIG[type]
    const hp = Math.round(cfg.hp * (type === 'boss' ? 1 : waveScale))

    let sx, sz
    do { sx = (Math.random() - 0.5) * 160; sz = (Math.random() - 0.5) * 160 } while (Math.hypot(sx - me.x, sz - me.z) < 25)

    enemies.push({
      id: 'enemy' + i + '_' + Math.random(),
      type, x: sx, z: sz, ry: 0, hp, maxHp: hp, dead: false,
      attackT: 0, hitT: 0, hitDir: new THREE.Vector3(),
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
    if (document.pointerLockElement) document.exitPointerLock()
    if (score.value > highScore.value) { highScore.value = score.value; localStorage.setItem('nexus_highscore', score.value.toString()) }
  }
}

onMounted(() => {
  scene = new THREE.Scene()
  
  // DARKER, MORE REALISTIC SKY
  scene.background = new THREE.Color(0x77aaff)
  scene.fog = new THREE.Fog(0x77aaff, 60, 250)

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000)
  camera.rotation.order = 'YXZ'

  renderer = new THREE.WebGLRenderer({ antialias: false }) 
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  
  root.value.appendChild(renderer.domElement)
  renderer.domElement.style.cursor = 'crosshair'

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture

  // --- SETUP POST PROCESSING PIPELINE ---
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  
  // 1. Bloom (Subtle)
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.4, 0.85)
  bloomPass.threshold = 0.8
  bloomPass.strength = 0.3
  bloomPass.radius = 0.4
  composer.addPass(bloomPass)
  
  // 2. RGB Shift (Damage effect)
  rgbShiftPass = new ShaderPass(RGBShiftShader)
  rgbShiftPass.uniforms['amount'].value = 0.0
  composer.addPass(rgbShiftPass)

  // 3. Cinematic Vignette (No Grain)
  vignettePass = new ShaderPass(CinematicShader)
  vignettePass.uniforms['intensity'].value = 1.0
  composer.addPass(vignettePass)

  // 4. SMAA (Anti-aliasing)
  smaaPass = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio())
  composer.addPass(smaaPass)

  // 5. Output Pass (Fixes the washed-out colors)
  outputPass = new OutputPass()
  composer.addPass(outputPass)

  // ===== LIGHTING (Balanced) =====
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6) // Reduced to add contrast
  hemiLight.position.set(0, 200, 0)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xffffee, 1.8) 
  dirLight.position.set(100, 150, 100)
  dirLight.castShadow = true
  dirLight.shadow.camera.top = 100
  dirLight.shadow.camera.bottom = -100
  dirLight.shadow.camera.left = -100
  dirLight.shadow.camera.right = 100
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  dirLight.shadow.bias = -0.0005 
  scene.add(dirLight)

  // Ground
  const groundGeo = new THREE.PlaneGeometry(400, 400)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a6b4a, roughness: 0.9, metalness: 0.1 })
  groundMesh = new THREE.Mesh(groundGeo, groundMat)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.receiveShadow = true
  scene.add(groundMesh)
  
  // Grid overlay for the ground so it's not a flat blob
  const grid = new THREE.GridHelper(400, 100, 0x2a3a2a, 0x2a3a2a)
  grid.position.y = 0.01
  scene.add(grid)

  // Trees
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3025, roughness: 1 })
  const treeLeavesMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.8 })
  for (let i = 0; i < 40; i++) {
    const tree = new THREE.Group()
    const height = 3 + Math.random() * 3
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, height, 8), treeTrunkMat)
    trunk.position.y = height / 2
    trunk.castShadow = true; trunk.receiveShadow = true
    tree.add(trunk)
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), treeLeavesMat)
    leaves.position.y = height + 1
    leaves.castShadow = true; leaves.receiveShadow = true
    tree.add(leaves)
    let x, z
    do { x = (Math.random() - 0.5) * 300; z = (Math.random() - 0.5) * 300 } while (Math.abs(x) < 15 && Math.abs(z) < 15)
    tree.position.set(x, 0, z)
    scene.add(tree)
    obstacles.push(tree)
  }

  // Crates and Walls
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 })
  for (let i = 0; i < 30; i++) {
    const w = 2 + Math.random() * 4
    const h = 2 + Math.random() * 4
    const d = 2 + Math.random() * 4
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Math.random() > 0.5 ? crateMat : wallMat)
    box.position.set((Math.random() - 0.5) * 200, h / 2, (Math.random() - 0.5) * 200)
    box.castShadow = true; box.receiveShadow = true
    scene.add(box)
    obstacles.push(box)
  }

  // Rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 })
  for (let i = 0; i < 20; i++) {
    const size = 1 + Math.random() * 3
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size), rockMat)
    rock.position.set((Math.random() - 0.5) * 250, size / 2, (Math.random() - 0.5) * 250)
    rock.rotation.set(Math.random(), Math.random(), Math.random())
    rock.castShadow = true; rock.receiveShadow = true
    scene.add(rock)
    obstacles.push(rock)
  }

  // ===== BARRELS =====
  for (let i = 0; i < 15; i++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.5, 16), new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x330000, roughness: 0.4, metalness: 0.6 }))
    barrel.position.set((Math.random() - 0.5) * 160, 0.75, (Math.random() - 0.5) * 160)
    barrel.castShadow = true; scene.add(barrel); barrels.push(barrel)
  }

  miniMapCamera = new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 1000)
  miniMapCamera.position.set(0, 100, 0); miniMapCamera.up.set(0, 0, -1); miniMapCamera.lookAt(0, 0, 0)

  // ===== PLAYER GUN =====
  gunModel = new THREE.Group()
  const matBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.4 })
  const matDarkGrey = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.6 })
  const matPolymer = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.8 })
  accentMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 0.8 })

  const upperReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.45), matBlack)
  upperReceiver.position.set(0, 0.02, -0.15); gunModel.add(upperReceiver)
  
  const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.25), matBlack)
  lowerReceiver.position.set(0, -0.03, -0.1); gunModel.add(lowerReceiver)

  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), matDarkGrey)
  handguard.position.set(0, 0.02, -0.45); gunModel.add(handguard)

  const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.3), matBlack)
  railTop.position.set(0, 0.075, -0.45); gunModel.add(railTop)

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 12), matBlack)
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.75); gunModel.add(barrel)

  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 12), matDarkGrey)
  muzzleBrake.rotation.x = Math.PI / 2; muzzleBrake.position.set(0, 0.02, -0.92); gunModel.add(muzzleBrake)

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), matPolymer)
  mag.position.set(0, -0.14, -0.15); mag.rotation.x = -0.25; gunModel.add(mag)

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.08), matPolymer)
  grip.position.set(0, -0.12, 0.02); grip.rotation.x = 0.3; gunModel.add(grip)

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.2), matPolymer)
  stock.position.set(0, -0.02, 0.2); gunModel.add(stock)

  const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.1), matBlack)
  sightBase.position.set(0, 0.08, -0.15); gunModel.add(sightBase)

  const sightTube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 16, 1, true), matBlack)
  sightTube.rotation.x = Math.PI / 2; sightTube.position.set(0, 0.115, -0.15); gunModel.add(sightTube)

  sightGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.15, side: THREE.DoubleSide }))
  sightGlass.position.set(0, 0.115, -0.2); gunModel.add(sightGlass)

  const redDot = new THREE.Mesh(new THREE.SphereGeometry(0.002, 8, 8), accentMat)
  redDot.position.set(0, 0.115, -0.19); gunModel.add(redDot)

  const accentLine = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.01, 0.15), accentMat)
  accentLine.position.set(0, -0.01, -0.35); gunModel.add(accentLine)

  gunModel.position.copy(gunCurrentPos)
  gunModel.scale.set(0.6, 0.6, 0.6)
  
  const gunLight = new THREE.PointLight(0xffffff, 0.8, 5) // Dimmed slightly
  gunLight.position.set(0.2, 0.2, 0.5); camera.add(gunLight)
  
  camera.add(gunModel)

  muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
  muzzleFlash.position.set(0, 0.02, -0.95); muzzleFlash.visible = false; gunModel.add(muzzleFlash)

  muzzleLight = new THREE.PointLight(0x00ffff, 0, 10)
  muzzleLight.position.set(0, 0.02, -0.95); gunModel.add(muzzleLight)
  scene.add(camera)

  new GLTFLoader().load('/models/Soldier.glb', (gltf) => { soldier = gltf }, undefined, (err) => console.error('Model failed', err))

  onKeyDown = (e) => {
    keys[e.code] = true
    if (e.code === 'Space' && isGrounded && gameState.value === 'playing') { verticalVel = 8; isGrounded = false; landingKick = 0.1 }
    if (e.code === 'KeyR' && gameState.value === 'playing') reloadWeapon()
    const trySwitch = (name) => {
      if (currentWeapon.value === name) return
      weaponAmmo[currentWeapon.value] = currentAmmo.value
      currentWeapon.value = name
      currentAmmo.value = weaponAmmo[name]
      maxAmmo.value = WEAPON_CONFIG[name].maxAmmo
      isReloading.value = false
      reloadToken++
      
      const colors = { pistol: 0x00ffcc, shotgun: 0xffff00, sniper: 0xff00ff }
      accentMat.color.setHex(colors[name])
      accentMat.emissive.setHex(colors[name])
      
      if (name === 'shotgun') { gunModel.scale.set(0.7, 0.65, 0.6) }
      else if (name === 'sniper') { gunModel.scale.set(0.5, 0.5, 0.9) }
      else { gunModel.scale.set(0.6, 0.6, 0.6) }
    }
    if (e.code === 'Digit1') trySwitch('pistol')
    if (e.code === 'Digit2') trySwitch('shotgun')
    if (e.code === 'Digit3') trySwitch('sniper')
  }
  onKeyUp = (e) => { keys[e.code] = false }
  onMouseMove = (e) => {
    if (document.pointerLockElement !== renderer.domElement) return
    if (gameState.value !== 'playing') return
    me.ry -= e.movementX * 0.002
    camera.rotation.x -= e.movementY * 0.002
    camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x))
  }
  onMouseDown = (e) => {
    if (document.pointerLockElement !== renderer.domElement) { if (gameState.value === 'playing') renderer.domElement.requestPointerLock(); return }
    if (e.button === 0 && gameState.value === 'playing') shoot()
    if (e.button === 2 && gameState.value === 'playing') isAiming.value = true
  }
  onMouseUp = (e) => { if (e.button === 2) isAiming.value = false }
  onPointerLockChange = () => {
    if (!document.pointerLockElement && gameState.value === 'playing') gameState.value = 'paused'
    else if (document.pointerLockElement && gameState.value === 'paused') gameState.value = 'playing'
  }
  onContextMenu = (e) => e.preventDefault()
  onResize = () => { 
    camera.aspect = innerWidth / innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
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
    
    if (gameState.value === 'playing') {
      updatePlayer(dt)
      updateCombat(dt)
      updateAI(dt)
      updateRenderables(dt, now)
    }
    
    composer.render()

    if (gameState.value === 'playing') {
      const fog = scene.fog;
      scene.fog = null;
      renderer.setViewport(innerWidth - 220, innerHeight - 220, 200, 200)
      renderer.setScissor(innerWidth - 220, innerHeight - 220, 200, 200)
      renderer.setScissorTest(true)
      renderer.render(scene, miniMapCamera)
      renderer.setViewport(0, 0, innerWidth, innerHeight)
      renderer.setScissor(0, 0, innerWidth, innerHeight)
      renderer.setScissorTest(false)
      scene.fog = fog;
    }

    frame = requestAnimationFrame(loop)
  }

  function updatePlayer(dt) {
    rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, 0.001, dt * 10)

    if (overchargeTimer.value > 0) { overchargeTimer.value -= dt; if (overchargeTimer.value < 0) overchargeTimer.value = 0 }
    
    fovKick = THREE.MathUtils.lerp(fovKick, 0, dt * 10)
    const baseFov = isAiming.value ? (currentWeapon.value === 'sniper' ? 30 : 50) : 70
    camera.fov += (baseFov - camera.fov) * dt * 15
    camera.fov += fovKick
    camera.updateProjectionMatrix()

    landingKick = THREE.MathUtils.lerp(landingKick, 0, dt * 10)

    if (cameraShake > 0) { cameraShake -= dt * 2; if (cameraShake < 0) cameraShake = 0; camera.rotation.z = (Math.random() - 0.5) * cameraShake } else camera.rotation.z = 0

    const isMoving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD
    currentMoveAmount += ((isMoving ? 1 : 0) - currentMoveAmount) * dt * 10
    moveBobTime += dt * (isMoving ? (keys.ShiftLeft ? 15 : 10) : 2)
    const bobX = Math.cos(moveBobTime) * 0.01 * currentMoveAmount
    const bobY = Math.sin(moveBobTime * 2) * 0.008 * currentMoveAmount

    gunSway.x += (me.ry - (gunModel.userData.lastRy || me.ry)) * 0.05
    gunSway.y += (camera.rotation.x - (gunModel.userData.lastPitch || camera.rotation.x)) * 0.05
    gunSway.x *= 0.85; gunSway.y *= 0.85
    gunModel.userData.lastRy = me.ry; gunModel.userData.lastPitch = camera.rotation.x

    gunRot.x = THREE.MathUtils.lerp(gunRot.x, 0, dt * 15)
    gunRot.y = THREE.MathUtils.lerp(gunRot.y, 0, dt * 15)
    gunCurrentPos.z = THREE.MathUtils.lerp(gunCurrentPos.z, 0, dt * 15)

    const reloadOffset = isReloading.value ? -0.2 : 0
    
    const targetPos = isAiming.value ? ADS_POS.clone() : HIP_POS.clone()
    targetPos.x += bobX + gunSway.x
    targetPos.y += bobY + gunSway.y + reloadOffset
    
    gunModel.position.x = THREE.MathUtils.lerp(gunModel.position.x, targetPos.x, dt * 20)
    gunModel.position.y = THREE.MathUtils.lerp(gunModel.position.y, targetPos.y, dt * 20)
    gunModel.position.z = THREE.MathUtils.lerp(gunModel.position.z, targetPos.z + gunCurrentPos.z, dt * 20)
    
    gunModel.rotation.x = gunSway.y * 2 + gunRot.x + (isReloading.value ? -0.3 : 0)
    gunModel.rotation.y = gunSway.x * 2 + gunRot.y + (isReloading.value ? 0.3 : 0)
    camera.rotation.y = me.ry

    let nextX = me.x, nextZ = me.z
    const sprint = (keys.ShiftLeft || keys.ShiftRight) ? 1.8 : 1.0
    const speed = (isAiming.value ? 3 : 6) * sprint
    if (keys.KeyW) { nextX -= Math.sin(me.ry) * speed * dt; nextZ -= Math.cos(me.ry) * speed * dt }
    if (keys.KeyS) { nextX += Math.sin(me.ry) * speed * dt; nextZ += Math.cos(me.ry) * speed * dt }
    if (keys.KeyA) { nextX -= Math.cos(me.ry) * speed * dt; nextZ += Math.sin(me.ry) * speed * dt }
    if (keys.KeyD) { nextX += Math.cos(me.ry) * speed * dt; nextZ -= Math.sin(me.ry) * speed * dt }

    const checkCollision = (nx, nz) => {
      if (nx < -99.5 || nx > 99.5 || nz < -99.5 || nz > 99.5) return true
      for (const obs of obstacles) { const b = new THREE.Box3().setFromObject(obs); b.expandByScalar(0.5); if (b.containsPoint(new THREE.Vector3(nx, 1.0, nz))) return true }
      return false
    }
    if (!checkCollision(nextX, me.z)) me.x = nextX
    if (!checkCollision(me.x, nextZ)) me.z = nextZ
    
    groundRaycaster.set(new THREE.Vector3(me.x, 50, me.z), new THREE.Vector3(0, -1, 0))
    const hits = groundRaycaster.intersectObject(groundMesh, true)
    let groundY = 0
    if (hits.length > 0) { groundY = hits[0].point.y }

    camera.position.y += verticalVel * dt; verticalVel -= 25 * dt
    if (camera.position.y <= groundY + 1.6) { 
      if (!isGrounded) landingKick = 0.15
      camera.position.y = groundY + 1.6; verticalVel = 0; isGrounded = true 
    }
    camera.position.y -= landingKick
    camera.position.x = me.x; camera.position.z = me.z

    const tiltTarget = (keys.KeyA ? 0.02 : 0) - (keys.KeyD ? 0.02 : 0)
    if (cameraShake === 0) {
      camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, tiltTarget, dt * 5)
    }
  }

  function updateCombat(dt) {
    for (let i = playerLasers.length - 1; i >= 0; i--) {
      const l = playerLasers[i]
      l.mesh.position.add(l.vel.clone().multiplyScalar(dt))
      l.life -= dt
      let hit = false
      const laserBox = new THREE.Box3().setFromCenterAndSize(l.mesh.position, new THREE.Vector3(0.8, 0.8, 2))

      for (const e of enemies) {
        if (e.dead) continue
        const mesh = scene.getObjectByName(e.id)
        if (!mesh) continue
        const enemyBox = new THREE.Box3().setFromObject(mesh)
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
      gameState.value = 'shop'
      if (document.pointerLockElement) document.exitPointerLock()
      return
    }

    for (const e of enemies) {
      if (e.dead) continue
      const dx = me.x - e.x, dz = me.z - e.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      
      if (e.hitT > 0) { e.hitT -= dt; continue }
      
      const los = dist < 3 || hasLineOfSight(e.x, e.z, me.x, me.z)

      e.ry = Math.atan2(dx, dz)

      let moveX = 0, moveZ = 0;
      const angleToPlayer = Math.atan2(dx, dz)
      
      if (e.type === 'sniper') {
        if (dist < 25) {
          moveX = -Math.sin(angleToPlayer) * e.speed * dt
          moveZ = -Math.cos(angleToPlayer) * e.speed * dt
        } else if (dist > 60) {
          moveX = Math.sin(angleToPlayer) * e.speed * 0.5 * dt
          moveZ = Math.cos(angleToPlayer) * e.speed * 0.5 * dt
        } else {
          moveX = Math.sin(angleToPlayer + (Math.PI/2) * e.strafeDir) * e.speed * 0.3 * dt
          moveZ = Math.cos(angleToPlayer + (Math.PI/2) * e.strafeDir) * e.speed * 0.3 * dt
        }
        if (dist < e.attackDist && dist > 10 && los) {
          e.attackT -= dt
          if (e.attackT <= 0) { fireEnemyBullet(e, dx, dz, 40); e.attackT = 2.0 }
        }
      } 
      else if (e.type === 'runner') {
        if (dist > 2) {
          const zigZag = Math.sin(performance.now() * 0.01 + e.x) * 0.5
          const moveAngle = angleToPlayer + zigZag
          moveX = Math.sin(moveAngle) * e.speed * dt
          moveZ = Math.cos(moveAngle) * e.speed * dt
        } else {
          e.attackT -= dt
          if (e.attackT <= 0) { damagePlayer(10, e.x, e.z); e.attackT = 1.0 }
        }
      }
      else if (e.type === 'tank' || e.type === 'boss') {
        if (dist > 3) {
          moveX = Math.sin(angleToPlayer) * e.speed * dt
          moveZ = Math.cos(angleToPlayer) * e.speed * dt
          if (dist < e.attackDist && los) {
            e.attackT -= dt
            if (e.attackT <= 0) { fireEnemyBullet(e, dx, dz, 20); e.attackT = e.type === 'boss' ? 0.3 : 1.5 }
          }
        } else {
          e.attackT -= dt
          if (e.attackT <= 0) { damagePlayer(e.type === 'boss' ? 50 : 30, e.x, e.z); e.attackT = 1.5 }
        }
      }
      else {
        if (dist > 20) {
          moveX = Math.sin(angleToPlayer) * e.speed * dt
          moveZ = Math.cos(angleToPlayer) * e.speed * dt
        } else if (dist > 3) {
          const strafeAngle = angleToPlayer + (Math.PI/2) * e.strafeDir
          moveX = Math.sin(strafeAngle) * e.speed * dt
          moveZ = Math.cos(strafeAngle) * e.speed * dt
          if (Math.random() < 0.01) e.strafeDir *= -1;
        }
        if (dist < e.attackDist && dist > 10 && los) {
          e.attackT -= dt
          if (e.attackT <= 0) { fireEnemyBullet(e, dx, dz, 20); e.attackT = 1.2 }
        } else if (dist <= 3) {
          e.attackT -= dt
          if (e.attackT <= 0) { damagePlayer(15, e.x, e.z); e.attackT = 1.0 }
        }
      }

      let canX = true, canZ = true
      for (const obs of obstacles) {
        const b = new THREE.Box3().setFromObject(obs)
        if (b.containsPoint(new THREE.Vector3(e.x + moveX, 1, e.z))) canX = false
        if (b.containsPoint(new THREE.Vector3(e.x, 1, e.z + moveZ))) canZ = false
      }
      if (canX) e.x += moveX
      if (canZ) e.z += moveZ
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

  function fireEnemyBullet(e, dx, dz, speed) {
    const geo = new THREE.SphereGeometry(0.15, 6, 6)
    const mat = new THREE.MeshBasicMaterial({ color: e.bulletColor })
    const eb = new THREE.Mesh(geo, mat)
    eb.position.set(e.x, 1.5 * e.scale, e.z)
    eb.userData.vel = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(speed)
    eb.userData.life = 2.0
    eb.userData.dmg = e.bulletDmg
    scene.add(eb); enemyBullets.push(eb)
  }

  function updateRenderables(dt, now) {
    const activeIds = new Set()
    for (const e of enemies) {
      if (e.dead) continue
      activeIds.add(e.id)
      let m = scene.getObjectByName(e.id)
      if (!m) { m = createEnemyMesh(e); scene.add(m) }

      let diff = e.ry - m.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      m.rotation.y += diff * dt * 10;

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

      if (m.userData.flash) m.userData.flash.visible = e.attackT > (e.type === 'boss' ? 0.2 : (e.type === 'sniper' ? 1.9 : 1.4))
    }

    for (const child of scene.children) {
      if (child.name.startsWith('enemy') && !activeIds.has(child.name) && !ragdolls.find(r => r.mesh === child)) scene.remove(child)
    }
  }

  function createEnemyMesh(e) {
    const m = new THREE.Group()
    m.name = e.id
    const gunGroup = new THREE.Group()
    const eGunMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 })
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.6), eGunMat)
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), eGunMat)
    gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.z = -0.5
    gunGroup.add(gunBody, gunBarrel)
    gunGroup.position.set(0.25, 1.2, 0.5) 

    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: e.color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    flash.position.set(0, 0, -0.8); flash.visible = false
    gunGroup.add(flash)
    m.userData.flash = flash
    m.add(gunGroup)

    if (soldier) {
      const model = SkeletonUtils.clone(soldier.scene)
      model.rotation.y = Math.PI 
      model.traverse(o => { if (o.isMesh) o.castShadow = true })
      model.scale.setScalar(e.scale)
      m.add(model)
      if (soldier.animations.length) {
        const mixer = new THREE.AnimationMixer(model)
        const run = mixer.clipAction(soldier.animations.find(a => a.name.toLowerCase().includes('run')) || soldier.animations[0])
        const idle = mixer.clipAction(soldier.animations.find(a => a.name.toLowerCase().includes('idle')) || soldier.animations[0])
        idle.play()
        const bones = {}
        model.traverse(o => { if (o.isBone) bones[o.name] = o })
        m.userData = { ...m.userData, mixer, run, idle, state: 'idle', bones }
      }
    }

    const tag = new THREE.Mesh(new THREE.SphereGeometry(0.2 * e.scale, 12, 12), new THREE.MeshBasicMaterial({ color: e.color }))
    tag.position.y = 2.2 * e.scale
    m.add(tag)

    if (e.weakPoint) {
      const weak = new THREE.Mesh(new THREE.SphereGeometry(0.25 * e.scale, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff00ff }))
      weak.position.set(0, 1.0 * e.scale, -0.6 * e.scale)
      m.add(weak)
    }

    if (e.type === 'boss') m.add(new THREE.PointLight(0xff0000, 8, 25))
    return m
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
