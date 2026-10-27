<template>
  <div style="position:fixed;inset:0;overflow:hidden;">
    <div ref="root" style="position:fixed;inset:0;"></div>
    
    <!-- In-Game HUD -->
    <div v-if="gameState === 'playing'" style="position:fixed;bottom:20px;left:20px;color:#fff;font:bold 20px sans-serif;text-shadow:0 2px 4px #000;z-index:5;">
      <div style="color:#ff5555;">HP: {{ playerHp }}</div>
      <div style="font-size:14px;color:#aaa;margin-top:4px;">Weapon: {{ currentWeapon.toUpperCase() }}</div>
    </div>
    
    <!-- Crosshair -->
    <div v-if="gameState === 'playing'" style="position:fixed;top:50%;left:50%;width:6px;height:6px;background:#00ffcc;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:10;box-shadow:0 0 4px #000;"></div>

    <!-- Damage Vignette -->
    <div v-if="isHurt" style="position:fixed;inset:0;background:radial-gradient(circle, transparent 40%, rgba(255,0,0,0.6) 100%);pointer-events:none;z-index:20;transition:opacity 0.1s;"></div>

    <!-- Main Menu / Pause / Game Over Overlay -->
    <div v-if="gameState !== 'playing'" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;color:#fff;font-family:sans-serif;backdrop-filter:blur(5px);">
      
      <h1 v-if="gameState === 'menu'" style="font-size:64px;margin:0;color:#00ffcc;text-shadow:0 0 20px rgba(0,255,204,0.5);letter-spacing:4px;">NEXUS STRIKE</h1>
      <h1 v-if="gameState === 'paused'" style="font-size:48px;margin:0;">PAUSED</h1>
      <h1 v-if="gameState === 'dead'" style="font-size:64px;margin:0;color:#ff3333;text-shadow:0 0 20px rgba(255,51,51,0.5);">YOU DIED</h1>
      
      <p v-if="gameState === 'menu'" style="font-size:18px;color:#aaa;margin-top:20px;max-width:400px;text-align:center;line-height:1.6;">
        WASD to move • Mouse to look<br>
        Shift to sprint • Space to jump<br>
        Left Click to shoot • 1 and 2 to switch weapons
      </p>

      <button @click="startGame" 
        style="margin-top:40px;padding:15px 40px;font-size:24px;font-weight:bold;background:#00ffcc;color:#000;border:none;border-radius:8px;cursor:pointer;transition:transform 0.1s, background 0.2s;"
        onmouseover="this.style.background='#00cca3'" onmouseout="this.style.background='#00ffcc'">
        {{ gameState === 'menu' ? 'CLICK TO PLAY' : gameState === 'dead' ? 'RESPAWN' : 'RESUME' }}
      </button>
      
    </div>
  </div>
</template>

<script setup>
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

const root = ref(null)
const playerHp = ref(100)
const isHurt = ref(false)
const currentWeapon = ref('pistol')
const gameState = ref('menu') 

let renderer, frame, onResize, onKeyDown, onKeyUp
let scene, camera
let soldier = null
let audioCtx = null

const bullets = []
const enemyBullets = []
const ragdolls = [] // PHYSICS OBJECTS
const keys = {}
let me = { x: 0, z: 0, ry: 0 }
let verticalVel = 0
let isGrounded = true
let gunRecoil = 0
let gun, muzzleLight
let lastShootTime = 0
const obstacles = []
let enemies = []

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

function playSound(type) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  const now = audioCtx.currentTime

  if (type === 'pistol') {
    osc.type = 'square'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.1)
    gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1)
  } else if (type === 'shotgun') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.3)
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3)
  } else if (type === 'hit') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(2000, now + 0.05)
    gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); osc.start(now); osc.stop(now + 0.05)
  } else if (type === 'hurt') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(50, now + 0.2)
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2)
  } else if (type === 'enemy_shoot') {
    osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.15)
    gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(now); osc.stop(now + 0.15)
  }
}

function shoot() {
  const now = performance.now()
  if (currentWeapon.value === 'pistol' && now - lastShootTime < 200) return
  if (currentWeapon.value === 'shotgun' && now - lastShootTime < 800) return
  lastShootTime = now

  const numBullets = currentWeapon.value === 'shotgun' ? 5 : 1
  
  for (let i = 0; i < numBullets; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(currentWeapon.value === 'shotgun' ? 0.1 : 0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: currentWeapon.value === 'shotgun' ? 0x00ffff : 0xff3300 })
    )
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    if (currentWeapon.value === 'shotgun') {
      dir.x += (Math.random() - 0.5) * 0.2; dir.y += (Math.random() - 0.5) * 0.2; dir.z += (Math.random() - 0.5) * 0.2; dir.normalize()
    }
    b.position.copy(camera.position).add(dir.clone().multiplyScalar(1))
    b.userData.vel = dir.clone().multiplyScalar(40)
    b.userData.life = 2.0
    scene.add(b)
    bullets.push(b)
  }
  playSound(currentWeapon.value === 'shotgun' ? 'shotgun' : 'pistol')
  muzzleLight.intensity = currentWeapon.value === 'shotgun' ? 8 : 4
  setTimeout(() => muzzleLight.intensity = 0, 50)
  gunRecoil = currentWeapon.value === 'shotgun' ? 0.2 : 0.1
}

const startGame = () => {
  initAudio()
  if (gameState.value === 'menu' || gameState.value === 'dead') {
    playerHp.value = 100
    me.x = 0; me.z = 0; me.ry = 0; camera.rotation.x = 0
    if (enemies.length === 0) spawnEnemies()
    else {
      for (const en of enemies) { en.dead = false; en.hp = 100; en.x = (Math.random() - 0.5) * 160; en.z = (Math.random() - 0.5) * 160 }
    }
  }
  gameState.value = 'playing'
  renderer.domElement.requestPointerLock()
}

const spawnEnemies = () => {
  for (let i = 0; i < 30; i++) {
    enemies.push({ id: 'enemy' + i, team: 'blue', x: (Math.random() - 0.5) * 160, z: (Math.random() - 0.5) * 160, ry: 0, hp: 100, dead: false, respawnT: 0, attackT: 0 })
  }
}

const checkDeath = () => {
  if (playerHp.value <= 0) {
    gameState.value = 'dead'
    if (document.pointerLockElement) document.exitPointerLock()
  }
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb)

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000)
  camera.rotation.order = 'YXZ' 

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = true
  root.value.appendChild(renderer.domElement)
  renderer.domElement.style.cursor = 'crosshair'

  const light = new THREE.DirectionalLight(0xffffff, 1.5)
  light.position.set(50, 100, 50); light.castShadow = true
  scene.add(light, new THREE.AmbientLight(0xffffff, 0.5))

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x55aa55 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
  const grid = new THREE.GridHelper(200, 100, 0x2e7d32, 0x2e7d32); grid.position.y = 0.01; scene.add(grid)

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555 })
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  
  const addBox = (x, z, w, h, d, mat) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    box.position.set(x, h/2, z); box.castShadow = true; box.receiveShadow = true
    scene.add(box); obstacles.push(box)
  }
  addBox(0, 30, 40, 8, 2, wallMat); addBox(-30, 0, 2, 8, 40, wallMat)
  addBox(30, -20, 2, 8, 40, wallMat); addBox(0, -40, 40, 8, 2, wallMat)
  for (let i = 0; i < 40; i++) {
    addBox((Math.random() - 0.5) * 180, (Math.random() - 0.5) * 180, Math.random() * 4 + 2, Math.random() * 4 + 2, Math.random() * 4 + 2, crateMat)
  }

  gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x333333 }))
  gun.position.set(0.35, -0.25, -0.6)
  camera.add(gun)
  scene.add(camera)
  
  muzzleLight = new THREE.PointLight(0xffaa00, 0, 5)
  muzzleLight.position.set(0.35, -0.25, -1)
  camera.add(muzzleLight)

  new GLTFLoader().load('/models/Soldier.glb', (gltf) => { soldier = gltf }, undefined, (err) => console.error('Model failed', err))

  onKeyDown = (e) => { 
    keys[e.code] = true
    if (e.code === 'Space' && isGrounded && gameState.value === 'playing') { verticalVel = 8; isGrounded = false }
    if (e.code === 'Digit1') { currentWeapon.value = 'pistol'; gun.scale.set(1, 1, 1); gun.material.color.setHex(0x333333); gun.position.set(0.35, -0.25, -0.6) }
    if (e.code === 'Digit2') { currentWeapon.value = 'shotgun'; gun.scale.set(1.5, 1.5, 2); gun.material.color.setHex(0x555555); gun.position.set(0.4, -0.3, -0.8) }
  }
  onKeyUp = (e) => keys[e.code] = false
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp)

  const onMouseMove = (e) => {
    if (document.pointerLockElement !== renderer.domElement) return
    if (gameState.value !== 'playing') return
    me.ry -= e.movementX * 0.002
    camera.rotation.x -= e.movementY * 0.002
    camera.rotation.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, camera.rotation.x))
  }
  
  const onMouseDown = (e) => {
    if (document.pointerLockElement !== renderer.domElement) {
      if (gameState.value === 'playing') renderer.domElement.requestPointerLock()
      return
    }
    if (e.button === 0 && gameState.value === 'playing') shoot()
  }
  
  const onPointerLockChange = () => {
    if (!document.pointerLockElement && gameState.value === 'playing') gameState.value = 'paused'
    else if (document.pointerLockElement && gameState.value === 'paused') gameState.value = 'playing'
  }
  
  addEventListener('mousemove', onMouseMove)
  addEventListener('mousedown', onMouseDown)
  addEventListener('pointerlockchange', onPointerLockChange)

  onResize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight) }
  addEventListener('resize', onResize)

  // AI Loop
  setInterval(() => {
    if (gameState.value !== 'playing') return
    for (const e of enemies) {
      if (e.dead) {
        e.respawnT -= 0.05
        if (e.respawnT <= 0) { e.dead = false; e.hp = 100; e.x = (Math.random() - 0.5) * 160; e.z = (Math.random() - 0.5) * 160 }
        continue
      }
      const dx = me.x - e.x; const dz = me.z - e.z; const dist = Math.sqrt(dx*dx + dz*dz)
      
      if (dist > 15 && dist < 40) {
        e.ry = Math.atan2(dx, dz) - Math.PI/2; e.attackT -= 0.05
        if (e.attackT <= 0) {
          const eb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 }))
          eb.position.set(e.x, 1.5, e.z); eb.userData.vel = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(20); eb.userData.life = 2.0
          scene.add(eb); enemyBullets.push(eb); playSound('enemy_shoot'); e.attackT = 1.5
        }
      } else if (dist > 1.5) {
        const speed = 3 * 0.05; const nextX = e.x + (dx / dist) * speed; const nextZ = e.z + (dz / dist) * speed
        let canMoveX = true; let canMoveZ = true
        for (const obs of obstacles) {
          const b = new THREE.Box3().setFromObject(obs)
          if (b.containsPoint(new THREE.Vector3(nextX, 1, e.z))) canMoveX = false
          if (b.containsPoint(new THREE.Vector3(e.x, 1, nextZ))) canMoveZ = false
        }
        if (canMoveX) e.x = nextX; if (canMoveZ) e.z = nextZ
        e.ry = Math.atan2(dx, dz) - Math.PI/2
      } else {
        e.attackT -= 0.05
        if (e.attackT <= 0) { playerHp.value -= 10; isHurt.value = true; playSound('hurt'); setTimeout(() => isHurt.value = false, 150); e.attackT = 1.0; checkDeath() }
      }
    }
  }, 50)

  const clock = new THREE.Clock()
  const loop = () => {
    const dt = clock.getDelta()
    if (gameState.value === 'playing') {
      if (gunRecoil > 0) { gun.position.z = -0.6 + gunRecoil; gunRecoil -= dt * 2 } else gun.position.z = -0.6
      camera.rotation.y = me.ry
      
      let nextX = me.x; let nextZ = me.z
      const sprintMultiplier = (keys.ShiftLeft || keys.ShiftRight) ? 1.8 : 1.0
      const currentSpeed = 6 * sprintMultiplier

      if (keys.KeyW) { nextX -= Math.sin(me.ry) * currentSpeed * dt; nextZ -= Math.cos(me.ry) * currentSpeed * dt }
      if (keys.KeyS) { nextX += Math.sin(me.ry) * currentSpeed * dt; nextZ += Math.cos(me.ry) * currentSpeed * dt }
      if (keys.KeyA) { nextX -= Math.cos(me.ry) * currentSpeed * dt; nextZ += Math.sin(me.ry) * currentSpeed * dt }
      if (keys.KeyD) { nextX += Math.cos(me.ry) * currentSpeed * dt; nextZ -= Math.sin(me.ry) * currentSpeed * dt }

      const checkCollision = (nx, nz) => {
        if (nx < -99.5 || nx > 99.5 || nz < -99.5 || nz > 99.5) return true
        for (const obs of obstacles) {
          const b = new THREE.Box3().setFromObject(obs); b.expandByScalar(0.5)
          if (b.containsPoint(new THREE.Vector3(nx, 1.0, nz))) return true
        }
        return false
      }

      if (!checkCollision(nextX, me.z)) me.x = nextX
      if (!checkCollision(me.x, nextZ)) me.z = nextZ

      camera.position.y += verticalVel * dt; verticalVel -= 25 * dt
      if (camera.position.y <= 1.6) { camera.position.y = 1.6; verticalVel = 0; isGrounded = true }
      
      camera.position.x = me.x; camera.position.z = me.z

      // Player Bullets & Ragdoll Trigger
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i]; b.position.add(b.userData.vel.clone().multiplyScalar(dt)); b.userData.life -= dt
        let hit = false
        for (const e of enemies) {
          if (!e.dead && b.position.distanceTo(new THREE.Vector3(e.x, 1.5, e.z)) < 0.9) {
            e.hp -= 50; playSound('hit'); hit = true
            
            if (e.hp <= 0) { 
              e.dead = true; e.respawnT = 4.0 
              
              const mesh = scene.getObjectByName(e.id)
              if (mesh) {
                if (mesh.userData.mixer) mesh.userData.mixer.stopAllAction()
                // BONE CONTORTION (Human Fall Flat style)
                if (mesh.userData.bones) {
                  for (const k in mesh.userData.bones) {
                    const bone = mesh.userData.bones[k];
                    bone.rotation.x = (Math.random() - 0.5) * 2;
                    bone.rotation.y = (Math.random() - 0.5) * 2;
                    bone.rotation.z = (Math.random() - 0.5) * 2;
                  }
                }
                ragdolls.push({
                  mesh,
                  vx: (Math.random() - 0.5) * 25,
                  vy: Math.random() * 15 + 10,
                  vz: (Math.random() - 0.5) * 25,
                  rx: (Math.random() - 0.5) * 30,
                  ry: (Math.random() - 0.5) * 30,
                  rz: (Math.random() - 0.5) * 30,
                  life: 4.0
                })
              }
            }
            break
          }
        }
        if (hit || b.userData.life <= 0) { scene.remove(b); bullets.splice(i, 1) }
      }

      // Enemy Bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i]; b.position.add(b.userData.vel.clone().multiplyScalar(dt)); b.userData.life -= dt
        if (b.position.distanceTo(new THREE.Vector3(me.x, 1.5, me.z)) < 0.8) {
          playerHp.value -= 15; isHurt.value = true; playSound('hurt'); setTimeout(() => isHurt.value = false, 150); b.userData.life = 0; checkDeath()
        }
        if (b.userData.life <= 0) { scene.remove(b); enemyBullets.splice(i, 1) }
      }

      // Update Ragdolls
      for (let i = ragdolls.length - 1; i >= 0; i--) {
        const r = ragdolls[i]
        r.life -= dt
        
        r.vy -= 30 * dt // Gravity
        r.mesh.position.x += r.vx * dt
        r.mesh.position.y += r.vy * dt
        r.mesh.position.z += r.vz * dt
        
        r.mesh.rotation.x += r.rx * dt
        r.mesh.rotation.y += r.ry * dt
        r.mesh.rotation.z += r.rz * dt

        // Bounce & Squash on floor
        if (r.mesh.position.y <= 0.4) {
          r.mesh.position.y = 0.4
          r.vy = -r.vy * 0.5
          r.vx *= 0.7
          r.vz *= 0.7
          r.rx *= 0.7; r.ry *= 0.7; r.rz *= 0.7
          r.mesh.scale.set(1.5, 0.5, 1.5) // SQUASH
        }

        // Recover scale
        r.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 5)

        // Shrink and vanish
        if (r.life < 1.5) {
          r.mesh.scale.setScalar(Math.max(0.01, r.life / 1.5))
        }

        if (r.life <= 0) {
          scene.remove(r.mesh)
          ragdolls.splice(i, 1)
        }
      }

      // Sync Enemy Meshes & Wobbly Walk
      const activeIds = new Set()
      for (const e of enemies) {
        if (e.dead) continue
        activeIds.add(e.id)
        let m = scene.getObjectByName(e.id)
        if (!m) {
          m = new THREE.Group(); m.name = e.id
          if (soldier) {
            const model = SkeletonUtils.clone(soldier.scene); model.rotation.y = Math.PI; model.traverse(o => { if(o.isMesh) o.castShadow = true }); m.add(model)
            if (soldier.animations.length) {
              const mixer = new THREE.AnimationMixer(model)
              const run = mixer.clipAction(soldier.animations.find(a => a.name.toLowerCase().includes('run')) || soldier.animations[0])
              const idle = mixer.clipAction(soldier.animations.find(a => a.name.toLowerCase().includes('idle')) || soldier.animations[0])
              idle.play()
              
              // Extract bones for Ragdoll
              const bones = {}
              model.traverse(o => { if (o.isBone) bones[o.name] = o; })
              
              m.userData = { mixer, run, idle, state: 'idle', bones }
            }
          }
          const tag = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshBasicMaterial({ color: 0x1e88e5 })); tag.position.y = 2.2; m.add(tag)
          scene.add(m)
        }
        
        // Smooth movement and Wobble
        m.position.x += (e.x - m.position.x) * 15 * dt
        m.position.z += (e.z - m.position.z) * 15 * dt
        const isMoving = Math.abs(e.x - m.position.x) > 0.1 || Math.abs(e.z - m.position.z) > 0.1

        if (isMoving) {
          m.position.y = Math.abs(Math.sin(performance.now() * 0.02)) * 0.4
          m.rotation.z = Math.sin(performance.now() * 0.02) * 0.4
          m.rotation.x = Math.sin(performance.now() * 0.04) * 0.1
          if (m.userData.mixer && m.userData.state !== 'run') {
             m.userData.idle.fadeOut(0.2); m.userData.run.reset().fadeIn(0.2).play(); m.userData.state = 'run'
          }
        } else {
          m.position.y = 0
          m.rotation.z = Math.sin(performance.now() * 0.005) * 0.05
          m.rotation.x = 0
          if (m.userData.mixer && m.userData.state !== 'idle') {
             m.userData.run.fadeOut(0.2); m.userData.idle.reset().fadeIn(0.2).play(); m.userData.state = 'idle'
          }
        }
        
        if (m.userData.mixer) m.userData.mixer.update(dt)
        m.rotation.y = e.ry
      }
      
      for (const child of scene.children) {
        if (child.name.startsWith('enemy') && !activeIds.has(child.name) && !ragdolls.find(r => r.mesh === child)) {
          scene.remove(child)
        }
      }
    }
    renderer.render(scene, camera)
    frame = requestAnimationFrame(loop)
  }
  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  removeEventListener('resize', onResize); removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp)
  renderer?.dispose()
})
</script>
