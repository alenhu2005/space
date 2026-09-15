import * as THREE from 'three'
import { degreesToRadians, moonPhaseFromAngle } from '../core/astro-math'
import { COLORS, ring, createSun, createEarth, createMoon, createArrow } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, riseSetMetrics, sunAlignedVector, type BuildContext, type SceneVisual } from './shared'

function createPhaseDisc(textureUrl: string): { readonly element: HTMLElement; update(angle: number): void } {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d', { alpha: true })
  const element = document.createElement('div')
  element.className = 'scene-inset'
  element.innerHTML = '<p>地面所見月面</p><span>北向上示意・非視直徑</span>'
  canvas.setAttribute('aria-label', '地球觀察者所見的月面亮暗，北向上示意')
  element.prepend(canvas)
  let lastAngle = Number.NaN
  let moonPixels: ImageData | undefined
  let redraw: (angle: number) => void = () => undefined
  const materialImage = new Image()
  materialImage.onload = () => {
    const map = document.createElement('canvas')
    map.width = 512
    map.height = 256
    const mapContext = map.getContext('2d')
    if (mapContext) { mapContext.drawImage(materialImage, 0, 0, 512, 256); moonPixels = mapContext.getImageData(0, 0, 512, 256) }
    const angle = lastAngle
    lastAngle = NaN
    if (Number.isFinite(angle)) redraw(angle)
  }
  materialImage.src = textureUrl
  return {
    element,
    update(angle) {
      redraw = this.update.bind(this)
      if (!context) return
      if (Math.abs(angle - lastAngle) < .5) return
      lastAngle = angle
      const image = context.createImageData(256, 256)
      const light = new THREE.Vector3(Math.sin(degreesToRadians(angle)), 0, -Math.cos(degreesToRadians(angle))).normalize()
      for (let y = 0; y < 256; y += 1) {
        for (let x = 0; x < 256; x += 1) {
          const nx = (x - 128) / 112
          const ny = (128 - y) / 112
          const rr = nx * nx + ny * ny
          const index = (y * 256 + x) * 4
          if (rr <= 1) {
            const nz = Math.sqrt(1 - rr)
            const diffuse = Math.max(0, nx * light.x + nz * light.z)
            const u = Math.floor((.5 + Math.atan2(nx, nz) / (Math.PI * 2)) * 512) % 512
            const v = Math.max(0, Math.min(255, Math.floor((.5 - Math.asin(ny) / Math.PI) * 256)))
            const albedo = moonPixels ? moonPixels.data[(v * 512 + u) * 4]! / 255 : .8
            const value = Math.round(14 + diffuse * 255 * albedo)
            image.data[index] = value
            image.data[index + 1] = value
            image.data[index + 2] = Math.min(255, value + 7)
            image.data[index + 3] = 255
          }
        }
      }
      context.putImageData(image, 0, 0)
    }
  }
}

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
    cameraScale: (state) => parameter(state, context.definition, 'scaleMode') === 1 ? 1.55 : 1,
    cameras: [
      { id: 'top', label: '太空俯視', position: new THREE.Vector3(0, 9.5, .01), target: new THREE.Vector3(0, .3, 0) },
      { id: 'angled', label: '斜視', position: new THREE.Vector3(7.5, 5.8, 7), target: new THREE.Vector3(0, .4, 0) },
      { id: 'earth', label: '地球旁', position: new THREE.Vector3(1.4, 1.2, 5.5), target: new THREE.Vector3(0, 0, 0) }
    ],
    update(state) {
      const phaseAngle = state.mode === 'real' ? context.astronomy.moonPhaseAngle(new Date(state.instant)) : state.timeline * 360
      const inclination = degreesToRadians(state.mode === 'real' ? 5.145 : parameter(state, context.definition, 'inclination'))
      const angle = degreesToRadians(phaseAngle)
      const trueScale = parameter(state, context.definition, 'scaleMode') === 1
      const earthRadius = trueScale ? .08 : .78
      const distanceKm = state.mode === 'real' ? Math.hypot(...Object.values(context.astronomy.geocentricVector('Moon', new Date(state.instant)))) * 149597870.7 : 384400
      const orbitRadius = trueScale ? earthRadius * distanceKm / 6378.137 : 3
      earth.scale.setScalar(earthRadius / .78)
      moon.scale.setScalar(trueScale ? earthRadius * 1737.4 / 6378.137 / .3 : 1)
      orbit.scale.setScalar(orbitRadius / 3)
      orbit.rotation.x = -inclination
      moon.position.set(-Math.cos(angle) * orbitRadius, Math.sin(angle) * Math.sin(inclination) * orbitRadius, Math.sin(angle) * Math.cos(inclination) * orbitRadius)
      if (state.mode === 'real') {
        const instant = new Date(state.instant)
        const vector = context.astronomy.geocentricVector('Moon', instant)
        moon.position.copy(sunAlignedVector(vector, context.astronomy.geocentricVector('Sun', instant)).normalize().multiplyScalar(orbitRadius))
      }
      moon.lookAt(earth.position)
      faceMarker.position.copy(moon.position)
      faceMarker.setDirection(earth.position.clone().sub(moon.position).normalize())
      faceMarker.setLength(trueScale ? .18 : .65)
      earth.rotation.y = -(state.mode === 'real' ? context.astronomy.localSiderealDegrees(new Date(state.instant), 0) / 360 : state.timeline * 29.53059) * Math.PI * 2
      const illumination = state.mode === 'real' ? context.astronomy.moonIlluminationFraction(new Date(state.instant)) : moonPhaseFromAngle(phaseAngle).illumination
      const discPhase = Math.acos(1 - 2 * illumination) * 180 / Math.PI
      phaseDisc.update(phaseAngle <= 180 ? discPhase : 360 - discPhase)
      applyLayers(root, state)
      const phase = moonPhaseFromAngle(phaseAngle)
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
