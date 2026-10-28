import * as THREE from 'three'

const matMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.85, roughness: 0.3 })
const matDark = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.6, roughness: 0.6 })
const matGlove = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })

function addHands(group, zPos, yPos, leftHandZ, leftHandY, scale = 1) {
  const rHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.03 * scale, 0.1 * scale, 4, 8), matGlove)
  rHand.position.set(0, yPos - 0.05, zPos + 0.08)
  rHand.rotation.x = Math.PI / 2.5
  group.add(rHand)

  const lHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.03 * scale, 0.12 * scale, 4, 8), matGlove)
  lHand.position.set(0, leftHandY, leftHandZ)
  lHand.rotation.x = Math.PI / 2.2
  lHand.rotation.z = -0.2
  group.add(lHand)
}

export function buildPistol(color) {
  const group = new THREE.Group()
  const parts = {}
  const matAccent = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4, emissive: color, emissiveIntensity: 0.2 })

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.25), matDark)
  frame.position.set(0, 0.06, -0.05); group.add(frame)

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), matMetal)
  slide.position.set(0, 0.115, -0.05); group.add(slide); parts.slide = slide

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), matMetal)
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.115, -0.2); group.add(barrel)

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), matDark)
  grip.position.set(0, -0.02, 0.08); grip.rotation.x = 0.25; group.add(grip)

  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 12, Math.PI), matMetal)
  guard.rotation.x = Math.PI / 2; guard.rotation.z = Math.PI; guard.position.set(0, 0.02, 0.01); group.add(guard)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.01, 0.25), matAccent)
  stripe.position.set(0, 0.115, -0.05); group.add(stripe)

  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.02), matDark)
  rearSight.position.set(0, 0.1525, 0.05); group.add(rearSight)
  
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.015, 0.02), matAccent)
  frontSight.position.set(0, 0.1525, -0.18); group.add(frontSight)

  addHands(group, 0, 0, -0.05, -0.02, 0.9)

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.115, -0.3); group.add(muzzle)
  const ejectPort = new THREE.Object3D(); ejectPort.position.set(0.04, 0.115, -0.05); group.add(ejectPort)
  return { group, muzzle, ejectPort, parts }
}

export function buildShotgun(color) {
  const group = new THREE.Group()
  const parts = {}
  const matAccent = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4, emissive: color, emissiveIntensity: 0.2 })

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.25), matMetal)
  receiver.position.set(0, 0.06, 0); group.add(receiver)

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 12), matMetal)
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.11, -0.4); group.add(barrel)

  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.15), matDark)
  pump.position.set(0, 0.08, -0.3); group.add(pump); parts.pump = pump

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.25), matDark)
  stock.position.set(0, 0.04, 0.2); stock.rotation.x = -0.1; group.add(stock)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.01, 0.2), matAccent)
  stripe.position.set(0, 0.06, 0.02); group.add(stripe)

  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), matAccent)
  bead.position.set(0, 0.145, -0.68); group.add(bead)

  addHands(group, 0, 0, -0.3, 0.05, 1.0)

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.11, -0.7); group.add(muzzle)
  const ejectPort = new THREE.Object3D(); ejectPort.position.set(0.04, 0.06, 0); group.add(ejectPort)
  return { group, muzzle, ejectPort, parts }
}

export function buildSniper(color) {
  const group = new THREE.Group()
  const parts = {}
  const matAccent = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4, emissive: color, emissiveIntensity: 0.2 })
  const matLens = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), matDark)
  body.position.set(0, 0.05, -0.05); group.add(body)

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 12), matMetal)
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.08, -0.45); group.add(barrel)

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.3), matDark)
  stock.position.set(0, 0.03, 0.25); stock.rotation.x = -0.15; group.add(stock)

  const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.12), matDark)
  cheek.position.set(0, 0.09, 0.22); group.add(cheek)

  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), matMetal)
  bolt.rotation.z = Math.PI / 2; bolt.position.set(0.05, 0.08, 0.05); group.add(bolt); parts.bolt = bolt
  
  const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), matMetal)
  boltKnob.position.set(0.09, 0.08, 0.05); group.add(boltKnob); parts.bolt.add(boltKnob)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.01, 0.3), matAccent)
  stripe.position.set(0, 0.05, -0.15); group.add(stripe)

  const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 12), matMetal)
  scopeBody.rotation.x = Math.PI / 2; scopeBody.position.set(0, 0.14, -0.05); group.add(scopeBody)

  const lensFront = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), matLens)
  lensFront.position.set(0, 0.14, -0.175); group.add(lensFront)
  
  const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), matLens)
  lensRear.position.set(0, 0.14, 0.075); lensRear.rotation.y = Math.PI; group.add(lensRear)

  const mount1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), matMetal)
  mount1.position.set(0, 0.1, -0.15); group.add(mount1)
  const mount2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), matMetal)
  mount2.position.set(0, 0.1, 0.05); group.add(mount2)

  addHands(group, 0, 0, -0.15, 0.05, 1.1)

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.08, -0.75); group.add(muzzle)
  const ejectPort = new THREE.Object3D(); ejectPort.position.set(0.04, 0.08, 0.02); group.add(ejectPort)
  return { group, muzzle, ejectPort, parts }
}
