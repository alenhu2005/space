import * as THREE from 'three'
import { keplerPosition, keplerVelocity, orbitalPeriodYears } from '../core/astro-math'
import { sweptArea } from '../core/geometry'
import { COLORS, lineFromPoints, createSun, createEarth, createArrow, disposeObject } from '../rendering/helpers'
import { addLabel, parameter, applyLayers, type BuildContext, type SceneVisual } from './shared'

const PLANETS = [
  { body: 'Mercury', name: '水星', a: .3871, e: .2056, color: 0xaaa69b },
  { body: 'Venus', name: '金星', a: .7233, e: .0068, color: 0xe2c389 },
  { body: 'Earth', name: '地球', a: 1, e: .0167, color: 0x4fa3ff },
  { body: 'Mars', name: '火星', a: 1.5237, e: .0934, color: 0xd86d43 },
  { body: 'Jupiter', name: '木星', a: 5.2029, e: .0484, color: 0xdbba93 },
  { body: 'Saturn', name: '土星', a: 9.537, e: .0542, color: 0xe2cf9e }
] as const

function sectorGeometry(eccentricity: number, semiMajor: number, fromMean: number, toMean: number): THREE.BufferGeometry {
  const points = [new THREE.Vector3(0, .02, 0)]
  const steps = 26
  for (let index = 0; index <= steps; index += 1) {
    const mean = fromMean + (toMean - fromMean) * index / steps
    const point = keplerPosition(mean, eccentricity, semiMajor)
    points.push(new THREE.Vector3(point.x, .02, point.y))
  }
  const vertices: number[] = []
  for (let index = 1; index < points.length - 1; index += 1) {
    const a = points[0]
    const b = points[index]
    const c = points[index + 1]
    if (a && b && c) vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  return geometry
}

export function createKepler(context: BuildContext): SceneVisual {
  const root = new THREE.Group()
  const sun = createSun(.38)
  root.add(sun)
  const referenceEarth = createEarth(.3, context.earthTextureUrl)
  root.add(referenceEarth)
  const planet = new THREE.Mesh(new THREE.SphereGeometry(.22, 36, 24), new THREE.MeshStandardMaterial({ color: 0xd86d43, roughness: .7 }))
  root.add(planet)
  const orbit = lineFromPoints([], COLORS.cyan, .78)
  orbit.userData.layer = 'paths'
  root.add(orbit)
  const secondFocus = new THREE.Mesh(new THREE.SphereGeometry(.07, 18, 12), new THREE.MeshBasicMaterial({ color: COLORS.red }))
  secondFocus.userData.layer = 'paths'
  root.add(secondFocus)
  addLabel(secondFocus, '另一焦點', new THREE.Vector3(0, .38, 0), '#f2766b', .24)
  const velocity = createArrow(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, COLORS.amber)
  velocity.userData.layer = 'paths'
  root.add(velocity)
  const sectors = new THREE.Group()
  sectors.userData.layer = 'paths'
  root.add(sectors)
  const comparison = new THREE.Group()
  comparison.userData.layer = 'paths'
  root.add(comparison)
  const halfAxis = lineFromPoints([], COLORS.white, .5)
  halfAxis.userData.layer = 'paths'
  root.add(halfAxis)
  addLabel(halfAxis, '半長軸 a', new THREE.Vector3(0, .32, 0), '#dcebea', .24)
  let cached = ''

  const rebuild = (eccentricity: number, semiMajor: number, viewMode: number): void => {
    const points = Array.from({ length: 241 }, (_, index) => {
      const point = keplerPosition(index / 240 * Math.PI * 2, eccentricity, semiMajor)
      return new THREE.Vector3(point.x, 0, point.y)
    })
    orbit.geometry.dispose()
    orbit.geometry = new THREE.BufferGeometry().setFromPoints(points)
    secondFocus.position.set(-2 * semiMajor * eccentricity, 0, 0)
    halfAxis.geometry.dispose()
    halfAxis.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-semiMajor * eccentricity, 0, 0), new THREE.Vector3(semiMajor * (1 - eccentricity), 0, 0)])
    halfAxis.children[0]?.position.set(semiMajor * (.5 - eccentricity), .3, 0)
    disposeObject(sectors)
    sectors.clear()
    const first = new THREE.Mesh(sectorGeometry(eccentricity, semiMajor, 0, .55), new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false }))
    const second = new THREE.Mesh(sectorGeometry(eccentricity, semiMajor, Math.PI, Math.PI + .55), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false }))
    sectors.add(first, second)
    disposeObject(comparison)
    comparison.clear()
    if (viewMode === 1) {
      for (const { a, e, color, name, body: bodyName } of PLANETS.slice(0, 4)) {
        const radius = a * 2
        const path = lineFromPoints(Array.from({ length: 181 }, (_, index) => {
          const point = keplerPosition(index / 180 * Math.PI * 2, e, radius)
          return new THREE.Vector3(point.x, 0, point.y)
        }), color, .38)
        path.userData.bodyName = bodyName
        comparison.add(path)
        const body = new THREE.Mesh(new THREE.SphereGeometry(.13, 24, 16), new THREE.MeshStandardMaterial({ color }))
        body.userData.orbitRadius = a
        body.userData.bodyName = bodyName
        body.userData.eccentricity = e
        comparison.add(body)
        addLabel(comparison, `${name} ${orbitalPeriodYears(a).toFixed(2)} 年`, new THREE.Vector3(radius, .24, 0), '#8fa3a4', .23)
      }
    }
    if (viewMode === 2) {
      const retrogradePoints: THREE.Vector3[] = []
      for (let day = 0; day <= 780; day += 4) {
        const earthAngle = day / 365.25 * Math.PI * 2
        const marsAngle = day / 686.98 * Math.PI * 2 + 1.5
        const earthPosition = new THREE.Vector3(Math.cos(earthAngle) * 1.8, .04, Math.sin(earthAngle) * 1.8)
        const marsPosition = new THREE.Vector3(Math.cos(marsAngle) * 1.8 * 1.5237, .04, Math.sin(marsAngle) * 1.8 * 1.5237)
        retrogradePoints.push(marsPosition.sub(earthPosition).multiplyScalar(.68))
      }
      comparison.add(lineFromPoints(retrogradePoints, COLORS.red, .72))
      addLabel(comparison, '從地球看見的火星迴圈', new THREE.Vector3(0, .35, 3.7), '#f2766b', .28)
    }
  }

  return {
    root,
    cameraScale(state) {
      const viewMode = parameter(state, context.definition, 'viewMode')
      if (viewMode > 0) return 1
      const realPlanet = PLANETS[parameter(state, context.definition, 'planetIndex')] ?? PLANETS[3]
      const a = state.mode === 'real' ? realPlanet.a * 2 : parameter(state, context.definition, 'semiMajor')
      const e = state.mode === 'real' ? realPlanet.e : parameter(state, context.definition, 'eccentricity')
      return Math.max(1, a * (1 + e) / 4.5)
    },
    cameras: [
      { id: 'top', label: '軌道俯視', position: new THREE.Vector3(0, 10, .01), target: new THREE.Vector3(-.5, 0, 0) },
      { id: 'angled', label: '面積斜視', position: new THREE.Vector3(7, 6.5, 7), target: new THREE.Vector3(-.4, 0, 0) },
      { id: 'side', label: '軌道側視', position: new THREE.Vector3(8, 2.4, 1.5), target: new THREE.Vector3(-.5, 0, 0) }
    ],
    update(state) {
      const selectedPlanet = PLANETS[parameter(state, context.definition, 'planetIndex')] ?? PLANETS[3]
      const eccentricity = state.mode === 'real' ? selectedPlanet.e : parameter(state, context.definition, 'eccentricity')
      const semiMajor = state.mode === 'real' ? selectedPlanet.a : parameter(state, context.definition, 'semiMajor')
      const viewMode = parameter(state, context.definition, 'viewMode')
      const cacheKey = `${state.mode}-${eccentricity.toFixed(3)}-${semiMajor.toFixed(3)}-${viewMode}-${state.mode === 'real' ? state.instant.slice(0, 7) : ''}`
      if (cacheKey !== cached) {
        rebuild(eccentricity, semiMajor, viewMode)
        if (state.mode === 'real') {
          const start = Date.parse(state.instant)
          const points = Array.from({ length: 100 }, (_, index) => {
            const vector = context.astronomy.heliocentricVector(selectedPlanet.body, new Date(start + index / 99 * orbitalPeriodYears(semiMajor) * 365.25 * 86400000))
            return new THREE.Vector3(vector.x * 2, vector.z * 2, -vector.y * 2)
          })
          orbit.geometry.dispose()
          orbit.geometry = new THREE.BufferGeometry().setFromPoints(points)
          if (viewMode === 1) {
            comparison.children.forEach((object) => {
              if (!(object instanceof THREE.Line) || !object.userData.bodyName) return
              const body = PLANETS.find((planet) => planet.body === object.userData.bodyName)!
              const points = Array.from({ length: 100 }, (_, index) => {
                const vector = context.astronomy.heliocentricVector(body.body, new Date(start + index / 99 * orbitalPeriodYears(body.a) * 365.25 * 86400000))
                return new THREE.Vector3(vector.x * 2, vector.z * 2, -vector.y * 2)
              })
              object.geometry.dispose()
              object.geometry = new THREE.BufferGeometry().setFromPoints(points)
            })
          }
          if (viewMode === 2) {
            const track = comparison.children.find((child) => child instanceof THREE.Line) as THREE.Line | undefined
            if (track) {
              const retrogradePoints = Array.from({ length: 196 }, (_, index) => {
                const instant = new Date(start + index * 4 * 86400000)
                const mars = context.astronomy.heliocentricVector('Mars', instant)
                const earth = context.astronomy.heliocentricVector('Earth', instant)
                return new THREE.Vector3((mars.x - earth.x) * 1.5, (mars.z - earth.z) * 1.5, -(mars.y - earth.y) * 1.5)
              })
              track.geometry.dispose()
              track.geometry = new THREE.BufferGeometry().setFromPoints(retrogradePoints)
            }
          }
        }
        cached = cacheKey
      }
      let point = keplerPosition(state.timeline * Math.PI * 2, eccentricity, semiMajor)
      if (state.mode === 'real') {
        const real = context.astronomy.heliocentricVector(selectedPlanet.body, new Date(state.instant))
        point = { ...point, x: real.x * 2, y: -real.y * 2, radius: Math.hypot(real.x, real.y, real.z) }
      }
      planet.position.set(point.x, 0, point.y)
      referenceEarth.visible = viewMode === 2
      sun.visible = viewMode !== 2
      if (viewMode === 1) {
        comparison.children.forEach((object) => {
          const radius = object.userData.orbitRadius as number | undefined
          if (radius) {
            const angle = state.timeline * Math.PI * 2 * 8 / orbitalPeriodYears(radius)
            const point = keplerPosition(angle, object.userData.eccentricity as number, radius * 2)
            object.position.set(point.x, 0, point.y)
            if (state.mode === 'real') {
              const body = PLANETS.find((planet) => planet.body === object.userData.bodyName)!
              const vector = context.astronomy.heliocentricVector(body.body, new Date(state.instant))
              object.position.set(vector.x * 2, vector.z * 2, -vector.y * 2)
            }
          }
        })
        planet.visible = false
      } else planet.visible = true
      if (viewMode === 2) {
        const day = state.timeline * 780
        const earthAngle = day / 365.25 * Math.PI * 2
        const marsAngle = day / 686.98 * Math.PI * 2 + 1.5
        planet.position.set((Math.cos(marsAngle) * 1.8 * 1.5237 - Math.cos(earthAngle) * 1.8) * .68, 0, (Math.sin(marsAngle) * 1.8 * 1.5237 - Math.sin(earthAngle) * 1.8) * .68)
        if (state.mode === 'real') {
          const mars = context.astronomy.heliocentricVector('Mars', new Date(state.instant))
          const earth = context.astronomy.heliocentricVector('Earth', new Date(state.instant))
          planet.position.set((mars.x - earth.x) * 1.5, (mars.z - earth.z) * 1.5, -(mars.y - earth.y) * 1.5)
        }
      }
      const orbitalVelocity = keplerVelocity(state.timeline * Math.PI * 2, eccentricity, semiMajor)
      const velocityDirection = new THREE.Vector3(orbitalVelocity.x, 0, orbitalVelocity.y).normalize()
      velocity.position.copy(planet.position)
      velocity.setDirection(velocityDirection)
      const relativeSpeed = orbitalVelocity.speed
      velocity.setLength(Math.min(2, relativeSpeed * 1.2), .16, .09)
      const planetMaterial = planet.material as THREE.MeshStandardMaterial
      planetMaterial.color.set(state.mode === 'real' && viewMode !== 2 ? selectedPlanet.color : 0xd86d43)
      applyLayers(root, state)
      halfAxis.visible = state.layers.paths && viewMode === 0 && state.mode === 'teaching'
      if (viewMode > 0) {
        orbit.visible = false
        sectors.visible = false
        secondFocus.visible = false
        velocity.visible = false
      }
      if (state.mode === 'real') {
        sectors.visible = false
        secondFocus.visible = false
        velocity.visible = false
        if (viewMode === 0) {
          const real = context.astronomy.heliocentricVector(selectedPlanet.body, new Date(state.instant))
          planet.position.y = real.z * 2
        }
      }
      if (viewMode === 1) return [
        { label: '參考系', value: '日心・行星比較' },
        ...PLANETS.slice(0, 4).map((body) => ({ label: `${body.name} a／T`, value: `${body.a.toFixed(3)} AU／${orbitalPeriodYears(body.a).toFixed(2)} 年` })),
        { label: 'T²／a³', value: '1 年²／AU³' }
      ]
      if (viewMode === 2) return [
        { label: '參考系', value: '地心・火星逆行' },
        { label: '地球／火星週期', value: '1.00／1.88 年' },
        { label: '逆行原因', value: '地球在內側追過火星' },
        { label: '模型約定', value: state.mode === 'real' ? '實際三維軌道' : '近圓軌道・非等比例' }
      ]
      return [
        { label: '離心率 e', value: eccentricity.toFixed(2) },
        { label: '半長軸 a', value: `${semiMajor.toFixed(1)} AU` },
        { label: '公轉週期', value: `${orbitalPeriodYears(semiMajor).toFixed(2)} 年` },
        { label: '日距', value: `${point.radius.toFixed(2)} AU` },
        ...(state.mode === 'teaching' && viewMode === 0 ? [
          { label: '兩扇形各掃過', value: `${sweptArea(semiMajor, eccentricity, .55).toFixed(3)} AU²` },
          { label: '各段 Δt', value: `${(orbitalPeriodYears(semiMajor) * 365.25 * .55 / (2 * Math.PI)).toFixed(1)} 天` },
          { label: '軌道速率・近似', value: `${(relativeSpeed * 29.78).toFixed(1)} km/s` }
        ] : [{ label: '參考系', value: viewMode === 2 ? '地心・火星逆行' : viewMode === 1 ? '日心・四顆內行星' : `日心・${selectedPlanet.name}` }])
      ]
    }
  }
}
