import * as THREE from 'three'
import { classifySolarShadow, classifyLunarShadow, computeShadowGeometry, shadowRadius, type ShadowGeometry } from '../core/geometry'
import { degreesToRadians, radiansToDegrees } from '../core/astro-math'
import { COLORS, createSun, createEarth, createMoon, createConeBetween, updateConeBetween, lineFromPoints } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, sunAlignedVector, type BuildContext, type SceneVisual } from './shared'

const AU_KM = 149597870.7
const EARTH_RADIUS = 6378.137
const MOON_RADIUS = 1737.4
const SUN_RADIUS = 695700
const NAMES = { miss: '無食象', total: '全食', partial: '偏食', annular: '環食', penumbral: '半影月食' } as const

function orbitPosition(longitude: number, inclination: number, node: number, radius: number): THREE.Vector3 {
  const latitude = Math.atan(Math.tan(inclination) * Math.sin(longitude - node))
  return new THREE.Vector3(-Math.cos(longitude) * Math.cos(latitude), Math.sin(latitude), Math.sin(longitude) * Math.cos(latitude)).multiplyScalar(radius)
}

export function createEclipses(context: BuildContext): SceneVisual {
  const root = new THREE.Group()
  const sun = createSun(.72)
  sun.position.set(-5.6, 0, 0)
  const earth = createEarth(.66, context.earthTextureUrl)
  earth.position.set(1.8, 0, 0)
  const moon = createMoon(.25, context.moonTextureUrl)
  root.add(sun, earth, moon)
  const orbit = lineFromPoints([], COLORS.cyan, .45)
  orbit.userData.layer = 'paths'
  root.add(orbit)
  const ascending = addLabel(root, '升交點', new THREE.Vector3(), '#55d9d0', .26)
  const descending = addLabel(root, '降交點', new THREE.Vector3(), '#55d9d0', .26)
  const shadowGroup = new THREE.Group()
  root.add(shadowGroup)
  const makeCone = (color: number, opacity: number): THREE.Mesh => {
    const mesh = createConeBetween(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 1, 1, color, opacity)
    shadowGroup.add(mesh)
    return mesh
  }
  const umbra = makeCone(0x050506, .72)
  const antumbra = makeCone(COLORS.red, .2)
  const penumbra = makeCone(COLORS.muted, .11)
  addLabel(root, '太陽', new THREE.Vector3(-5.6, 1.2, 0), '#f7b955', .3)
  const overlay = document.createElement('div')
  overlay.className = 'scene-inset'
  const inset = document.createElement('canvas')
  inset.width = 160
  inset.height = 160
  inset.setAttribute('aria-label', '日月食影錐截面或選定位置所見的日月圓盤')
  const caption = document.createElement('p')
  const convention = document.createElement('span')
  overlay.append(inset, caption, convention)
  const draw = inset.getContext('2d')
  let cachedOrbit = ''
  const cameras = [
    { id: 'side', label: '太空影錐', position: new THREE.Vector3(-.8, 4.5, 14), target: new THREE.Vector3(-.8, 0, 0) },
    { id: 'moon', label: '月球附近', position: new THREE.Vector3(.35, .55, 1.25), target: new THREE.Vector3(1.8, 0, 0) },
    { id: 'surface', label: '地表附近', position: new THREE.Vector3(1.12, .04, 0), target: new THREE.Vector3(-5.6, 0, 0) }
  ]

  function drawSection(shadow: ShadowGeometry, solar: boolean): void {
    if (!draw) return
    draw.clearRect(0, 0, 160, 160)
    const scale = 65 / Math.max(shadow.targetRadiusKm, shadow.penumbraRadiusKm + shadow.axisOffsetKm)
    const disk = (x: number, radius: number, color: string) => {
      draw.fillStyle = color
      draw.beginPath()
      draw.arc(x, 80, Math.max(.4, radius * scale), 0, Math.PI * 2)
      draw.fill()
    }
    disk(80, shadow.targetRadiusKm, solar ? '#4284ad' : '#c6c9c4')
    disk(80 + shadow.axisOffsetKm * scale, shadow.penumbraRadiusKm, '#6d768177')
    disk(80 + shadow.axisOffsetKm * scale, Math.abs(shadow.umbraRadiusKm), shadow.umbraRadiusKm < 0 ? '#f2766b99' : '#070b0ecc')
    caption.textContent = solar ? '地球・影錐截面' : '月球・影錐截面'
    convention.textContent = '截面比例一致・忽略大氣'
  }

  function drawLocal(state: Parameters<SceneVisual['update']>[0]): void {
    if (!draw) return
    const instant = new Date(state.instant)
    const sunPosition = context.astronomy.horizontalPosition('Sun', instant, state.observer)
    const moonPosition = context.astronomy.horizontalPosition('Moon', instant, state.observer)
    const sourceRadius = radiansToDegrees(Math.asin(SUN_RADIUS / (sunPosition.distanceAu * AU_KM)))
    const blockerRadius = radiansToDegrees(Math.asin(MOON_RADIUS / (moonPosition.distanceAu * AU_KM)))
    const deltaAzimuth = ((moonPosition.azimuth - sunPosition.azimuth + 540) % 360 - 180) * Math.cos(degreesToRadians(sunPosition.altitude))
    const deltaAltitude = moonPosition.altitude - sunPosition.altitude
    draw.clearRect(0, 0, 160, 160)
    draw.fillStyle = '#f7b955'
    draw.beginPath()
    draw.arc(80, 80, 40, 0, Math.PI * 2)
    draw.fill()
    draw.fillStyle = '#020406'
    draw.beginPath()
    draw.arc(80 + deltaAzimuth / sourceRadius * 40, 80 - deltaAltitude / sourceRadius * 40, blockerRadius / sourceRadius * 40, 0, Math.PI * 2)
    draw.fill()
    caption.textContent = sunPosition.altitude > 0 ? '所在地・太陽所見' : '太陽在地平線下'
    convention.textContent = '相對角徑・天頂向上'
  }

  return {
    root, overlay,
    cameras,
    update(state) {
      const instant = new Date(state.instant)
      const real = state.mode === 'real'
      const phaseAngle = real ? context.astronomy.moonPhaseAngle(instant) : state.timeline * 360
      const phase = degreesToRadians(phaseAngle)
      const solar = Math.cos(phase) > 0
      const inclination = degreesToRadians(real ? 5.145 : parameter(state, context.definition, 'inclination'))
      const node = degreesToRadians(parameter(state, context.definition, 'nodeOffset'))
      const annular = !real && parameter(state, context.definition, 'eclipseType') === 2
      const distance = annular ? 3 : 1.6
      const moonRadius = annular ? .195 : .25
      const nearAlignment = Math.abs(Math.cos(phase)) > .985
      let source = sun.position.clone()
      let blocker: THREE.Vector3
      let target: THREE.Vector3
      let sourceRadius = .72
      let blockerRadius = solar ? moonRadius : .66
      let targetRadius = solar ? .66 : moonRadius
      let mapPosition = (vector: THREE.Vector3) => vector.clone()
      let radiusScale = 1
      let latitude = radiansToDegrees(Math.atan(Math.tan(inclination) * Math.sin(phase - node)))
      let realFirst: THREE.Vector3 | undefined
      let realSecond: THREE.Vector3 | undefined
      let realNode: THREE.Vector3 | undefined
      moon.position.copy(orbitPosition(phase, inclination, node, distance)).add(earth.position)
      moon.scale.setScalar(moonRadius / .25)
      if (real) {
        const realSun = context.astronomy.geocentricVector('Sun', instant)
        const realMoon = context.astronomy.geocentricVector('Moon', instant)
        source = sunAlignedVector(realSun, realSun).multiplyScalar(AU_KM)
        const physicalMoon = sunAlignedVector(realMoon, realSun).multiplyScalar(AU_KM)
        const moonDistance = physicalMoon.length()
        realFirst = physicalMoon.clone().normalize()
        const tomorrow = context.astronomy.geocentricVector('Moon', new Date(instant.getTime() + 86400000))
        const normal = realFirst.clone().cross(sunAlignedVector(tomorrow, realSun).normalize()).normalize()
        realSecond = normal.clone().cross(realFirst).normalize()
        realNode = new THREE.Vector3(normal.z, 0, -normal.x).normalize()
        if (normal.clone().cross(realNode).y < 0) realNode.negate()
        latitude = context.astronomy.moonEclipticLatitude(instant)
        radiusScale = .66 / EARTH_RADIUS
        mapPosition = (vector) => new THREE.Vector3(vector.x * distance / moonDistance, vector.y * radiusScale, vector.z * radiusScale).add(earth.position)
        moon.position.copy(nearAlignment ? mapPosition(physicalMoon) : physicalMoon.clone().normalize().multiplyScalar(distance).add(earth.position))
        moon.scale.setScalar(MOON_RADIUS * radiusScale / .25)
        sourceRadius = SUN_RADIUS
        blockerRadius = solar ? MOON_RADIUS : EARTH_RADIUS
        targetRadius = solar ? EARTH_RADIUS : MOON_RADIUS
        blocker = solar ? physicalMoon : new THREE.Vector3()
        target = solar ? new THREE.Vector3() : physicalMoon
      } else {
        blocker = (solar ? moon : earth).position.clone()
        target = (solar ? earth : moon).position.clone()
      }
      const shadow = computeShadowGeometry({ source, blocker, target, sourceRadius, blockerRadius, targetRadius })
      const axis = new THREE.Vector3(shadow.axis.x, shadow.axis.y, shadow.axis.z)
      const endDistance = Math.max(targetRadius * 2, shadow.axialDistanceKm + targetRadius * 1.6)
      const at = (behind: number) => mapPosition(blocker.clone().addScaledVector(axis, behind))
      const apexDistance = Math.min(endDistance, shadow.apexDistanceKm)
      updateConeBetween(umbra, at(0), at(apexDistance), blockerRadius * radiusScale, Math.max(.0001, shadowRadius(sourceRadius, blockerRadius, shadow.separationKm, apexDistance, false) * radiusScale))
      updateConeBetween(antumbra, at(apexDistance), at(endDistance + .0001), .0001, Math.abs(shadowRadius(sourceRadius, blockerRadius, shadow.separationKm, endDistance, false)) * radiusScale)
      updateConeBetween(penumbra, at(0), at(endDistance), blockerRadius * radiusScale, shadowRadius(sourceRadius, blockerRadius, shadow.separationKm, endDistance, true) * radiusScale)
      const orbitKey = real ? 'real-' + instant.toISOString().slice(0, 13) : [inclination, node, distance].join('-')
      if (cachedOrbit !== orbitKey) {
        const points = Array.from({ length: 181 }, (_, index) => {
          const angle = index / 180 * Math.PI * 2
          return realFirst && realSecond ? realFirst.clone().multiplyScalar(Math.cos(angle) * distance).addScaledVector(realSecond, Math.sin(angle) * distance).add(earth.position) : orbitPosition(angle, inclination, node, distance).add(earth.position)
        })
        orbit.geometry.dispose()
        orbit.geometry = new THREE.BufferGeometry().setFromPoints(points)
        cachedOrbit = orbitKey
      }
      ascending.position.copy(orbitPosition(node, inclination, node, distance)).add(earth.position).add(new THREE.Vector3(0, .22, 0))
      descending.position.copy(orbitPosition(node + Math.PI, inclination, node, distance)).add(earth.position).add(new THREE.Vector3(0, .22, 0))
      if (realNode) {
        ascending.position.copy(realNode).multiplyScalar(distance).add(earth.position).add(new THREE.Vector3(0, .22, 0))
        descending.position.copy(realNode).multiplyScalar(-distance).add(earth.position).add(new THREE.Vector3(0, .22, 0))
      }
      cameras[1]!.position.copy(moon.position).add(new THREE.Vector3(.55, .55, 1.4))
      moon.lookAt(earth.position)
      applyLayers(root, state)
      antumbra.visible = state.layers.shadows && endDistance > shadow.apexDistanceKm
      shadowGroup.visible = !real || nearAlignment
      orbit.visible = state.layers.paths && (!real || !nearAlignment)
      ascending.visible = descending.visible = state.layers.labels && (!real || !nearAlignment)
      ascending.userData.modeHidden = descending.userData.modeHidden = real && nearAlignment
      const classification = solar ? classifySolarShadow(shadow) : classifyLunarShadow(shadow)
      if (real && state.cameraPreset === 'surface' && solar) drawLocal(state)
      else drawSection(shadow, solar)
      const phenomenon = classification === 'miss' ? '無食象・未對齊交點' : NAMES[classification] + (solar ? '（全球某處）' : '（地球夜側）')
      return [
        { label: '現象・直線光影', value: phenomenon },
        { label: real ? '實際軌道傾角' : '教學軌道傾角', value: radiansToDegrees(inclination).toFixed(1) + '°' },
        { label: '月球黃道緯度', value: latitude.toFixed(1) + '°' },
        { label: real ? '影軸偏距' : '影軸偏距・示意', value: shadow.axisOffsetKm.toFixed(real ? 0 : 2) + (real ? ' km' : ' 單位') },
        { label: '本影半徑・負值為偽本影', value: shadow.umbraRadiusKm.toFixed(real ? 0 : 2) + (real ? ' km' : ' 單位') },
        { label: '比例約定', value: real ? '食象附近縱向距離壓縮・截面等比例' : '天體與傾角放大・非等比例' }
      ]
    }
  }
}
