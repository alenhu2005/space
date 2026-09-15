import * as THREE from 'three'
import { degreesToRadians, moonPhaseFromAngle } from '../core/astro-math'
import { COLORS, ring, createSun, createEarth, createMoon, createArrow } from '../rendering/helpers'
import { parameter, applyLayers, sunAlignedVector, type BuildContext, type SceneVisual } from './shared'

export function createTides(context: BuildContext): SceneVisual {
  const root = new THREE.Group()
  const earth = createEarth(.85, context.earthTextureUrl)
  root.add(earth)
  const water = new THREE.Mesh(new THREE.SphereGeometry(.92, 40, 24), new THREE.MeshPhongMaterial({ color: 0x44b7d4, transparent: true, opacity: .35, shininess: 80, side: THREE.DoubleSide }))
  const originalWater = Float32Array.from(water.geometry.getAttribute('position').array)
  root.add(water)
  water.userData.layer = 'shadows'
  const moon = createMoon(.27, context.moonTextureUrl)
  root.add(moon)
  const sun = createSun(.55)
  sun.position.set(-5.5, 0, 0)
  root.add(sun)
  const moonOrbit = ring(3.15, COLORS.orbit, .32)
  moonOrbit.userData.layer = 'paths'
  root.add(moonOrbit)
  const arrows = new THREE.Group()
  arrows.userData.layer = 'shadows'
  root.add(arrows)
  const lunarArrows = [1, -1].map(() => createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), .72, COLORS.cyan))
  const solarArrows = [1, -1].map(() => createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), .33, COLORS.amber))
  arrows.add(...lunarArrows, ...solarArrows)

  return {
    root,
    cameras: [
      { id: 'top', label: '軌道俯視', position: new THREE.Vector3(0, 9.3, .01), target: new THREE.Vector3(0, 0, 0) },
      { id: 'angled', label: '斜視', position: new THREE.Vector3(7.4, 5.6, 7), target: new THREE.Vector3(0, 0, 0) },
      { id: 'earth', label: '近地球', position: new THREE.Vector3(2.8, 1.8, 3.2), target: new THREE.Vector3(0, 0, 0) }
    ],
    update(state) {
      const phaseAngle = state.mode === 'real' ? context.astronomy.moonPhaseAngle(new Date(state.instant)) : state.timeline * 360
      const angle = degreesToRadians(phaseAngle)
      moon.position.set(-Math.cos(angle) * 3.15, 0, Math.sin(angle) * 3.15)
      let lunarStrength = 1
      let solarStrength = .46
      if (state.mode === 'real') {
        const instant = new Date(state.instant)
        const realMoon = context.astronomy.geocentricVector('Moon', instant)
        const realSun = context.astronomy.geocentricVector('Sun', instant)
        const moonDistance = Math.hypot(realMoon.x, realMoon.y, realMoon.z) * 149597870.7
        const sunDistanceAu = Math.hypot(realSun.x, realSun.y, realSun.z)
        lunarStrength = (384400 / moonDistance) ** 3
        solarStrength = .46 / sunDistanceAu ** 3
        moon.position.copy(sunAlignedVector(realMoon, realSun).normalize().multiplyScalar(3.15))
      }
      const exaggeration = parameter(state, context.definition, 'exaggeration')
      const direction = moon.position.clone().normalize()
      const solarDirection = new THREE.Vector3(-1, 0, 0)
      const positions = water.geometry.getAttribute('position') as THREE.BufferAttribute
      const normal = new THREE.Vector3()
      for (let index = 0; index < positions.count; index += 1) {
        normal.fromArray(originalWater, index * 3).normalize()
        const lunarTerm = lunarStrength * (3 * normal.dot(direction) ** 2 - 1)
        const solarTerm = solarStrength * (3 * normal.dot(solarDirection) ** 2 - 1)
        const radius = .92 * Math.max(.65, 1 + exaggeration * (lunarTerm + solarTerm) / 2)
        positions.setXYZ(index, normal.x * radius, normal.y * radius, normal.z * radius)
      }
      positions.needsUpdate = true
      water.geometry.computeVertexNormals()
      for (const [index, sign] of [1, -1].entries()) {
        lunarArrows[index]!.position.copy(direction).multiplyScalar(.93 * sign)
        lunarArrows[index]!.setDirection(direction.clone().multiplyScalar(sign))
        lunarArrows[index]!.setLength(.72 * lunarStrength)
        solarArrows[index]!.position.copy(solarDirection).multiplyScalar(.93 * sign)
        solarArrows[index]!.setDirection(solarDirection.clone().multiplyScalar(sign))
        solarArrows[index]!.setLength(.72 * solarStrength)
      }
      earth.rotation.y = -(state.mode === 'real' ? context.astronomy.localSiderealDegrees(new Date(state.instant), 0) / 360 : state.timeline * 29.53059) * Math.PI * 2
      applyLayers(root, state)
      const phase = moonPhaseFromAngle(phaseAngle)
      const alignment = Math.abs(direction.dot(solarDirection))
      return [
        { label: '月相', value: phase.name },
        { label: '潮差', value: alignment > .9 ? '大潮' : alignment < .25 ? '小潮' : '中間潮' },
        { label: '月／日引潮力', value: `${lunarStrength.toFixed(2)}／${solarStrength.toFixed(2)}` },
        { label: '隆起／箭頭', value: '誇張比例・平衡潮示意' },
        { label: '提醒', value: '非沿岸潮位預報' }
      ]
    }
  }
}
