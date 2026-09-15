import * as THREE from 'three'
import { degreesToRadians } from '../core/astro-math'
import { BRIGHT_STARS } from '../data/bright-stars'
import { COLORS, ring, lineFromPoints } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, horizontalVector, type BuildContext, type SceneVisual } from './shared'

const DISPLAY_STARS = BRIGHT_STARS.slice(0, 128)

export function createCelestialSphere(context: BuildContext): SceneVisual {
  const root = new THREE.Group()
  const horizon = new THREE.Mesh(
    new THREE.CircleGeometry(4.05, 96),
    new THREE.MeshBasicMaterial({ color: 0x15333b, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false })
  )
  horizon.rotation.x = -Math.PI / 2
  root.add(horizon, ring(4.05, COLORS.cyan, .82), ring(4.5, COLORS.muted, .16, 'xy'), ring(4.5, COLORS.muted, .16, 'yz'))

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0x4f7880, wireframe: true, transparent: true, opacity: .07, side: THREE.DoubleSide })
  )
  shell.userData.layer = 'paths'
  root.add(shell)

  addLabel(root, '北 N', new THREE.Vector3(0, .08, -4.5), '#eef7f5')
  addLabel(root, '南 S', new THREE.Vector3(0, .08, 4.5), '#8fa3a4')
  addLabel(root, '東 E', new THREE.Vector3(4.5, .08, 0), '#8fa3a4')
  addLabel(root, '西 W', new THREE.Vector3(-4.5, .08, 0), '#8fa3a4')
  addLabel(root, '天頂', new THREE.Vector3(0, 4.65, 0), '#55d9d0')
  addLabel(root, '天底', new THREE.Vector3(0, -4.65, 0), '#8fa3a4')
  addLabel(root, '子午圈', new THREE.Vector3(0, 3.6, -3), '#8fa3a4', .25)

  const sky = new THREE.Group()
  const equator = ring(4.44, COLORS.cyan, .52)
  equator.userData.layer = 'paths'
  sky.add(equator)
  addLabel(sky, '天球赤道', new THREE.Vector3(4.4, .1, 0), '#55d9d0', .25)
  const ecliptic = ring(4.38, COLORS.amber, .62)
  ecliptic.rotation.x = degreesToRadians(23.44)
  ecliptic.userData.layer = 'paths'
  sky.add(ecliptic)
  addLabel(ecliptic, '黃道', new THREE.Vector3(-4.35, .1, 0), '#f7b955', .25)

  const axis = lineFromPoints([new THREE.Vector3(0, -4.9, 0), new THREE.Vector3(0, 4.9, 0)], COLORS.white, .72)
  axis.userData.layer = 'paths'
  sky.add(axis)
  addLabel(sky, '北天極', new THREE.Vector3(0, 5.05, 0), '#55d9d0')
  addLabel(sky, '南天極', new THREE.Vector3(0, -5.05, 0), '#8fa3a4')

  const positions: number[] = []
  const colors: number[] = []
  for (const star of DISPLAY_STARS) {
    const ra = degreesToRadians(star.ra * 15)
    const dec = degreesToRadians(star.dec)
    positions.push(Math.cos(dec) * Math.cos(ra) * 4.38, Math.sin(dec) * 4.38, -Math.cos(dec) * Math.sin(ra) * 4.38)
    const color = new THREE.Color(star.spectral.startsWith('M') || star.spectral.startsWith('K') ? 0xffbe8a : star.spectral.startsWith('B') ? 0xa9c9ff : 0xf6f1df)
    color.multiplyScalar(Math.min(1, Math.pow(10, -.15 * (star.magnitude + 1.4))))
    colors.push(color.r, color.g, color.b)
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: .13, vertexColors: true, transparent: true, opacity: .96, sizeAttenuation: true }))
  sky.add(stars)

  for (const star of BRIGHT_STARS.filter((item) => ['北極星', '天狼星', '大角星', '織女星', '老人星'].includes(item.name))) {
    const ra = degreesToRadians(star.ra * 15)
    const dec = degreesToRadians(star.dec)
    addLabel(sky, star.name, new THREE.Vector3(Math.cos(dec) * Math.cos(ra) * 4.62, Math.sin(dec) * 4.62, -Math.cos(dec) * Math.sin(ra) * 4.62), '#dcebea', .25)
  }

  for (const declination of [-60, -30, 30, 60]) {
    const radius = Math.cos(degreesToRadians(declination)) * 4.44
    const trail = ring(radius, COLORS.orbit, .16)
    trail.position.y = Math.sin(degreesToRadians(declination)) * 4.44
    trail.userData.layer = 'paths'
    sky.add(trail)
  }
  root.add(sky)
  const realSky = new THREE.Group()
  root.add(realSky)
  const realStarGeometry = starGeometry.clone()
  const realStars = new THREE.Points(realStarGeometry, stars.material.clone())
  realSky.add(realStars)
  const namedRealStars = BRIGHT_STARS.filter((star) => ['北極星', '天狼星', '大角星', '織女星', '老人星'].includes(star.name)).map((star) => ({ star, label: addLabel(realSky, star.name, new THREE.Vector3(), '#dcebea', .25) }))
  const bodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const
  const bodyNames = ['太陽', '月球', '水星', '金星', '火星', '木星', '土星']
  const bodyMarkers = bodies.map((body, index) => {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(body === 'Sun' || body === 'Moon' ? .08 : .045, 16, 12), new THREE.MeshBasicMaterial({ color: body === 'Sun' ? COLORS.amber : COLORS.white }))
    realSky.add(marker)
    const label = addLabel(marker, bodyNames[index]!, new THREE.Vector3(0, .18, 0), '#f7b955', .23)
    return { body, marker, label }
  })
  let realKey = ''

  return {
    root,
    cameras: [
      { id: 'inside', label: '天球內', position: new THREE.Vector3(0, .02, .01), target: new THREE.Vector3(0, .8, -2) },
      { id: 'outside', label: '天球外', position: new THREE.Vector3(10, 7.25, 10), target: new THREE.Vector3(0, .5, 0) },
      { id: 'horizon', label: '地平視角', position: new THREE.Vector3(7.2, 1.15, 7.2), target: new THREE.Vector3(0, 1, 0) }
    ],
    update(state) {
      const latitude = state.mode === 'real' ? state.observer.latitude : parameter(state, context.definition, 'latitude')
      const sidereal = state.mode === 'real'
        ? context.astronomy.localSiderealDegrees(new Date(state.instant), state.observer.longitude)
        : (state.timeline * 360 + parameter(state, context.definition, 'annualDay') * .985647) % 360
      // Local frame: +X east, +Y zenith, -Z north. RA=0 transits at LST=0.
      sky.rotation.set(degreesToRadians(latitude - 90), degreesToRadians(-90 - sidereal), 0, 'XYZ')
      realSky.visible = state.mode === 'real'
      stars.visible = state.mode !== 'real'
      sky.children.filter((child) => child instanceof THREE.Sprite && namedRealStars.some(({ star }) => child.userData.text === star.name)).forEach((label) => { label.visible = state.mode !== 'real' })
      const nextKey = `${state.instant.slice(0, 16)}-${state.observer.latitude}-${state.observer.longitude}-${state.cameraPreset}`
      if (state.mode === 'real' && realKey !== nextKey) {
        const instant = new Date(state.instant)
        const positions = realStarGeometry.getAttribute('position') as THREE.BufferAttribute
        DISPLAY_STARS.forEach((star, index) => {
          const position = context.astronomy.starHorizontalPosition({ rightAscensionHours: star.ra, declinationDegrees: star.dec, properMotionRaMasYear: star.properMotionRaMasYear, properMotionDecMasYear: star.properMotionDecMasYear }, instant, state.observer)
          const vector = horizontalVector(position.altitude, position.azimuth, 4.38)
          positions.setXYZ(index, vector.x, vector.y, vector.z)
        })
        positions.needsUpdate = true
        realStars.material.clippingPlanes = state.cameraPreset !== 'outside' ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)] : []
        realStars.material.needsUpdate = true
        for (const { star, label } of namedRealStars) {
          const position = context.astronomy.starHorizontalPosition({ rightAscensionHours: star.ra, declinationDegrees: star.dec, properMotionRaMasYear: star.properMotionRaMasYear, properMotionDecMasYear: star.properMotionDecMasYear }, instant, state.observer)
          label.position.copy(horizontalVector(position.altitude, position.azimuth, 4.6))
          label.userData.belowHorizon = position.altitude < 0 && state.cameraPreset !== 'outside'
        }
        for (const { body, marker, label } of bodyMarkers) {
          const position = context.astronomy.horizontalPosition(body, instant, state.observer)
          marker.position.copy(horizontalVector(position.altitude, position.azimuth, 4.33))
          marker.visible = position.altitude >= 0 || state.cameraPreset === 'outside'
          label.userData.belowHorizon = !marker.visible
        }
        realKey = nextKey
      }
      applyLayers(root, state)
      sky.children.filter((child) => child instanceof THREE.Sprite && namedRealStars.some(({ star }) => child.userData.text === star.name)).forEach((label) => { label.visible = state.layers.labels && state.mode !== 'real'; label.userData.modeHidden = state.mode === 'real' })
      return [
        { label: '緯度', value: `${Math.abs(latitude).toFixed(1)}°${latitude >= 0 ? 'N' : 'S'}` },
        { label: '恆星時角', value: `${sidereal.toFixed(1)}°` },
        { label: '拱極界', value: latitude === 0 ? '赤道無拱極星' : `${latitude >= 0 ? '北' : '南'}赤緯 > ${Math.max(0, 90 - Math.abs(latitude)).toFixed(1)}°` },
        { label: '觀察約定', value: '忽略日光散射・523 顆資料／128 顆顯示' }
      ]
    }
  }
}
