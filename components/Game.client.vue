<template>
  <div ref="root" style="position:fixed;inset:0;"></div>
</template>

<script setup>
import * as THREE from 'three'

const root = ref(null)
let renderer, frame, onResize, onKeyDown, onKeyUp

onMounted(() => {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb)

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100)
  camera.position.set(0, 6, 10)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = true
  root.value.appendChild(renderer.domElement)

  const light = new THREE.DirectionalLight(0xffffff, 1.5)
  light.position.set(5, 10, 5)
  light.castShadow = true
  scene.add(light, new THREE.AmbientLight(0xffffff, 0.5))

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x55aa55 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const player = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff5533 })
  )
  player.position.y = 0.5
  player.castShadow = true
  scene.add(player)

  const keys = {}
  onKeyDown = (e) => (keys[e.code] = true)
  onKeyUp = (e) => (keys[e.code] = false)
  addEventListener('keydown', onKeyDown)
  addEventListener('keyup', onKeyUp)

  onResize = () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  }
  addEventListener('resize', onResize)

  const clock = new THREE.Clock()
  const loop = () => {
    const dt = clock.getDelta()
    const speed = 5
    if (keys.KeyW) player.position.z -= speed * dt
    if (keys.KeyS) player.position.z += speed * dt
    if (keys.KeyA) player.position.x -= speed * dt
    if (keys.KeyD) player.position.x += speed * dt
    renderer.render(scene, camera)
    frame = requestAnimationFrame(loop)
  }
  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  removeEventListener('resize', onResize)
  removeEventListener('keydown', onKeyDown)
  removeEventListener('keyup', onKeyUp)
  renderer?.dispose()
})
</script>
