import * as THREE from 'three'
import { degreesToRadians, moonPhaseFromAngle } from '../core/astro-math'
import { COLORS, ring, createSun, createEarth, createMoon, createArrow } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, riseSetMetrics, sunAlignedVector, type BuildContext, type SceneVisual } from './shared'
import { createPhaseDisc } from './moon-disc'

export function createMoonPhases(context: BuildContext): SceneVisual {
  const realEvents = riseSetMetrics(context.astronomy, 'Moon')
  const root = new THREE.Group()
  const earth = createEarth(.78, context.earthTextureUrl)
  root.add(earth)
  const orbit = ring(3, COLORS.orbit, .58)
  orbit.userData.layer = 'paths'
  root.add(orbit)
  const moon = createMoon(.3, context.moonTextureUrl)
  root.add(moon)
  addLabel(root, '地球', new THREE.Vector3(0, 1.05, 0), '#55d9d0', .28)
  const moonLabel = addLabel(root, '月球', new THREE.Vector3(), '#eef7f5', .24)
  const sun = createSun(.55)
  sun.position.set(-6.2, 0, 0)
  root.add(sun)
  const sunlight = createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-5.4, 1.1, 0), 2.4, COLORS.amber)
  sunlight.userData.layer = 'shadows'
  root.add(sunlight)
  addLabel(root, '太陽光', new THREE.Vector3(-4.25, 1.5, 0), '#f7b955', .28)
  const phaseDisc = createPhaseDisc(context.moonTextureUrl)
  const faceMarker = createArrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), .65, COLORS.cyan)
  faceMarker.userData.layer = 'paths'
  root.add(faceMarker)

  return {
    root,
    overlay: phaseDisc.element,
    dispose: () => phaseDisc.dispose(),
    cameraScale: (state) => parameter(state, context.definition, 'scaleMode') === 1 ? 1.55 : 1,
    cameras: [
      { id: 'top', label: '太空俯視', position: new THREE.Vector3(-1.65, 13.5, .01), target: new THREE.Vector3(-1.65, 0, 0) },
      { id: 'angled', label: '斜視', position: new THREE.Vector3(7.8, 7, 9.5), target: new THREE.Vector3(-1.4, .4, 0) },
      { id: 'earth', label: '地球旁', position: new THREE.Vector3(1.4, 1.2, 5.5), target: new THREE.Vector3(0, 0, 0) }
    ],
    update(state) {
      const phaseAngle = state.mode === 'real' ? context.astronomy.moonPhaseAngle(new Date(state.instant)) : state.timeline * 360
      const inclination = degreesToRadians(state.mode === 'real' ? 5.145 : parameter(state, context.definition, 'inclination'))
      const angle = degreesToRadians(phaseAngle)
      const trueScale = parameter(state, context.definition, 'scaleMode') === 1
      const earthRadius = trueScale ? .08 : .78
      const physicalMoon = state.mode === 'real' ? context.astronomy.geocentricVector('Moon', new Date(state.instant)) : undefined
      const distanceKm = physicalMoon ? Math.hypot(physicalMoon.x, physicalMoon.y, physicalMoon.z) * 149597870.7 : 384400
      const orbitRadius = trueScale ? earthRadius * distanceKm / 6378.137 : 3
      earth.scale.setScalar(earthRadius / .78)
      moon.scale.setScalar(trueScale ? earthRadius * 1737.4 / 6378.137 / .3 : 1)
      orbit.scale.setScalar(orbitRadius / 3)
      orbit.rotation.x = -inclination
      moon.position.set(-Math.cos(angle) * orbitRadius, Math.sin(angle) * Math.sin(inclination) * orbitRadius, Math.sin(angle) * Math.cos(inclination) * orbitRadius)
      if (state.mode === 'real') {
        const instant = new Date(state.instant)
        moon.position.copy(sunAlignedVector(physicalMoon!, context.astronomy.geocentricVector('Sun', instant)).normalize().multiplyScalar(orbitRadius))
      }
      moon.lookAt(earth.position)
      moonLabel.position.copy(moon.position).add(new THREE.Vector3(0, trueScale ? .22 : .55, 0))
      faceMarker.position.copy(moon.position)
      faceMarker.setDirection(earth.position.clone().sub(moon.position).normalize())
      faceMarker.setLength(trueScale ? .18 : .65)
      earth.rotation.y = -(state.mode === 'real' ? context.astronomy.localSiderealDegrees(new Date(state.instant), 0) / 360 : state.timeline * 29.53059) * Math.PI * 2
      const illumination = state.mode === 'real' ? context.astronomy.moonIlluminationFraction(new Date(state.instant)) : moonPhaseFromAngle(phaseAngle).illumination
      const discPhase = Math.acos(1 - 2 * illumination) * 180 / Math.PI
      const phase = moonPhaseFromAngle(phaseAngle)
      phaseDisc.update(phaseAngle <= 180 ? discPhase : 360 - discPhase, phase.name, illumination)
      applyLayers(root, state)
      const riseMinutes = Math.round(((6 + phaseAngle / 15) % 24) * 60) % 1440
      const riseLabel = `${String(Math.floor(riseMinutes / 60)).padStart(2, '0')}:${String(riseMinutes % 60).padStart(2, '0')}`
      return [
        { label: '月相', value: phase.name },
        { label: '照亮比例', value: `${Math.round(illumination * 100)}%` },
        { label: '月相角・黃經差', value: `${phaseAngle.toFixed(1)}°` },
        { label: '地月距離', value: `${Math.round(distanceKm).toLocaleString()} km` },
        { label: '朔望月／同步自轉', value: '29.53／27.32 天' },
        { label: '比例', value: trueScale ? '地月等比例・太陽仍示意' : '教學非等比例' },
        ...(state.mode === 'real' ? realEvents(state) : [{ label: '約略月升（太陽時）', value: riseLabel }, { label: '約略月落（太陽時）', value: `${String((Math.floor(riseMinutes / 60) + 12) % 24).padStart(2, '0')}:${String(riseMinutes % 60).padStart(2, '0')}` }])
      ]
    }
  }
}
