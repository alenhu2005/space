import * as THREE from 'three'
import { degreesToRadians, radiansToDegrees, dayLengthHours, horizontalCoordinates } from '../core/astro-math'
import { COLORS, ring, lineFromPoints, createSun, createEarth, createArrow } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, horizontalVector, riseSetMetrics, type BuildContext, type SceneVisual } from './shared'

export function createSunPath(context: BuildContext): SceneVisual {
  const realEvents = riseSetMetrics(context.astronomy, 'Sun')
  const root = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 96), new THREE.MeshStandardMaterial({ color: 0x123038, roughness: .95, transparent: true, opacity: .72, side: THREE.DoubleSide }))
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
  const summerPath = lineFromPoints([], COLORS.red, .38)
  const equinoxPath = lineFromPoints([], COLORS.cyan, .35)
  const winterPath = lineFromPoints([], COLORS.blue, .4)
  paths.add(summerPath, equinoxPath, winterPath, currentPath)
  const sun = createSun(.24)
  root.add(sun)

  const seasons = new THREE.Group()
  seasons.position.set(3.1, 1.8, -2.5)
  root.add(seasons)
  seasons.add(createSun(.25), ring(1.45, COLORS.muted, .5))
  seasons.add(new THREE.PointLight(0xffefd0, 5, 0, 2))
  const earthTilt = new THREE.Group()
  earthTilt.rotation.z = degreesToRadians(23.44)
  const earthMini = createEarth(.34, context.earthTextureUrl)
  earthTilt.add(earthMini)
  seasons.add(earthTilt)
  const axis = lineFromPoints([new THREE.Vector3(0, -.7, 0), new THREE.Vector3(0, .7, 0)], COLORS.white, .72)
  axis.userData.layer = 'paths'
  earthTilt.add(axis)
  addLabel(seasons, '地軸方向不變・23.4°', new THREE.Vector3(0, 1.3, 0), '#eef7f5', .24)
  const rays = createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1.1, COLORS.amber)
  rays.userData.layer = 'shadows'
  seasons.add(rays)
  const altitudeLine = lineFromPoints([], COLORS.amber, .6)
  altitudeLine.userData.layer = 'paths'
  root.add(altitudeLine)
  const footprint = new THREE.Mesh(new THREE.CircleGeometry(.3, 40), new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: .35, side: THREE.DoubleSide }))
  footprint.rotation.x = -Math.PI / 2
  footprint.position.y = .015
  footprint.userData.layer = 'shadows'
  root.add(footprint)

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
    root,
    cameras: [
      { id: 'horizon', label: '地面', position: new THREE.Vector3(7.6, 3.3, 7.2), target: new THREE.Vector3(0, 1.1, 0) },
      { id: 'outside', label: '側視', position: new THREE.Vector3(8.8, 1.8, 1.2), target: new THREE.Vector3(0, 1.5, 0) },
      { id: 'top', label: '俯視', position: new THREE.Vector3(0, 10, .01), target: new THREE.Vector3(0, 0, 0) }
      ,{ id: 'seasons', label: '四季太空', position: new THREE.Vector3(6.5, 4.2, 2), target: new THREE.Vector3(3.1, 1.8, -2.5) }
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
      earthTilt.position.set(Math.cos(orbitalAngle) * 1.45, 0, -Math.sin(orbitalAngle) * 1.45)
      rays.setDirection(earthTilt.position.clone().normalize())
      earthMini.rotation.y = -(state.mode === 'real' ? context.astronomy.localSiderealDegrees(instant, 0) / 360 : state.timeline) * Math.PI * 2
      altitudeLine.geometry.dispose()
      altitudeLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), sun.position])
      const irradiance = Math.max(0, Math.sin(degreesToRadians(position.altitude)))
      footprint.visible = irradiance > 0
      footprint.scale.set(Math.min(4, 1 / Math.max(.25, irradiance)), 1, 1)
      footprint.rotation.z = degreesToRadians(90 - position.azimuth)
      applyLayers(root, state)
      footprint.visible = state.layers.shadows && irradiance > 0
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
