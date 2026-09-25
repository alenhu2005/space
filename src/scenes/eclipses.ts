import * as THREE from 'three'
import { classifySolarShadow, classifyLunarShadow, computeShadowGeometry, shadowRadius, teachingOrbitPosition, type ShadowGeometry } from '../core/geometry'
import { teachingLunarShadow } from '../core/observer-eclipse'
import { degreesToRadians, radiansToDegrees, moonPhaseFromAngle } from '../core/astro-math'
import { earthTextureSurfaceDirection, teachingEarthRotation, teachingEclipseSolarTime } from '../core/moon-observer'
import { COLORS, createSun, createEarth, createMoon, createArrow, createConeBetween, updateConeBetween, lineFromPoints } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, sunAlignedVector, type BuildContext, type SceneVisual } from './shared'
import { createPhaseDisc } from './moon-disc'

const AU_KM = 149597870.7
const EARTH_RADIUS = 6378.137
const MOON_RADIUS = 1737.4
const SUN_RADIUS = 695700
const NAMES = { miss: '無食象', total: '全食', partial: '偏食', annular: '環食', penumbral: '半影月食' } as const

function orbitPosition(longitude: number, inclination: number, node: number, radius: number): THREE.Vector3 {
  const position = teachingOrbitPosition(longitude, inclination, node, radius)
  return new THREE.Vector3(position.x, position.y, position.z)
}

export function createEclipses(context: BuildContext): SceneVisual {
  const root = new THREE.Group()
  const sun = createSun(.72)
  sun.position.set(-5.6, 0, 0)
  const earth = createEarth(.66, context.earthTextureUrl)
  earth.position.set(1.8, 0, 0)
  const moon = createMoon(.25, context.moonTextureUrl)
  root.add(sun, earth, moon)
  const observerMarker = new THREE.Mesh(new THREE.SphereGeometry(.06, 16, 12), new THREE.MeshBasicMaterial({ color: COLORS.cyan }))
  observerMarker.userData.layer = 'labels'
  earth.add(observerMarker)
  const observerPointer = createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), .24, COLORS.cyan)
  observerPointer.userData.layer = 'labels'
  earth.add(observerPointer)
  const observerLabel = addLabel(root, '觀測者', new THREE.Vector3(), '#55d9d0', .2)
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
  const umbra = makeCone(0x6352a5, .32)
  const antumbra = makeCone(COLORS.red, .2)
  const penumbra = makeCone(COLORS.amber, .1)
  addLabel(root, '太陽', new THREE.Vector3(-5.6, 1.2, 0), '#f7b955', .3)
  addLabel(root, '地球', new THREE.Vector3(1.8, .95, 0), '#55d9d0', .28)
  const moonLabel = addLabel(root, '月球', new THREE.Vector3(), '#eef7f5', .24)
  const overlay = document.createElement('div')
  overlay.className = 'scene-inset'
  overlay.id = 'scene-inset-overlay'
  const inset = document.createElement('canvas')
  inset.width = 160
  inset.height = 160
  inset.setAttribute('aria-label', '日月食影錐截面或選定位置所見的日月圓盤')
  const caption = document.createElement('p')
  const convention = document.createElement('span')
  const surfaceViewNote = document.createElement('p')
  surfaceViewNote.className = 'surface-view-note'
  surfaceViewNote.hidden = true
  const phenomenonCaption = document.createElement('p')
  phenomenonCaption.className = 'phenomenon-caption'
  const legend = document.createElement('div')
  legend.className = 'shadow-legend'
  legend.innerHTML = '<span><i class="umbra-key"></i>本影</span><span><i></i>半影</span><span class="antumbra-legend"><i class="antumbra-key"></i>偽本影</span>'
  overlay.append(inset, caption, convention, surfaceViewNote, phenomenonCaption, legend)
  const draw = inset.getContext('2d')
  let cachedOrbit = ''
  let lastInsetKey = ''
  let lunarSurface: { state: Parameters<SceneVisual['update']>[0]; shadow: ShadowGeometry; phaseAngle: number } | undefined
  const moonDisc = createPhaseDisc(context.moonTextureUrl, () => {
    if (lunarSurface) drawLunarSurface(lunarSurface.state, lunarSurface.shadow, lunarSurface.phaseAngle)
  })
  const cameras = [
    { id: 'side', label: '太空影錐', position: new THREE.Vector3(-.8, 4.5, 14), target: new THREE.Vector3(-.8, 0, 0) },
    { id: 'moon', label: '月球附近', position: new THREE.Vector3(.35, .55, 1.25), target: new THREE.Vector3(1.8, 0, 0) },
    { id: 'surface', label: '地表附近', position: new THREE.Vector3(1.12, .04, 0), target: new THREE.Vector3(-5.6, 0, 0) },
    { id: 'lunar-disc', label: '月面特寫', preserveOrbit: true, position: new THREE.Vector3(0, .5, 1.7), target: new THREE.Vector3() }
  ]

  function realEarthOrientation(instant: Date, sunVector: { readonly x: number; readonly y: number }): THREE.Quaternion {
    const surfaceDirection = (latitude: number, longitude: number) => sunAlignedVector(
      context.astronomy.observerVector(instant, { latitude, longitude, elevation: 0 }), sunVector
    ).normalize()
    const north = surfaceDirection(90, 0)
    const meridian = surfaceDirection(0, 0)
    meridian.addScaledVector(north, -meridian.dot(north)).normalize()
    const east = meridian.clone().cross(north).normalize()
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(meridian, north, east))
  }

  function drawSection(shadow: ShadowGeometry, solar: boolean): void {
    if (!draw) return
    const key = `section-${solar}-${shadow.targetRadiusKm.toFixed(3)}-${shadow.axisOffsetKm.toFixed(3)}-${shadow.penumbraRadiusKm.toFixed(3)}-${shadow.umbraRadiusKm.toFixed(3)}`
    if (key === lastInsetKey) return
    lastInsetKey = key
    draw.clearRect(0, 0, 160, 160)
    const scale = 65 / Math.max(shadow.targetRadiusKm, shadow.penumbraRadiusKm + shadow.axisOffsetKm)
    const disk = (x: number, radius: number, color: string) => {
      draw.fillStyle = color
      draw.beginPath()
      draw.arc(x, 80, Math.max(.4, radius * scale), 0, Math.PI * 2)
      draw.fill()
    }
    disk(80, shadow.targetRadiusKm, solar ? '#4284ad' : '#c6c9c4')
    disk(80 + shadow.axisOffsetKm * scale, shadow.penumbraRadiusKm, '#f7b95544')
    disk(80 + shadow.axisOffsetKm * scale, Math.abs(shadow.umbraRadiusKm), shadow.umbraRadiusKm < 0 ? '#f2766b99' : '#6352a5bb')
    caption.textContent = solar ? '地球・影錐截面' : '月球・影錐截面'
    convention.textContent = '截面等比例・影區以顏色標示'
  }

  function drawLocal(state: Parameters<SceneVisual['update']>[0]): void {
    if (!draw) return
    const key = `local-${state.instant}-${state.observer.latitude}-${state.observer.longitude}`
    if (key === lastInsetKey) return
    lastInsetKey = key
    const instant = new Date(state.instant)
    const sunPosition = context.astronomy.horizontalPosition('Sun', instant, state.observer)
    const moonPosition = context.astronomy.horizontalPosition('Moon', instant, state.observer)
    const sourceRadius = radiansToDegrees(Math.asin(SUN_RADIUS / (sunPosition.distanceAu * AU_KM)))
    const blockerRadius = radiansToDegrees(Math.asin(MOON_RADIUS / (moonPosition.distanceAu * AU_KM)))
    const deltaAzimuth = ((moonPosition.azimuth - sunPosition.azimuth + 540) % 360 - 180) * Math.cos(degreesToRadians(sunPosition.altitude))
    const deltaAltitude = moonPosition.altitude - sunPosition.altitude
    draw.clearRect(0, 0, 160, 160)
    caption.textContent = sunPosition.altitude > 0 ? '所在地・太陽所見' : '太陽在地平線下'
    convention.textContent = '相對角徑・天頂向上'
    if (sunPosition.altitude <= 0) return
    draw.fillStyle = '#f7b955'
    draw.beginPath()
    draw.arc(80, 80, 40, 0, Math.PI * 2)
    draw.fill()
    draw.fillStyle = '#020406'
    draw.beginPath()
    draw.arc(80 + deltaAzimuth / sourceRadius * 40, 80 - deltaAltitude / sourceRadius * 40, blockerRadius / sourceRadius * 40, 0, Math.PI * 2)
    draw.fill()
  }

  function drawLunarSurface(state: Parameters<SceneVisual['update']>[0], shadow: ShadowGeometry, phaseAngle: number): void {
    if (!draw) return
    const instant = new Date(state.instant)
    const fraction = state.mode === 'real' ? context.astronomy.moonIlluminationFraction(instant) : moonPhaseFromAngle(phaseAngle).illumination
    const discAngle = radiansToDegrees(Math.acos(1 - 2 * fraction))
    moonDisc.update(phaseAngle <= 180 ? discAngle : 360 - discAngle, '月球', fraction)
    const key = `lunar-surface-${state.instant}-${state.observer.latitude}-${state.observer.longitude}-${state.layers.shadows}-${moonDisc.revision}-${shadow.axisOffsetKm.toFixed(3)}-${shadow.umbraRadiusKm.toFixed(3)}-${shadow.penumbraRadiusKm.toFixed(3)}`
    if (key === lastInsetKey) return
    lastInsetKey = key
    draw.clearRect(0, 0, 160, 160)
    const aboveHorizon = state.mode === 'teaching' || context.astronomy.horizontalPosition('Moon', instant, state.observer).altitude > 0
    caption.textContent = state.mode === 'teaching' ? '地球夜側・所見月面'
      : aboveHorizon ? '所在地・所見月面' : '月球在地平線下'
    convention.textContent = '月面亮暗示意・忽略大氣'
    if (!aboveHorizon) return
    draw.save()
    draw.beginPath()
    draw.arc(80, 80, 60, 0, Math.PI * 2)
    draw.clip()
    const discSize = 60 * 256 / 112
    draw.drawImage(moonDisc.canvas, 80 - discSize / 2, 80 - discSize / 2, discSize, discSize)
    const scale = 60 / shadow.targetRadiusKm
    const shadowDisc = (radius: number, color: string): void => {
      if (shadow.axialDistanceKm <= 0 || radius <= 0) return
      draw.fillStyle = color
      draw.beginPath()
      draw.arc(80 + shadow.axisOffsetKm * scale, 80, radius * scale, 0, Math.PI * 2)
      draw.fill()
    }
    if (state.layers.shadows) {
      shadowDisc(shadow.penumbraRadiusKm, '#11182555')
      shadowDisc(shadow.umbraRadiusKm, '#0b0b1bcc')
    }
    draw.restore()
  }

  return {
    root, overlay,
    cameras,
    trackingCameraIds: ['surface', 'moon', 'lunar-disc'],
    dispose: () => moonDisc.dispose(),
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
      let realSunVector: { readonly x: number; readonly y: number } | undefined
      moon.position.copy(orbitPosition(phase, inclination, node, distance)).add(earth.position)
      moon.scale.setScalar(moonRadius / .25)
      if (real) {
        const realSun = context.astronomy.geocentricVector('Sun', instant)
        realSunVector = realSun
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
      earth.quaternion.copy(realSunVector
        ? realEarthOrientation(instant, realSunVector)
        : new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          teachingEarthRotation(state.observer.longitude, teachingEclipseSolarTime(
            parameter(state, context.definition, 'observerSolarHour'), state.timeline, parameter(state, context.definition, 'eclipseType')
          ))
        ))
      const surface = earthTextureSurfaceDirection(
        real ? state.observer.latitude : parameter(state, context.definition, 'observerLatitude'),
        state.observer.longitude
      )
      const localObserver = new THREE.Vector3(surface.x, surface.y, surface.z)
      observerMarker.position.copy(localObserver).multiplyScalar(.71)
      observerPointer.position.copy(localObserver).multiplyScalar(.75)
      observerPointer.setDirection(localObserver)
      observerPointer.setLength(.24, .075, .04)
      observerLabel.position.copy(localObserver.applyQuaternion(earth.quaternion)).multiplyScalar(1.08).add(earth.position)
      const shadow = !real && !solar
        ? teachingLunarShadow(phaseAngle, parameter(state, context.definition, 'nodeOffset'), parameter(state, context.definition, 'inclination'))
        : computeShadowGeometry({ source, blocker, target, sourceRadius, blockerRadius, targetRadius })
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
      const surfaceDirection = (solar ? sun : moon).position.clone().sub(earth.position).normalize()
      cameras[2]!.position.copy(earth.position).addScaledVector(surfaceDirection, .7)
      cameras[2]!.target.copy((solar ? sun : moon).position)
      cameras[3]!.position.copy(moon.position).add(new THREE.Vector3(0, .5, 1.7))
      cameras[3]!.target.copy(moon.position)
      moon.lookAt(earth.position)
      moonLabel.position.copy(moon.position).add(new THREE.Vector3(0, .55, 0))
      applyLayers(root, state)
      antumbra.visible = state.layers.shadows && endDistance > shadow.apexDistanceKm
      shadowGroup.visible = state.cameraPreset !== 'surface' && (!real || nearAlignment)
      orbit.visible = state.layers.paths && (!real || !nearAlignment)
      ascending.visible = descending.visible = state.layers.labels && (!real || !nearAlignment)
      ascending.userData.modeHidden = descending.userData.modeHidden = real && nearAlignment
      const classification = solar ? classifySolarShadow(shadow) : classifyLunarShadow(shadow)
      const moonMaterial = moon.material as THREE.MeshStandardMaterial
      // A subdued, texture-mapped teaching fill keeps the eclipsed lunar disc legible.
      moonMaterial.emissive.setHex(!solar && classification !== 'miss' ? 0x354057 : 0x000000)
      moonMaterial.emissiveIntensity = .6
      surfaceViewNote.hidden = !real || state.cameraPreset !== 'surface'
      surfaceViewNote.textContent = `${solar ? '日下點' : '月下點'} 3D 示意・非選定所在地`
      lunarSurface = state.cameraPreset === 'surface' && !solar ? { state, shadow, phaseAngle } : undefined
      if (lunarSurface) drawLunarSurface(state, shadow, phaseAngle)
      else if (real && state.cameraPreset === 'surface' && solar) drawLocal(state)
      else drawSection(shadow, solar)
      const phenomenon = classification === 'miss' ? '無食象・未對齊交點' : NAMES[classification] + (solar ? '（全球某處）' : '（地球夜側）')
      phenomenonCaption.textContent = `${solar ? '日食' : '月食'}：${classification === 'miss' ? '未形成食象' : NAMES[classification]}`
      legend.hidden = !state.layers.shadows
      legend.querySelector<HTMLElement>('.antumbra-legend')!.hidden = shadow.umbraRadiusKm >= 0
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
