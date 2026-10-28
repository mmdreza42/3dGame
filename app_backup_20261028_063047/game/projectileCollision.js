import * as THREE from 'three'

/**
 * Return the first point where a finite projectile segment intersects a box.
 * Returns null when the segment does not intersect the box.
 */
export function segmentBoxIntersection(start, end, box) {
  if (box.containsPoint(start)) return start.clone()

  const direction = end.clone().sub(start)
  const lengthSq = direction.lengthSq()

  if (lengthSq === 0) return null

  const length = Math.sqrt(lengthSq)
  direction.divideScalar(length)

  const ray = new THREE.Ray(start.clone(), direction)
  const point = ray.intersectBox(box, new THREE.Vector3())

  if (!point) return null

  const distanceSq = point.distanceToSquared(start)
  if (distanceSq > lengthSq + 1e-9) return null

  return point
}
