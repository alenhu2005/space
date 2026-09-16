import * as THREE from 'three'
import { degreesToRadians, moonPhaseFromAngle } from '../core/astro-math'
import type { SimulationState } from '../core/types'
import {
  formatObserverCoordinates,
  formatObserverEventTime,
  formatObserverTime,
  formatSolarHour,
  observerTimeZone,
  teachingEarthRotation,
  teachingObserverDirection,
  teachingMoonEvents,
  teachingSolarTime
} from '../core/moon-observer'
import { COLORS, ring, createSun, createEarth, createMoon, createArrow } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, sunAlignedVector, type BuildContext, type SceneVisual } from './shared'
import { createPhaseDisc } from './moon-disc'

export function createMoonPhases(context: BuildContext): SceneVisual {
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
  const observerLocation = document.createElement('span')
  observerLocation.className = 'observer-location'
  const observerTime = document.createElement('span')
  observerTime.className = 'observer-time'
  const observerZoneNote = document.createElement('span')
  observerZoneNote.className = 'observer-zone-note'
  const observerEvents = document.createElement('div')
  observerEvents.className = 'observer-events'
  observerEvents.setAttribute('aria-label', '月升、中天與月落時間')
  observerEvents.innerHTML = `
    <span class="observer-event-rise"><b>月升</b><time></time></span>
    <span class="observer-event-transit"><b>中天</b><time></time></span>
    <span class="observer-event-set"><b>月落</b><time></time></span>`
  const riseTime = observerEvents.querySelector<HTMLTimeElement>('.observer-event-rise time')!
  const transitTime = observerEvents.querySelector<HTMLTimeElement>('.observer-event-transit time')!
  const setTime = observerEvents.querySelector<HTMLTimeElement>('.observer-event-set time')!
  phaseDisc.element.append(observerLocation, observerTime, observerEvents, observerZoneNote)
  const faceMarker = createArrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), .65, COLORS.cyan)
  faceMarker.userData.layer = 'paths'
  root.add(faceMarker)
  const observerMarker = new THREE.Mesh(
    new THREE.SphereGeometry(.065, 16, 12),
    new THREE.MeshBasicMaterial({ color: COLORS.cyan })
  )
  observerMarker.userData.layer = 'labels'
  root.add(observerMarker)
  const observerPointer = createArrow(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), .22, COLORS.cyan)
  observerPointer.userData.layer = 'labels'
  root.add(observerPointer)
  const observerLabel = addLabel(root, '觀測者', new THREE.Vector3(), '#55d9d0', .23)
  const observerScaleLabel = addLabel(root, '觀測者標記放大示意', new THREE.Vector3(), '#55d9d0', .17)
  const earthAxis = new THREE.Vector3(0, 1, 0)
  const moonCamera = {
    id: 'moon', label: '月球特寫', preserveOrbit: true,
    position: new THREE.Vector3(), target: new THREE.Vector3()
  }
  let realEventKey = ''
  let realEventSchedule = { rise: '', transit: '', set: '' }

  function realEarthOrientation(instant: Date, sunVector: { readonly x: number; readonly y: number }): THREE.Quaternion {
    const surfaceDirection = (latitude: number, longitude: number) => sunAlignedVector(
      context.astronomy.observerVector(instant, { latitude, longitude, elevation: 0 }), sunVector
    ).normalize()
    const north = surfaceDirection(90, 0)
    const primeMeridian = surfaceDirection(0, 0)
    primeMeridian.addScaledVector(north, -primeMeridian.dot(north)).normalize()
    const east = primeMeridian.clone().cross(north).normalize()
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(primeMeridian, north, east))
  }

  function realEventsFor(state: SimulationState, zone: string): typeof realEventSchedule {
    const key = `${state.instant.slice(0, 13)}-${state.observer.latitude}-${state.observer.longitude}-${zone}`
    if (key !== realEventKey) {
      const events = context.astronomy.riseSet('Moon', new Date(state.instant), state.observer)
      realEventSchedule = {
        rise: formatObserverEventTime(events.rise, zone),
        transit: formatObserverEventTime(events.transit, zone),
        set: formatObserverEventTime(events.set, zone)
      }
      realEventKey = key
    }
    return realEventSchedule
  }

  return {
    root,
    overlay: phaseDisc.element,
    dispose: () => phaseDisc.dispose(),
    trackingCameraIds: ['moon'],
    cameraScale: (state) => parameter(state, context.definition, 'scaleMode') === 1 ? 1.55 : 1,
    cameras: [
      { id: 'top', label: '太空俯視', position: new THREE.Vector3(-1.65, 13.5, .01), target: new THREE.Vector3(-1.65, 0, 0) },
      { id: 'angled', label: '斜視', position: new THREE.Vector3(7.8, 7, 9.5), target: new THREE.Vector3(-1.4, .4, 0) },
      { id: 'earth', label: '地球旁', position: new THREE.Vector3(1.4, 1.2, 5.5), target: new THREE.Vector3(0, 0, 0) },
      moonCamera
    ],
    update(state) {
      const instant = new Date(state.instant)
      const phaseAngle = state.mode === 'real' ? context.astronomy.moonPhaseAngle(instant) : state.timeline * 360
      const inclination = degreesToRadians(state.mode === 'real' ? 5.145 : parameter(state, context.definition, 'inclination'))
      const angle = degreesToRadians(phaseAngle)
      const trueScale = parameter(state, context.definition, 'scaleMode') === 1
      const earthRadius = trueScale ? .08 : .78
      const physicalMoon = state.mode === 'real' ? context.astronomy.geocentricVector('Moon', instant) : undefined
      const physicalSun = state.mode === 'real' ? context.astronomy.geocentricVector('Sun', instant) : undefined
      const distanceKm = physicalMoon ? Math.hypot(physicalMoon.x, physicalMoon.y, physicalMoon.z) * 149597870.7 : 384400
      const orbitRadius = trueScale ? earthRadius * distanceKm / 6378.137 : 3
      earth.scale.setScalar(earthRadius / .78)
      moon.scale.setScalar(trueScale ? earthRadius * 1737.4 / 6378.137 / .3 : 1)
      orbit.scale.setScalar(orbitRadius / 3)
      orbit.rotation.x = -inclination
      moon.position.set(-Math.cos(angle) * orbitRadius, Math.sin(angle) * Math.sin(inclination) * orbitRadius, Math.sin(angle) * Math.cos(inclination) * orbitRadius)
      if (state.mode === 'real') {
        moon.position.copy(sunAlignedVector(physicalMoon!, physicalSun!).normalize().multiplyScalar(orbitRadius))
      }
      moon.lookAt(earth.position)
      moonCamera.position.copy(moon.position).add(new THREE.Vector3(0, .65, 2.2))
      moonCamera.target.copy(moon.position)
      moonLabel.position.copy(moon.position).add(new THREE.Vector3(0, trueScale ? .22 : .55, 0))
      faceMarker.position.copy(moon.position)
      faceMarker.setDirection(earth.position.clone().sub(moon.position).normalize())
      faceMarker.setLength(trueScale ? .18 : .65)
      const observerLongitude = parameter(state, context.definition, 'observerLongitude')
      const solarHour = teachingSolarTime(parameter(state, context.definition, 'observerSolarHour'), state.timeline)
      const teachingRotation = teachingEarthRotation(observerLongitude, solarHour)
      const teachingDirection = teachingObserverDirection(parameter(state, context.definition, 'observerLatitude'), observerLongitude)
      const surfaceDirection = state.mode === 'real'
        ? teachingObserverDirection(state.observer.latitude, state.observer.longitude)
        : teachingDirection
      const earthOrientation = state.mode === 'real'
        ? realEarthOrientation(instant, physicalSun!)
        : new THREE.Quaternion().setFromAxisAngle(earthAxis, teachingRotation)
      earth.quaternion.copy(earthOrientation)
      const observerDirection = new THREE.Vector3(surfaceDirection.x, surfaceDirection.y, surfaceDirection.z).applyQuaternion(earthOrientation).normalize()
      const markerRadius = trueScale ? .0065 : .065
      observerMarker.scale.setScalar(markerRadius / .065)
      observerMarker.position.copy(observerDirection).multiplyScalar(earthRadius + markerRadius * .55)
      observerPointer.position.copy(observerDirection).multiplyScalar(earthRadius + markerRadius)
      observerPointer.setDirection(observerDirection)
      observerPointer.setLength(trueScale ? .045 : .22, trueScale ? .018 : .07, trueScale ? .009 : .035)
      observerLabel.position.copy(observerDirection).multiplyScalar(earthRadius + (trueScale ? .13 : .35))
      observerScaleLabel.position.copy(observerDirection).multiplyScalar(earthRadius + .24)
      if (state.mode === 'real') {
        const zone = observerTimeZone(parameter(state, context.definition, 'observerTimeZone'))
        const schedule = realEventsFor(state, zone)
        observerLocation.textContent = `觀測者 ${formatObserverCoordinates(state.observer.latitude, state.observer.longitude)}`
        observerTime.textContent = `${formatObserverTime(instant, zone)}（${zone}）`
        riseTime.textContent = schedule.rise
        transitTime.textContent = schedule.transit
        setTime.textContent = schedule.set
        observerZoneNote.textContent = '時區需自行選擇；不依經度推測民用時區。'
      } else {
        const latitude = parameter(state, context.definition, 'observerLatitude')
        const schedule = teachingMoonEvents(phaseAngle)
        observerLocation.textContent = `觀測者 ${formatObserverCoordinates(latitude, observerLongitude)}`
        observerTime.textContent = `教學太陽時 ${formatSolarHour(solarHour)}`
        riseTime.textContent = formatSolarHour(schedule.rise)
        transitTime.textContent = formatSolarHour(schedule.transit)
        setTime.textContent = formatSolarHour(schedule.set)
        observerZoneNote.textContent = '固定經緯度；標記隨地球自轉，時間軸同步推進所在地太陽時。'
      }
      const illumination = state.mode === 'real' ? context.astronomy.moonIlluminationFraction(new Date(state.instant)) : moonPhaseFromAngle(phaseAngle).illumination
      const discPhase = Math.acos(1 - 2 * illumination) * 180 / Math.PI
      const phase = moonPhaseFromAngle(phaseAngle)
      phaseDisc.update(phaseAngle <= 180 ? discPhase : 360 - discPhase, phase.name, illumination)
      applyLayers(root, state)
      observerScaleLabel.visible = trueScale && state.layers.labels
      const schedule = teachingMoonEvents(phaseAngle)
      const selectedZone = observerTimeZone(parameter(state, context.definition, 'observerTimeZone'))
      const physicalSchedule = state.mode === 'real' ? realEventsFor(state, selectedZone) : undefined
      return [
        { label: '月相', value: phase.name },
        { label: '照亮比例', value: `${Math.round(illumination * 100)}%` },
        { label: '月相角・黃經差', value: `${phaseAngle.toFixed(1)}°` },
        { label: '地月距離', value: `${Math.round(distanceKm).toLocaleString()} km` },
        { label: '朔望月／同步自轉', value: '29.53／27.32 天' },
        { label: '比例', value: trueScale ? '地月等比例・太陽仍示意' : '教學非等比例' },
        ...(state.mode === 'real'
          ? [
              { label: '下一次月升（選定時區）', value: physicalSchedule!.rise },
              { label: '下一次月球中天', value: physicalSchedule!.transit },
              { label: '下一次月落', value: physicalSchedule!.set }
            ]
          : [
              { label: '約略月升（太陽時）', value: formatSolarHour(schedule.rise) },
              { label: '約略月球中天', value: formatSolarHour(schedule.transit) },
              { label: '約略月落（太陽時）', value: formatSolarHour(schedule.set) }
            ])
      ]
    }
  }
}
