import * as THREE from 'three'
import { degreesToRadians, horizontalCoordinates } from '../core/astro-math'
import { horizonDirection } from '../core/local-horizon'
import { teachingSolarTime } from '../core/moon-observer'
import { realLunarAppearance, realSolarAppearance, teachingLunarAppearance, teachingSolarAppearance, type ObserverEclipseAppearance } from '../core/observer-eclipse'
import type { SimulationState } from '../core/types'
import { BRIGHT_STARS } from '../data/bright-stars'
import type { AstronomyProvider } from '../services/astronomy-provider'
import { COLORS, createLabel, createMoon, createSun, disposeObject, lineFromPoints, ring } from './helpers'

export interface SkyPosition { readonly altitude: number; readonly azimuth: number }

export interface ObserverView {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  update(state: SimulationState): void
  bodyPosition(body: 'Sun' | 'Moon'): SkyPosition
  eclipseAppearance(): ObserverEclipseAppearance | undefined
  setHeading(azimuth: number, altitude: number, fov: number): void
  resize(aspect: number): void
  dispose(): void
}

const SKY_RADIUS = 85
const stars = BRIGHT_STARS.slice(0, 128)

function direction(altitude: number, azimuth: number, radius = SKY_RADIUS): THREE.Vector3 {
  const vector = horizonDirection(altitude, azimuth)
  return new THREE.Vector3(vector.x * radius, vector.y * radius, vector.z * radius)
}

// A repeatable, deliberately fictional skyline: it gives the eye a ground reference
// without pretending that we know the observer's actual surrounding terrain.
function landscape(radius: number, color: number, distant: boolean): THREE.Mesh {
  const vertices: number[] = []
  const segments = 128
  for (let index = 0; index < segments; index++) {
    for (const step of [index, index + 1]) {
      const azimuth = step / segments * 360
      const radians = azimuth * Math.PI / 180
      const height = distant
        ? 4 + 2.2 * Math.sin(radians * 3 + .6) + 1.3 * Math.sin(radians * 7 + 1.1) + .7 * Math.sin(radians * 15)
        : 1.5 + .9 * Math.sin(radians * 4 + 1.2) + .6 * Math.sin(radians * 10)
      const x = Math.sin(radians) * radius
      const z = -Math.cos(radians) * radius
      vertices.push(x, -18, z, x, height, z)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  const indices: number[] = []
  for (let index = 0; index < segments; index++) {
    const start = index * 4
    indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3)
  }
  geometry.setIndex(indices)
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
}

function altitudeCircle(altitude: number): THREE.Line {
  return lineFromPoints(Array.from({ length: 145 }, (_, index) => direction(altitude, index * 2.5, 87)), 0xb2f4ee, .56)
}

const skyPalettes = [
  { altitude: -12, top: new THREE.Color(0x01070e), horizon: new THREE.Color(0x0a1724) },
  { altitude: -6, top: new THREE.Color(0x0b1730), horizon: new THREE.Color(0x805b57) },
  { altitude: 0, top: new THREE.Color(0x23405c), horizon: new THREE.Color(0xf1aa69) },
  { altitude: 14, top: new THREE.Color(0x316080), horizon: new THREE.Color(0xa0c4cf) }
] as const

function skyColors(solarAltitude: number): { top: THREE.Color; horizon: THREE.Color } {
  const upper = skyPalettes.findIndex((palette) => solarAltitude <= palette.altitude)
  if (upper === 0) return { top: skyPalettes[0].top.clone(), horizon: skyPalettes[0].horizon.clone() }
  if (upper < 0) return { top: skyPalettes[3].top.clone(), horizon: skyPalettes[3].horizon.clone() }
  const before = skyPalettes[upper - 1]!
  const after = skyPalettes[upper]!
  const fraction = (solarAltitude - before.altitude) / (after.altitude - before.altitude)
  const smooth = fraction * fraction * (3 - 2 * fraction)
  return {
    top: before.top.clone().lerp(after.top, smooth),
    horizon: before.horizon.clone().lerp(after.horizon, smooth)
  }
}

export function createObserverView(astronomy: AstronomyProvider, moonTextureUrl: string): ObserverView {
  const scene = new THREE.Scene()
  const skyBackground = new THREE.Color(0x01070e)
  scene.background = skyBackground
  const skyGeometry = new THREE.SphereGeometry(99, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2)
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeometry.getAttribute('position').count * 3), 3))
  const skyDome = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false }))
  scene.add(skyDome)
  const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x071920, side: THREE.DoubleSide })
  const ground = new THREE.Mesh(new THREE.CircleGeometry(110, 96), groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -.08
  const distantLandscape = landscape(92, 0x18343b, true)
  const nearLandscape = landscape(70, 0x0b252c, false)
  const horizon = ring(90, COLORS.cyan, .68)
  horizon.position.y = .02
  scene.add(ground, distantLandscape, nearLandscape, horizon)
  for (const radius of [22, 45, 66]) {
    const groundRing = ring(radius, COLORS.cyan, .18)
    groundRing.position.y = .035
    scene.add(groundRing)
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 45) {
    const start = direction(0, azimuth, 2)
    const end = direction(0, azimuth, 69)
    start.y = end.y = .04
    scene.add(lineFromPoints([start, end], COLORS.cyan, .19))
  }
  for (const altitude of [30, 60]) {
    scene.add(altitudeCircle(altitude))
    const label = createLabel(`${altitude}°`, '#8ce6df', 4)
    label.position.copy(direction(altitude, 180, 87)).add(new THREE.Vector3(3, 0, 0))
    scene.add(label)
  }
  for (const azimuth of [0, 90, 180, 270]) {
    scene.add(lineFromPoints(Array.from({ length: 31 }, (_, index) => direction(index * 3, azimuth, 87)), 0xb2f4ee, .35))
  }
  for (const [name, azimuth] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const) {
    const label = createLabel(name, '#d5f7f4', 8)
    label.position.copy(direction(0, azimuth, 61)).add(new THREE.Vector3(0, 9, 0))
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(.38, .52, 6, 8), new THREE.MeshBasicMaterial({ color: COLORS.cyan }))
    marker.position.copy(direction(0, azimuth, 61)).add(new THREE.Vector3(0, 3, 0))
    scene.add(marker, label)
  }
  const zenith = createLabel('天頂', '#55d9d0', 7)
  zenith.position.set(0, 89, 0)
  scene.add(zenith)

  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(stars.length * 3), 3))
  const starMaterial = new THREE.PointsMaterial({ color: 0xf5f4e8, size: .7, sizeAttenuation: true, transparent: true })
  scene.add(new THREE.Points(starGeometry, starMaterial))
  const sunTrail = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: .7 }))
  const moonTrail = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: .7 }))
  scene.add(sunTrail, moonTrail)
  const solarGuides = ([
    { label: '夏至線', declination: 23.44, color: COLORS.red },
    { label: '春秋分線', declination: 0, color: COLORS.cyan },
    { label: '冬至線', declination: -23.44, color: COLORS.blue }
  ] as const).map(({ label, declination, color }) => {
    const path = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .78 }))
    const name = createLabel(label, `#${color.toString(16).padStart(6, '0')}`, 8)
    scene.add(path, name)
    return { path, name, declination }
  })
  const referenceStars = [11734, 60893, 60530, 62239, 59565].map((id) => BRIGHT_STARS.find((star) => star.id === id)!)
  const referenceMarkers = referenceStars.map(() => {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.47, 8, 6), new THREE.MeshBasicMaterial({ color: COLORS.white }))
    scene.add(marker)
    return marker
  })
  const referenceLines = [[1, 2], [3, 4]].map(() => {
    const line = lineFromPoints([new THREE.Vector3(), new THREE.Vector3()], COLORS.white, .7)
    scene.add(line)
    return line
  })
  const polarisLabel = createLabel('北極星・近北天極', '#d8f3f0', 8)
  const cruxLabel = createLabel('南十字座', '#d8f3f0', 8)
  const southPoleMarker = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.cyan }))
  const southPoleLabel = createLabel('南天極・無亮星', '#55d9d0', 8)
  const cruxPoleGuide = lineFromPoints([new THREE.Vector3(), new THREE.Vector3()], COLORS.cyan, .65)
  scene.add(polarisLabel, cruxLabel, southPoleMarker, southPoleLabel, cruxPoleGuide)
  const sun = createSun(1.6)
  const moon = createMoon(1.5, moonTextureUrl)
  scene.add(sun, moon)
  const lunarShadeCanvas = document.createElement('canvas')
  lunarShadeCanvas.width = lunarShadeCanvas.height = 256
  const lunarShadeTexture = new THREE.CanvasTexture(lunarShadeCanvas)
  const lunarShade = new THREE.Sprite(new THREE.SpriteMaterial({ map: lunarShadeTexture, transparent: true, depthWrite: false, depthTest: false }))
  scene.add(lunarShade)
  const sunLabel = createLabel('太陽', '#f7b955', 6)
  const moonLabel = createLabel('月球', '#eef7f5', 6)
  scene.add(sunLabel, moonLabel)
  const moonlight = new THREE.DirectionalLight(0xfff2d4, 2.1)
  scene.add(moonlight, new THREE.AmbientLight(0xc2d4e1, .12))

  // The observer anchor and horizon frame never move during a look gesture.
  // Only the head rig changes yaw/pitch; the camera itself owns FOV only.
  const observerAnchor = new THREE.Group()
  observerAnchor.position.y = .06
  const horizonFrame = new THREE.Group()
  const yawRig = new THREE.Group()
  const pitchRig = new THREE.Group()
  const camera = new THREE.PerspectiveCamera(65, 1, .01, 200)
  scene.add(observerAnchor)
  observerAnchor.add(horizonFrame)
  horizonFrame.add(yawRig)
  yawRig.add(pitchRig)
  pitchRig.add(camera)

  let cachedKey = ''
  let cachedStarsKey = ''
  let cachedTrailsKey = ''
  let cachedSolarGuideLatitude = Number.NaN
  let referenceAltitudes = Array<number>(referenceStars.length).fill(-90)
  let cachedSkyAltitude = Number.NaN
  let cachedEclipseDarkness = Number.NaN
  let sunPosition: SkyPosition = { altitude: 0, azimuth: 180 }
  let moonPosition: SkyPosition = { altitude: 0, azimuth: 180 }
  let currentEclipse: ObserverEclipseAppearance | undefined

  function teachingPositions(state: SimulationState): void {
    const latitude = state.sceneId === 'sun-path' ? state.parameters.latitude ?? 25.033
      : state.sceneId === 'moon-phases' ? state.parameters.observerLatitude ?? state.observer.latitude
      : state.sceneId === 'eclipses' ? state.parameters.observerLatitude ?? 0
      : state.sceneId === 'celestial-sphere' ? state.parameters.latitude ?? state.observer.latitude
      : state.observer.latitude
    const hour = state.sceneId === 'moon-phases'
      ? teachingSolarTime(state.parameters.observerSolarHour ?? 12, state.timeline)
      : state.sceneId === 'sun-path' ? state.timeline * 24
      : state.sceneId === 'eclipses' ? state.parameters.observerSolarHour ?? 12
      : 12
    const seasonAngle = state.parameters.seasonAngle ?? 0
    const declination = Math.asin(Math.sin(degreesToRadians(23.44)) * Math.sin(degreesToRadians(seasonAngle))) * 180 / Math.PI
    sunPosition = horizontalCoordinates((hour - 12) * 15, declination, latitude)
    const phaseAngle = state.sceneId === 'moon-phases' || state.sceneId === 'eclipses' ? state.timeline * 360 : astronomy.moonPhaseAngle(new Date(state.instant))
    moonPosition = horizontalCoordinates((hour - 12) * 15 - phaseAngle, 0, latitude)
  }

  function updateTrails(state: SimulationState, instant: Date): void {
    const real = state.mode === 'real'
    const phaseAngle = real ? astronomy.moonPhaseAngle(instant) : state.timeline * 360
    const solarEclipse = Math.cos(degreesToRadians(phaseAngle)) > 0
    sunTrail.visible = state.layers.paths && (state.sceneId === 'sun-path' || state.sceneId === 'celestial-sphere' || state.sceneId === 'eclipses' && solarEclipse)
    moonTrail.visible = state.layers.paths && (state.sceneId === 'moon-phases' || state.sceneId === 'eclipses' && !solarEclipse)
    if (!sunTrail.visible && !moonTrail.visible) return
    const latitude = state.sceneId === 'moon-phases' ? state.parameters.observerLatitude ?? state.observer.latitude
      : state.sceneId === 'eclipses' && !real ? state.parameters.observerLatitude ?? 0
      : state.sceneId === 'sun-path' || state.sceneId === 'celestial-sphere' ? state.parameters.latitude ?? state.observer.latitude
      : state.observer.latitude
    const seasonAngle = state.parameters.seasonAngle ?? 0
    const hourBucket = Math.floor(instant.getTime() / 3_600_000)
    const key = real
      ? `${state.sceneId}|real|${solarEclipse}|${hourBucket}|${state.observer.latitude}|${state.observer.longitude}`
      : `${state.sceneId}|teaching|${latitude}|${seasonAngle}|${sunTrail.visible ? 'sun' : 'moon'}`
    if (key === cachedTrailsKey) return
    const declination = Math.asin(Math.sin(degreesToRadians(23.44)) * Math.sin(degreesToRadians(seasonAngle))) * 180 / Math.PI
    const centerTime = hourBucket * 3_600_000
    const updateTrail = (trail: THREE.Mesh, body: 'Sun' | 'Moon') => {
      if (!trail.visible) return
      const points = Array.from({ length: real ? 145 : 144 }, (_, index) => {
        const hour = index / 6
        const position = real
          ? astronomy.horizontalPosition(body, new Date(centerTime + (index - 72) * 600_000), state.observer)
          : body === 'Sun'
            ? horizontalCoordinates((hour - 12) * 15, declination, latitude)
            : horizontalCoordinates((hour - 12) * 15, 0, latitude)
        return direction(position.altitude, position.azimuth, 86)
      })
      trail.geometry.dispose()
      trail.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, !real), 144, .17, 4, !real)
    }
    updateTrail(sunTrail, 'Sun')
    updateTrail(moonTrail, 'Moon')
    cachedTrailsKey = key
  }

  function updateSolarGuides(state: SimulationState): void {
    const active = state.sceneId === 'sun-path'
    const latitude = state.mode === 'real' ? state.observer.latitude : state.parameters.latitude ?? state.observer.latitude
    if (active && latitude !== cachedSolarGuideLatitude) {
      for (const guide of solarGuides) {
        const points = Array.from({ length: 145 }, (_, index) => {
          const position = horizontalCoordinates(-180 + index * 2.5, guide.declination, latitude)
          return direction(position.altitude, position.azimuth, 86)
        })
        guide.path.geometry.dispose()
        guide.path.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 144, .14, 4, false)
        const noon = horizontalCoordinates(0, guide.declination, latitude)
        guide.name.position.copy(direction(noon.altitude, noon.azimuth, 86)).add(new THREE.Vector3(0, guide.declination > 0 ? 9 : 3, 0))
        guide.name.userData.aboveHorizon = noon.altitude >= 0
      }
      cachedSolarGuideLatitude = latitude
    }
    for (const guide of solarGuides) {
      guide.path.visible = active && state.layers.paths
      guide.name.visible = active && state.layers.paths && state.layers.labels && guide.name.userData.aboveHorizon === true
    }
  }

  return {
    scene, camera,
    update(state) {
      const key = `${state.mode}|${state.sceneId}|${state.instant}|${state.timeline}|${state.observer.latitude}|${state.observer.longitude}|${JSON.stringify(state.parameters)}`
      if (key === cachedKey) return
      const instant = new Date(state.instant)
      let realSun: ReturnType<AstronomyProvider['horizontalPosition']> | undefined
      let realMoon: ReturnType<AstronomyProvider['horizontalPosition']> | undefined
      if (state.mode === 'real') {
        realSun = astronomy.horizontalPosition('Sun', instant, state.observer)
        realMoon = astronomy.horizontalPosition('Moon', instant, state.observer)
        sunPosition = realSun
        moonPosition = realMoon
      } else teachingPositions(state)
      currentEclipse = undefined
      if (state.sceneId === 'eclipses') {
        const phaseAngle = state.mode === 'real' ? astronomy.moonPhaseAngle(instant) : state.timeline * 360
        if (Math.cos(degreesToRadians(phaseAngle)) > 0) {
          currentEclipse = state.mode === 'real'
            ? realSolarAppearance(realSun!, realMoon!)
            : teachingSolarAppearance(sunPosition, moonPosition, state.parameters.eclipseType ?? 0, state.parameters.nodeOffset ?? 0, state.parameters.inclination ?? 25)
        } else {
          currentEclipse = state.mode === 'real'
            ? realLunarAppearance(astronomy.geocentricVector('Sun', instant), astronomy.geocentricVector('Moon', instant), moonPosition.altitude)
            : teachingLunarAppearance(moonPosition.altitude, state.parameters.eclipseType ?? 3, state.parameters.nodeOffset ?? 0, phaseAngle)
        }
      }
      const solarEclipse = currentEclipse?.type === 'solar' ? currentEclipse : undefined
      const lunarEclipse = currentEclipse?.type === 'lunar' ? currentEclipse : undefined
      if (solarEclipse && state.mode === 'teaching') moonPosition = { ...moonPosition, altitude: sunPosition.altitude + solarEclipse.moonOffsetYDegrees }
      sun.scale.setScalar(solarEclipse && state.mode === 'real' ? 85 * Math.tan(degreesToRadians(solarEclipse.sunRadiusDegrees)) / 1.6 : 1)
      sun.position.copy(direction(sunPosition.altitude, sunPosition.azimuth))
      moon.position.copy(direction(moonPosition.altitude, moonPosition.azimuth, solarEclipse ? 84.5 : 85))
      moon.scale.setScalar(solarEclipse
        ? 85 * Math.tan(degreesToRadians(solarEclipse.moonRadiusDegrees)) / 1.5
        : state.sceneId === 'moon-phases' ? 1.6 : lunarEclipse ? 1.35 : 1)
      moon.lookAt(0, 0, 0)
      const moonMaterial = moon.material as THREE.MeshStandardMaterial
      moonMaterial.color.setHex(lunarEclipse?.visible && lunarEclipse.coverage > .95 ? 0xb86857 : 0xffffff)
      moonMaterial.emissive.setHex(lunarEclipse?.visible && lunarEclipse.coverage > .95 ? 0x38150e : 0x000000)
      moonMaterial.emissiveIntensity = .6
      lunarShade.visible = Boolean(lunarEclipse?.visible && lunarEclipse.coverage > 0)
      if (lunarShade.visible && lunarEclipse) {
        const ctx = lunarShadeCanvas.getContext('2d')!
        ctx.clearRect(0, 0, 256, 256)
        ctx.save()
        ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.clip()
        ctx.fillStyle = 'rgba(50, 12, 15, .78)'
        ctx.beginPath()
        ctx.arc(128 + lunarEclipse.umbraOffsetInMoonRadii * 124, 128, lunarEclipse.umbraRadiusInMoonRadii * 124, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        lunarShadeTexture.needsUpdate = true
        lunarShade.position.copy(moon.position).multiplyScalar(84 / moon.position.length())
        lunarShade.scale.setScalar(3 * moon.scale.x)
      }
      sunLabel.position.copy(sun.position); sunLabel.position.y += 4.5
      moonLabel.position.copy(moon.position); moonLabel.position.y += 4.5
      sun.visible = sunLabel.visible = sunPosition.altitude >= 0
      moon.visible = moonLabel.visible = moonPosition.altitude >= 0
      if (state.sceneId === 'eclipses') sunLabel.visible = moonLabel.visible = false
      moonlight.position.copy(sun.position)
      updateTrails(state, instant)
      updateSolarGuides(state)
      const eclipseDarkness = solarEclipse?.visible
        ? solarEclipse.kind === 'total' ? .82 * THREE.MathUtils.smoothstep(solarEclipse.coverage, .9, 1)
          : solarEclipse.kind === 'annular' ? .12 * solarEclipse.coverage : .22 * solarEclipse.coverage
        : 0
      if (Number.isNaN(cachedSkyAltitude) || Math.abs(sunPosition.altitude - cachedSkyAltitude) >= .02 || Math.abs(eclipseDarkness - cachedEclipseDarkness) >= .01) {
        const colors = skyColors(sunPosition.altitude)
        const eclipseTwilight = skyColors(-6)
        colors.top.lerp(eclipseTwilight.top, eclipseDarkness)
        colors.horizon.lerp(eclipseTwilight.horizon, eclipseDarkness)
        const skyPositions = skyGeometry.getAttribute('position') as THREE.BufferAttribute
        const skyVertexColors = skyGeometry.getAttribute('color') as THREE.BufferAttribute
        for (let index = 0; index < skyPositions.count; index++) {
          const height = Math.pow(Math.max(0, skyPositions.getY(index) / 99), .55)
          skyVertexColors.setXYZ(index,
            colors.horizon.r + (colors.top.r - colors.horizon.r) * height,
            colors.horizon.g + (colors.top.g - colors.horizon.g) * height,
            colors.horizon.b + (colors.top.b - colors.horizon.b) * height)
        }
        skyVertexColors.needsUpdate = true
        const daylight = THREE.MathUtils.smoothstep(sunPosition.altitude, -9, 12)
        starMaterial.opacity = Math.max(.02 + .92 * (1 - THREE.MathUtils.smoothstep(sunPosition.altitude, -12, -4)), eclipseDarkness * .5)
        groundMaterial.color.copy(new THREE.Color(0x071920)).lerp(new THREE.Color(0x30494d), daylight)
        ;(distantLandscape.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color(0x18343b)).lerp(new THREE.Color(0x68878a), daylight)
        ;(nearLandscape.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color(0x0b252c)).lerp(new THREE.Color(0x425c5b), daylight)
        cachedSkyAltitude = sunPosition.altitude
        cachedEclipseDarkness = eclipseDarkness
      }
      const starsKey = state.mode === 'real'
        ? `${Math.floor(instant.getTime() / 300000)}|${state.observer.latitude}|${state.observer.longitude}`
        : `${state.sceneId}|${state.timeline.toFixed(4)}|${state.parameters.latitude ?? ''}|${state.parameters.seasonAngle ?? ''}|${state.parameters.annualDay ?? ''}`
      if (starsKey !== cachedStarsKey) {
        const positions = starGeometry.getAttribute('position') as THREE.BufferAttribute
        const teachingLatitude = state.mode === 'real' ? state.observer.latitude : state.parameters.latitude ?? state.observer.latitude
        const sidereal = state.sceneId === 'sun-path'
          ? (state.timeline * 24 - 12) * 15 + (state.parameters.seasonAngle ?? 0)
          : (state.timeline * 360 + (state.parameters.annualDay ?? 0) * .985647) % 360
        const starPosition = (star: (typeof stars)[number]) => state.mode === 'real'
          ? astronomy.starHorizontalPosition({ rightAscensionHours: star.ra, declinationDegrees: star.dec, properMotionRaMasYear: star.properMotionRaMasYear, properMotionDecMasYear: star.properMotionDecMasYear }, instant, state.observer)
          : horizontalCoordinates(sidereal - star.ra * 15, star.dec, teachingLatitude)
        stars.forEach((star, index) => {
          const position = starPosition(star)
          const point = direction(position.altitude, position.azimuth)
          positions.setXYZ(index, point.x, point.y, point.z)
        })
        positions.needsUpdate = true
        referenceAltitudes = referenceStars.map((star, index) => {
          const position = starPosition(star)
          referenceMarkers[index]!.position.copy(direction(position.altitude, position.azimuth, 85))
          return position.altitude
        })
        for (const [index, [first, second]] of ([[1, 2], [3, 4]] as const).entries()) {
          const points = referenceLines[index]!.geometry.getAttribute('position') as THREE.BufferAttribute
          const a = referenceMarkers[first]!.position
          const b = referenceMarkers[second]!.position
          points.setXYZ(0, a.x, a.y, a.z)
          points.setXYZ(1, b.x, b.y, b.z)
          points.needsUpdate = true
          referenceLines[index]!.geometry.computeBoundingSphere()
        }
        polarisLabel.position.copy(referenceMarkers[0]!.position).add(new THREE.Vector3(0, 2.6, 0))
        cruxLabel.position.copy(referenceMarkers[1]!.position).add(new THREE.Vector3(0, 2.6, 0))
        southPoleMarker.position.copy(direction(-teachingLatitude, 180, 85))
        southPoleLabel.position.copy(southPoleMarker.position).add(new THREE.Vector3(0, 3.2, 0))
        const guidePoints = cruxPoleGuide.geometry.getAttribute('position') as THREE.BufferAttribute
        const acrux = referenceMarkers[2]!.position
        guidePoints.setXYZ(0, acrux.x, acrux.y, acrux.z)
        guidePoints.setXYZ(1, southPoleMarker.position.x, southPoleMarker.position.y, southPoleMarker.position.z)
        guidePoints.needsUpdate = true
        cruxPoleGuide.geometry.computeBoundingSphere()
        cachedStarsKey = starsKey
      }
      const referencesVisible = state.sceneId === 'sun-path'
      referenceMarkers.forEach((marker, index) => { marker.visible = referencesVisible && state.layers.labels && referenceAltitudes[index]! >= 0 })
      referenceLines[0]!.visible = referencesVisible && state.layers.paths && referenceAltitudes[1]! >= 0 && referenceAltitudes[2]! >= 0
      referenceLines[1]!.visible = referencesVisible && state.layers.paths && referenceAltitudes[3]! >= 0 && referenceAltitudes[4]! >= 0
      polarisLabel.visible = referencesVisible && state.layers.labels && referenceAltitudes[0]! >= 0
      cruxLabel.visible = referencesVisible && state.layers.labels && referenceAltitudes[1]! >= 0
      const observerLatitude = state.mode === 'real' ? state.observer.latitude : state.parameters.latitude ?? state.observer.latitude
      southPoleMarker.visible = southPoleLabel.visible = referencesVisible && state.layers.labels && observerLatitude < 0
      cruxPoleGuide.visible = referencesVisible && state.layers.paths && observerLatitude < 0 && referenceAltitudes[2]! >= 0
      cachedKey = key
    },
    bodyPosition(body) { return body === 'Sun' ? sunPosition : moonPosition },
    eclipseAppearance() { return currentEclipse },
    setHeading(azimuth, altitude, fov) {
      yawRig.rotation.y = -degreesToRadians(azimuth)
      pitchRig.rotation.x = degreesToRadians(altitude)
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
    },
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix() },
    dispose() { disposeObject(scene) }
  }
}
