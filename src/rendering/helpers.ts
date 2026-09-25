import * as THREE from 'three'

export const COLORS = Object.freeze({
  cyan: 0x55d9d0,
  amber: 0xf7b955,
  red: 0xf2766b,
  blue: 0x4fa3ff,
  white: 0xeef7f5,
  muted: 0x7b9396,
  orbit: 0x739da2
})

interface NavigatorWithMemory extends Navigator {
  readonly deviceMemory?: number
}

function sphereSegments(width: number, height: number): readonly [number, number] {
  const memory = (navigator as NavigatorWithMemory).deviceMemory ?? 4
  const lowPower = memory <= 3 || (navigator.hardwareConcurrency ?? 4) <= 4
  return lowPower ? [Math.max(24, Math.round(width * .62)), Math.max(16, Math.round(height * .62))] : [width, height]
}

export function circlePoints(radius: number, segments = 160, plane: 'xy' | 'xz' | 'yz' = 'xz'): THREE.Vector3[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = index / segments * Math.PI * 2
    const a = Math.cos(angle) * radius
    const b = Math.sin(angle) * radius
    if (plane === 'xy') return new THREE.Vector3(a, b, 0)
    if (plane === 'yz') return new THREE.Vector3(0, a, b)
    return new THREE.Vector3(a, 0, b)
  })
}

export function lineFromPoints(
  points: readonly THREE.Vector3[],
  color: number = COLORS.orbit,
  opacity = 0.7,
  dashed = false
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([...points])
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.15, gapSize: 0.1 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  const line = new THREE.Line(geometry, material)
  if (dashed) line.computeLineDistances()
  return line
}

export function ring(radius: number, color: number = COLORS.orbit, opacity = 0.55, plane: 'xy' | 'xz' | 'yz' = 'xz'): THREE.Line {
  return lineFromPoints(circlePoints(radius, 180, plane), color, opacity)
}

export function createLabel(text: string, color = '#eef7f5', size = 0.42): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = '600 38px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = 'rgba(0,0,0,.9)'
    context.shadowBlur = 10
    context.fillStyle = color
    context.fillText(text, 256, 64)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(size * 4, size, 1)
  sprite.userData.layer = 'labels'
  sprite.userData.text = text
  return sprite
}

export function createSun(radius = 0.5): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color: 0xffbc58 })
  const [width, height] = sphereSegments(48, 32)
  const sun = new THREE.Mesh(new THREE.SphereGeometry(radius, width, height), material)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture(), color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  glow.scale.setScalar(radius * 5)
  sun.add(glow)
  sun.userData.kind = 'sun'
  return sun
}

function createGlowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,220,.95)')
    gradient.addColorStop(.2, 'rgba(255,190,80,.55)')
    gradient.addColorStop(1, 'rgba(255,130,20,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  return new THREE.CanvasTexture(canvas)
}

export function createEarth(radius = 1, textureUrl?: string): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color: 0x2c6a82, roughness: 0.72, metalness: 0.02 })
  if (textureUrl) {
    new THREE.TextureLoader().load(textureUrl, (texture) => {
      if (material.userData.disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      material.map = texture
      material.color.set(0xffffff)
      material.needsUpdate = true
    })
  }
  const [width, height] = sphereSegments(64, 40)
  const earth = new THREE.Mesh(new THREE.SphereGeometry(radius, width, height), material)
  earth.receiveShadow = true
  earth.castShadow = true
  earth.userData.kind = 'earth'
  return earth
}

export function createMoon(radius = 0.28, textureUrl?: string): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color: 0xaeb1ad, roughness: 1, metalness: 0 })
  if (textureUrl) {
    new THREE.TextureLoader().load(textureUrl, (texture) => {
      if (material.userData.disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      material.map = texture
      material.emissiveMap = texture
      material.color.set(0xffffff)
      material.needsUpdate = true
    })
  }
  const [width, height] = sphereSegments(48, 32)
  const moon = new THREE.Mesh(new THREE.SphereGeometry(radius, width, height), material)
  moon.receiveShadow = true
  moon.castShadow = true
  moon.userData.kind = 'moon'
  return moon
}

/** The LRO map's near-side centre is local +X (SphereGeometry U = 0.5). */
export function orientMoonNearSide(moon: THREE.Object3D, observer: THREE.Vector3): void {
  moon.lookAt(observer)
  moon.rotateY(-Math.PI / 2)
}

export function createArrow(direction: THREE.Vector3, origin: THREE.Vector3, length: number, color: number): THREE.ArrowHelper {
  return new THREE.ArrowHelper(direction.clone().normalize(), origin, length, color, Math.min(.18, length * .25), Math.min(.1, length * .14))
}

export function createStarField(count: number, radius = 42): THREE.Points {
  const positions = new Float32Array(count * 3)
  let seed = 872341
  const random = (): number => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let index = 0; index < count; index += 1) {
    const theta = random() * Math.PI * 2
    const y = random() * 2 - 1
    const radial = Math.sqrt(1 - y * y)
    positions[index * 3] = radial * Math.cos(theta) * radius
    positions[index * 3 + 1] = y * radius
    positions[index * 3 + 2] = radial * Math.sin(theta) * radius
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color: 0xbfd9df, size: .05, transparent: true, opacity: .62, sizeAttenuation: true })
  return new THREE.Points(geometry, material)
}

export function createConeBetween(start: THREE.Vector3, end: THREE.Vector3, startRadius: number, endRadius: number, color: number, opacity: number): THREE.Mesh {
  const length = start.distanceTo(end)
  const geometry = new THREE.CylinderGeometry(endRadius, startRadius, length, 48, 1, true)
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(start).add(end).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize())
  mesh.userData.layer = 'shadows'
  return mesh
}

/** Reuse a cone mesh instead of allocating/discarding GPU buffers every animation frame. */
export function updateConeBetween(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, startRadius: number, endRadius: number): void {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const original = mesh.userData.unitVertices ?? Float32Array.from(positions.array)
  mesh.userData.unitVertices = original
  for (let index = 0; index < positions.count; index += 1) {
    const radius = original[index * 3 + 1] > 0 ? endRadius : startRadius
    positions.setXYZ(index, original[index * 3] * radius, original[index * 3 + 1], original[index * 3 + 2] * radius)
  }
  positions.needsUpdate = true
  geometry.computeBoundingSphere()
  mesh.position.copy(start).add(end).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize())
  mesh.scale.y = start.distanceTo(end)
}

export function setLayerVisibility(root: THREE.Object3D, labels: boolean, paths: boolean, shadows: boolean): void {
  root.traverse((object) => {
    const layer = object.userData.layer as string | undefined
    if (layer === 'labels') object.visible = labels
    if (layer === 'paths') object.visible = paths
    if (layer === 'shadows') object.visible = shadows
  })
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose()
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    for (const material of materials) {
      const withMap = material as THREE.Material & { map?: THREE.Texture }
      material.userData.disposed = true
      withMap.map?.dispose()
      material.dispose()
    }
  })
}
