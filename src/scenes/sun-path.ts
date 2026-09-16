import * as THREE from 'three'
import { degreesToRadians, radiansToDegrees, dayLengthHours, horizontalCoordinates } from '../core/astro-math'
import { COLORS, ring, circlePoints, lineFromPoints, createSun, createEarth, createArrow } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, horizontalVector, riseSetMetrics, type BuildContext, type SceneVisual } from './shared'

export function createSunPath(context: BuildContext): SceneVisual {
  const realEvents = riseSetMetrics(context.astronomy, 'Sun')
  const root = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 96), new THREE.MeshBasicMaterial({ color: 0x16313c, transparent: true, opacity: .38, side: THREE.DoubleSide }))
  ground.rotation.x = -Math.PI / 2
  root.add(ground, ring(4, COLORS.cyan, .75))
  addLabel(root, '北', new THREE.Vector3(0, .08, -4.35), '#eef7f5')
  addLabel(root, '南', new THREE.Vector3(0, .08, 4.35), '#8fa3a4')
  addLabel(root, '東', new THREE.Vector3(4.35, .08, 0), '#8fa3a4')
  addLabel(root, '西', new THREE.Vector3(-4.35, .08, 0), '#8fa3a4')

  const paths = new THREE.Group()
  paths.userData.layer = 'paths'
  root.add(paths)
  const currentPath = lineFromPoints([], COLORS.amber, .96)
  const summerPath = lineFromPoints([], COLORS.red, .7)
  const equinoxPath = lineFromPoints([], COLORS.cyan, .65)
  const winterPath = lineFromPoints([], COLORS.blue, .7)
  paths.add(summerPath, equinoxPath, winterPath, currentPath)
  const sun = createSun(.24)
  root.add(sun)

  // Separate scene graph, rendered by the same stage clock in its own viewport.
  const seasons = new THREE.Group()
  const orbitRadius = 2.6
  const annualOrbit = ring(orbitRadius, COLORS.muted, .65)
  annualOrbit.userData.layer = 'paths'
  seasons.add(createSun(.45), annualOrbit)
  const earthTilt = new THREE.Group()
  earthTilt.rotation.z = degreesToRadians(23.44)
  const earthMini = createEarth(.56, context.earthTextureUrl)
  earthTilt.add(earthMini)
  seasons.add(earthTilt)
  const sunlight = new THREE.DirectionalLight(0xfff4de, 3.2)
  sunlight.position.set(0, 0, 0)
  sunlight.target = earthTilt
  seasons.add(sunlight)
  const terminator = ring(.575, COLORS.white, .72)
  terminator.userData.layer = 'shadows'
  seasons.add(terminator)
  const axis = lineFromPoints([new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0)], COLORS.white, .85)
  axis.userData.layer = 'paths'
  earthTilt.add(axis)
  addLabel(earthTilt, '北極', new THREE.Vector3(0, 1.15, 0), '#eef7f5', .46)
  addLabel(seasons, '太陽', new THREE.Vector3(0, .85, 0), '#f7b955', .48)
  for (const [text, x, z] of [['春分', 0, 3.25], ['夏至', 3.25, 0], ['秋分', 0, -3.25], ['冬至', -3.25, 0]] as const) {
    addLabel(seasons, text, new THREE.Vector3(x, -.18, z), '#eef7f5', .46)
  }
  const observerTrailRadius = .59
  const observerTrail = lineFromPoints(circlePoints(observerTrailRadius, 128), COLORS.cyan, .85, true)
  observerTrail.userData.layer = 'paths'
  const observer = new THREE.Mesh(new THREE.SphereGeometry(.065, 16, 12), new THREE.MeshBasicMaterial({ color: COLORS.cyan }))
  const observerNormal = createArrow(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), .42, COLORS.cyan)
  observerNormal.userData.layer = 'paths'
  earthTilt.add(observerTrail, observer, observerNormal)
  const rays = createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1.6, COLORS.amber)
  rays.userData.layer = 'shadows'
  seasons.add(rays)
  const altitudeLine = lineFromPoints([new THREE.Vector3(), new THREE.Vector3()], COLORS.amber, .6)
  altitudeLine.userData.layer = 'paths'
  root.add(altitudeLine)
  const footprint = new THREE.Mesh(new THREE.CircleGeometry(.3, 40), new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: .35, side: THREE.DoubleSide }))
  footprint.rotation.x = -Math.PI / 2
  footprint.position.y = .015
  footprint.userData.layer = 'shadows'
  root.add(footprint)

  const overlay = document.createElement('div')
  overlay.className = 'sun-views'
  overlay.innerHTML = `<section class="sun-view" role="region" aria-label="當地太陽視運動">
    <header class="sun-view-heading"><h3>當地太陽視運動</h3><span>地面視角</span></header>
    <div class="sun-view-surface" data-viewport="primary" aria-label="當地模型拖曳區；鍵盤可用下方視角按鈕"></div>
    <div class="sun-path-legend"><span class="summer-key">夏至</span><span class="equinox-key">春秋分</span><span class="winter-key">冬至</span></div>
    <output class="sun-view-readout"></output>
  </section>
  <section class="sun-view" role="region" aria-label="地球公轉與四季">
    <header class="sun-view-heading"><h3>地球公轉與四季</h3><span class="sync-indicator">同步</span></header>
    <div class="sun-view-surface" data-viewport="comparison" aria-label="公轉自由視角；拖曳旋轉、滾輪或雙指縮放、右鍵或雙指平移"></div>
    <div class="earth-light-legend"><span>☀ 受光面</span><span>◐ 晨昏線</span><span class="night-side-key">背光面</span><span class="observer-trail-key">觀測者自轉軌跡</span></div>
    <div class="sun-view-cameras"><button class="camera-button" data-sun-camera="free" aria-label="自由公轉視角" title="拖曳旋轉・滾輪縮放・右鍵或雙指平移">自由</button><button class="camera-button" data-sun-camera="top" aria-label="四季俯視">俯視</button><button class="camera-button" data-sun-camera="earth" aria-label="地球晝夜特寫">地球特寫</button></div>
    <output class="sun-view-readout"></output>
  </section>`
  const viewElements = Array.from(overlay.querySelectorAll<HTMLElement>('.sun-view'))
  const localReadout = viewElements[0]!.querySelector('output')!
  const spaceReadout = viewElements[1]!.querySelector('output')!
  const pathLegend = overlay.querySelector<HTMLElement>('.sun-path-legend')!
  const observerTrailLegend = overlay.querySelector<HTMLElement>('.observer-trail-key')!
  const earthCamera = { id: 'earth', label: '地球晝夜特寫', position: new THREE.Vector3(0, 2.3, 1.5), target: new THREE.Vector3() }

  let cachedLatitude = Number.NaN
  let cachedDeclination = Number.NaN
  const updatePath = (line: THREE.Line, latitude: number, declination: number): void => {
    const points = Array.from({ length: 145 }, (_, index) => {
      const hourAngle = -180 + index * 2.5
      const position = horizontalCoordinates(hourAngle, declination, latitude)
      return horizontalVector(position.altitude, position.azimuth, 3.75)
    })
    line.geometry.dispose()
    line.geometry = new THREE.BufferGeometry().setFromPoints(points)
  }

  return {
    root, overlay,
    comparison: {
      root: seasons,
      trackingCameraIds: ['earth'],
      cameras: [
        { id: 'free', label: '自由公轉視角', position: new THREE.Vector3(0, 8.5, 5.5), target: new THREE.Vector3(0, 0, 0) },
        { id: 'top', label: '四季俯視', position: new THREE.Vector3(0, 11, .01), target: new THREE.Vector3(0, 0, 0) },
        earthCamera
      ]
    },
    cameras: [
      { id: 'horizon', label: '地面', position: new THREE.Vector3(7.6, 3.3, 7.2), target: new THREE.Vector3(0, 1.1, 0) },
      { id: 'outside', label: '側視', position: new THREE.Vector3(8.8, 1.8, 1.2), target: new THREE.Vector3(0, 1.5, 0) },
      { id: 'top', label: '俯視', position: new THREE.Vector3(0, 10, .01), target: new THREE.Vector3(0, 0, 0) },
      { id: 'seasons', label: '重設雙視窗', position: new THREE.Vector3(7.6, 3.3, 7.2), target: new THREE.Vector3(0, 1.1, 0) }
    ],
    update(state) {
      const instant = new Date(state.instant)
      const real = state.mode === 'real' ? context.astronomy.horizontalPosition('Sun', instant, state.observer) : undefined
      const latitude = state.mode === 'real' ? state.observer.latitude : parameter(state, context.definition, 'latitude')
      let seasonAngle = parameter(state, context.definition, 'seasonAngle')
      if (state.mode === 'real') {
        const vector = context.astronomy.geocentricVector('Sun', instant)
        seasonAngle = (radiansToDegrees(Math.atan2(vector.y, vector.x)) + 360) % 360
      }
      const declination = real?.declination ?? radiansToDegrees(Math.asin(Math.sin(degreesToRadians(23.44)) * Math.sin(degreesToRadians(seasonAngle))))
      const hour = state.mode === 'real' ? instant.getUTCHours() + state.observer.longitude / 15 : state.timeline * 24
      const position = real ?? horizontalCoordinates((hour - 12) * 15, declination, latitude)
      sun.position.copy(horizontalVector(position.altitude, position.azimuth, 3.75))
      if (latitude !== cachedLatitude) {
        updatePath(summerPath, latitude, 23.44)
        updatePath(equinoxPath, latitude, 0)
        updatePath(winterPath, latitude, -23.44)
      }
      if (latitude !== cachedLatitude || Math.abs(declination - cachedDeclination) >= .01 || Number.isNaN(cachedDeclination)) {
        updatePath(currentPath, latitude, declination)
        cachedLatitude = latitude
        cachedDeclination = declination
      }
      const orbitalAngle = degreesToRadians(seasonAngle - 90)
      earthTilt.position.set(Math.cos(orbitalAngle) * orbitRadius, 0, -Math.sin(orbitalAngle) * orbitRadius)
      earthCamera.target.copy(earthTilt.position)
      earthCamera.position.copy(earthTilt.position).add(new THREE.Vector3(0, 2.3, 1.5))
      terminator.position.copy(earthTilt.position)
      terminator.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), earthTilt.position.clone().negate().normalize())
      rays.setDirection(earthTilt.position.clone().normalize())
      rays.position.copy(earthTilt.position).normalize().multiplyScalar(.65)
      earthMini.rotation.y = -(state.mode === 'real' ? context.astronomy.localSiderealDegrees(instant, 0) / 360 : state.timeline) * Math.PI * 2
      const sunInEarthFrame = earthTilt.position.clone().negate().normalize().applyQuaternion(earthTilt.quaternion.clone().invert())
      const hourAngle = state.mode === 'real'
        ? context.astronomy.localSiderealDegrees(instant, state.observer.longitude) - real!.rightAscension * 15
        : (hour - 12) * 15
      const longitude = Math.atan2(sunInEarthFrame.z, sunInEarthFrame.x) + degreesToRadians(hourAngle)
      const latitudeRadians = degreesToRadians(latitude)
      const latitudeRadius = Math.cos(latitudeRadians)
      const normal = new THREE.Vector3(latitudeRadius * Math.cos(longitude), Math.sin(latitudeRadians), latitudeRadius * Math.sin(longitude))
      observerTrail.position.y = Math.sin(latitudeRadians) * observerTrailRadius
      observerTrail.scale.set(latitudeRadius, 1, latitudeRadius)
      observer.position.copy(normal).multiplyScalar(.585)
      observerNormal.position.copy(observer.position)
      observerNormal.setDirection(normal)
      const positions = altitudeLine.geometry.getAttribute('position') as THREE.BufferAttribute
      positions.setXYZ(1, sun.position.x, sun.position.y, sun.position.z)
      positions.needsUpdate = true
      altitudeLine.geometry.computeBoundingSphere()
      const irradiance = Math.max(0, Math.sin(degreesToRadians(position.altitude)))
      footprint.visible = irradiance > 0
      footprint.scale.set(Math.min(4, 1 / Math.max(.25, irradiance)), 1, 1)
      footprint.rotation.z = degreesToRadians(90 - position.azimuth)
      applyLayers(root, state)
      applyLayers(seasons, state)
      pathLegend.hidden = !state.layers.paths
      observerTrailLegend.hidden = !state.layers.paths
      footprint.visible = state.layers.shadows && irradiance > 0
      const signedDeclination = `${declination < 0 ? '−' : ''}${Math.abs(declination).toFixed(1)}`
      localReadout.textContent = `緯度 ${latitude.toFixed(1)}° · 赤緯 ${signedDeclination}° · ${position.altitude > 0 ? '白天' : '夜晚'}`
      const seasonIndex = Math.round(seasonAngle / 90) % 4
      const seasonName = Math.abs(seasonAngle % 90) < .5 ? ['春分', '夏至', '秋分', '冬至'][seasonIndex] : `公轉 ${seasonAngle.toFixed(0)}°`
      spaceReadout.textContent = `${seasonName} · 地軸 23.4° · 青點為觀察位置`
      for (const view of viewElements) {
        view.dataset.timeline = String(state.timeline)
        view.dataset.instant = state.instant
      }
      viewElements[1]!.dataset.observerTrailLatitude = String(latitude)
      return [
        { label: '太陽高度', value: `${position.altitude.toFixed(1)}°` },
        { label: '方位角', value: `${position.azimuth.toFixed(1)}°` },
        { label: '幾何晝長', value: `${dayLengthHours(latitude, declination).toFixed(1)} h` },
        { label: '太陽赤緯', value: `${declination.toFixed(1)}°` },
        { label: '相對日照・忽略大氣', value: `${Math.round(irradiance * 100)}%` },
        ...(state.mode === 'real' ? realEvents(state) : [{ label: '日出／日落（太陽時）', value: dayLengthHours(latitude, declination) === 24 ? '極晝' : dayLengthHours(latitude, declination) === 0 ? '極夜' : `${(12 - dayLengthHours(latitude, declination) / 2).toFixed(1)}h／${(12 + dayLengthHours(latitude, declination) / 2).toFixed(1)}h` }])
      ]
    }
  }
}
