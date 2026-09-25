import { discOverlapFraction, classifyLunarShadow, computeShadowGeometry, teachingOrbitPosition, type ShadowGeometry } from './geometry'
import { horizonDirection, shortestAzimuthTurn } from './local-horizon'
import { earthTextureSurfaceDirection, teachingEarthRotation } from './moon-observer'
import type { CartesianVector, HorizontalBodyPosition } from '../services/astronomy-provider'

const AU_KM = 149_597_870.7
const SUN_RADIUS_KM = 695_700
const EARTH_RADIUS_KM = 6_378.137
const MOON_RADIUS_KM = 1_737.4

/** Earth-centred coordinates shared with the teaching eclipse model. */
export const TEACHING_ECLIPSE = Object.freeze({
  sunDistance: 7.4, sunRadius: .72, earthRadius: .66,
  orbitRadius: 1.6, moonRadius: .25,
  annularOrbitRadius: 2, annularMoonRadius: .13
})

export interface SkyDisc {
  readonly altitude: number
  readonly azimuth: number
}

export interface SolarAppearance {
  readonly type: 'solar'
  readonly kind: 'none' | 'partial' | 'annular' | 'total'
  readonly sunAboveHorizon: boolean
  readonly visible: boolean
  readonly coverage: number
  readonly sunRadiusDegrees: number
  readonly moonRadiusDegrees: number
  /** Offset on the Sun-centred local tangent plane, for a magnified inset. */
  readonly moonOffsetXDegrees: number
  readonly moonOffsetYDegrees: number
}

export interface LunarAppearance {
  readonly type: 'lunar'
  readonly kind: 'none' | 'penumbral' | 'partial' | 'total'
  readonly visible: boolean
  readonly coverage: number
  readonly umbraRadiusInMoonRadii: number
  readonly umbraOffsetInMoonRadii: number
}

export type ObserverEclipseAppearance = SolarAppearance | LunarAppearance

function solarDiscs(sun: SkyDisc, moon: SkyDisc, sunRadiusDegrees: number, moonRadiusDegrees: number): SolarAppearance {
  const a = horizonDirection(sun.altitude, sun.azimuth)
  const b = horizonDirection(moon.altitude, moon.azimuth)
  const separation = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI
  const coverage = discOverlapFraction(sunRadiusDegrees, moonRadiusDegrees, separation)
  const central = separation <= Math.abs(sunRadiusDegrees - moonRadiusDegrees)
  const kind = coverage <= 0 ? 'none' : central ? moonRadiusDegrees >= sunRadiusDegrees ? 'total' : 'annular' : 'partial'
  return {
    type: 'solar', kind, sunAboveHorizon: sun.altitude >= 0, visible: sun.altitude >= 0 && coverage > 0, coverage,
    sunRadiusDegrees, moonRadiusDegrees,
    moonOffsetXDegrees: shortestAzimuthTurn(sun.azimuth, moon.azimuth) * Math.cos(sun.altitude * Math.PI / 180),
    moonOffsetYDegrees: moon.altitude - sun.altitude
  }
}

/** Physical topocentric discs: a global eclipse cannot appear at the wrong observer location. */
export function realSolarAppearance(sun: HorizontalBodyPosition, moon: HorizontalBodyPosition): SolarAppearance {
  const radius = (bodyRadiusKm: number, distanceAu: number) => Math.asin(bodyRadiusKm / (distanceAu * AU_KM)) * 180 / Math.PI
  return solarDiscs(sun, moon, radius(SUN_RADIUS_KM, sun.distanceAu), radius(MOON_RADIUS_KM, moon.distanceAu))
}

/** The same rays used by the space view, projected from the marked Earth location. */
export function teachingSolarView(
  phaseAngle: number, latitude: number, longitude: number, solarHour: number,
  eclipseType: number, nodeOffset: number, inclination: number
): { readonly sun: SkyDisc; readonly moon: SkyDisc; readonly appearance: SolarAppearance } {
  type Vector = { readonly x: number; readonly y: number; readonly z: number }
  const dot = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y + a.z * b.z
  const unit = (v: Vector): Vector => {
    const length = Math.hypot(v.x, v.y, v.z)
    return { x: v.x / length, y: v.y / length, z: v.z / length }
  }
  const onEarth = earthTextureSurfaceDirection(latitude, longitude)
  const rotation = teachingEarthRotation(longitude, solarHour)
  const up = unit({
    x: onEarth.x * Math.cos(rotation) + onEarth.z * Math.sin(rotation),
    y: onEarth.y,
    z: -onEarth.x * Math.sin(rotation) + onEarth.z * Math.cos(rotation)
  })
  const north = Math.abs(up.y) > .999999 ? { x: 1, y: 0, z: 0 }
    : unit({ x: -up.x * up.y, y: 1 - up.y * up.y, z: -up.z * up.y })
  const east = { x: north.y * up.z - north.z * up.y, y: north.z * up.x - north.x * up.z, z: north.x * up.y - north.y * up.x }
  const orbit = teachingOrbitPosition(phaseAngle * Math.PI / 180, inclination * Math.PI / 180, nodeOffset * Math.PI / 180,
    eclipseType === 2 ? TEACHING_ECLIPSE.annularOrbitRadius : TEACHING_ECLIPSE.orbitRadius)
  const sightline = (body: Vector) => unit({
    x: body.x - up.x * TEACHING_ECLIPSE.earthRadius,
    y: body.y - up.y * TEACHING_ECLIPSE.earthRadius,
    z: body.z - up.z * TEACHING_ECLIPSE.earthRadius
  })
  const sunBody = { x: -TEACHING_ECLIPSE.sunDistance, y: 0, z: 0 }
  const sunRay = sightline(sunBody)
  const moonRay = sightline(orbit)
  const sunDistance = Math.hypot(sunBody.x - up.x * TEACHING_ECLIPSE.earthRadius, up.y * TEACHING_ECLIPSE.earthRadius, up.z * TEACHING_ECLIPSE.earthRadius)
  const moonDistance = Math.hypot(orbit.x - up.x * TEACHING_ECLIPSE.earthRadius, orbit.y - up.y * TEACHING_ECLIPSE.earthRadius, orbit.z - up.z * TEACHING_ECLIPSE.earthRadius)
  const actualSunRadius = Math.asin(TEACHING_ECLIPSE.sunRadius / sunDistance) * 180 / Math.PI
  const actualMoonRadius = Math.asin((eclipseType === 2 ? TEACHING_ECLIPSE.annularMoonRadius : TEACHING_ECLIPSE.moonRadius) / moonDistance) * 180 / Math.PI
  // Compress the oversized model's angular scale uniformly; overlap stays unchanged.
  const displayScale = 1.08 / actualSunRadius
  const separation = Math.acos(Math.max(-1, Math.min(1, dot(sunRay, moonRay))))
  const tangent = separation > 1e-8 ? unit({
    x: moonRay.x - sunRay.x * Math.cos(separation),
    y: moonRay.y - sunRay.y * Math.cos(separation),
    z: moonRay.z - sunRay.z * Math.cos(separation)
  }) : { x: 0, y: 0, z: 0 }
  const displayMoon = unit({
    x: sunRay.x * Math.cos(separation * displayScale) + tangent.x * Math.sin(separation * displayScale),
    y: sunRay.y * Math.cos(separation * displayScale) + tangent.y * Math.sin(separation * displayScale),
    z: sunRay.z * Math.cos(separation * displayScale) + tangent.z * Math.sin(separation * displayScale)
  })
  const toSky = (ray: Vector): SkyDisc => ({
    altitude: Math.asin(Math.max(-1, Math.min(1, dot(ray, up)))) * 180 / Math.PI,
    azimuth: ((Math.atan2(dot(ray, east), dot(ray, north)) * 180 / Math.PI) + 360) % 360
  })
  const sun = toSky(sunRay)
  const moon = toSky(displayMoon)
  return { sun, moon, appearance: solarDiscs(sun, moon, 1.08, actualMoonRadius * displayScale) }
}

/** Earth's umbra is global, but the selected observer must have the Moon above the horizon. */
export function realLunarAppearance(sun: CartesianVector, moon: CartesianVector, moonAltitude: number): LunarAppearance {
  const scale = (vector: CartesianVector) => ({ x: vector.x * AU_KM, y: vector.y * AU_KM, z: vector.z * AU_KM })
  const shadow = computeShadowGeometry({
    source: scale(sun), blocker: { x: 0, y: 0, z: 0 }, target: scale(moon),
    sourceRadius: SUN_RADIUS_KM, blockerRadius: EARTH_RADIUS_KM, targetRadius: MOON_RADIUS_KM
  })
  return lunarAppearanceFromShadow(shadow, moonAltitude)
}

export function lunarAppearanceFromShadow(shadow: ShadowGeometry, moonAltitude: number): LunarAppearance {
  const classified = classifyLunarShadow(shadow)
  const kind = classified === 'miss' || classified === 'annular' ? 'none' : classified
  const coverage = shadow.umbraRadiusKm > 0
    ? discOverlapFraction(shadow.targetRadiusKm, shadow.umbraRadiusKm, shadow.axisOffsetKm)
    : 0
  return {
    type: 'lunar', kind, visible: moonAltitude >= 0 && kind !== 'none', coverage,
    umbraRadiusInMoonRadii: Math.max(0, shadow.umbraRadiusKm / shadow.targetRadiusKm),
    umbraOffsetInMoonRadii: shadow.axisOffsetKm / shadow.targetRadiusKm
  }
}

export function teachingLunarShadow(phaseAngle: number, nodeOffset: number, inclination: number): ShadowGeometry {
  return computeShadowGeometry({
    source: { x: -TEACHING_ECLIPSE.sunDistance, y: 0, z: 0 }, blocker: { x: 0, y: 0, z: 0 },
    target: teachingOrbitPosition(phaseAngle * Math.PI / 180, inclination * Math.PI / 180, nodeOffset * Math.PI / 180, TEACHING_ECLIPSE.orbitRadius),
    sourceRadius: TEACHING_ECLIPSE.sunRadius, blockerRadius: TEACHING_ECLIPSE.earthRadius, targetRadius: TEACHING_ECLIPSE.moonRadius
  })
}

export function teachingLunarAppearance(moonAltitude: number, phaseAngle: number, nodeOffset: number, inclination: number): LunarAppearance {
  return lunarAppearanceFromShadow(teachingLunarShadow(phaseAngle, nodeOffset, inclination), moonAltitude)
}
