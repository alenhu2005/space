import { discOverlapFraction, classifyLunarShadow, computeShadowGeometry, teachingOrbitPosition, type ShadowGeometry } from './geometry'
import { horizonDirection, shortestAzimuthTurn } from './local-horizon'
import type { CartesianVector, HorizontalBodyPosition } from '../services/astronomy-provider'

const AU_KM = 149_597_870.7
const SUN_RADIUS_KM = 695_700
const EARTH_RADIUS_KM = 6_378.137
const MOON_RADIUS_KM = 1_737.4

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

/** Deliberately enlarged teaching discs, with the node offset moving the Moon off-centre. */
export function teachingSolarAppearance(sun: SkyDisc, moon: SkyDisc, eclipseType: number, nodeOffset: number, inclination: number): SolarAppearance {
  const moonRadius = eclipseType === 2 ? .77 : eclipseType === 0 ? 1.25 : 1.02
  // The teaching shadow axis meets the subsolar equator. The teaching discs
  // are about four times their real angular size, so scale lunar parallax too;
  // otherwise nearly every daylight location falsely lies in the penumbra.
  const offset = Math.sin(nodeOffset * Math.PI / 180) * Math.min(1.35, inclination * .052)
    - Math.sin((90 - sun.altitude) * Math.PI / 180) * 3.7
  return solarDiscs(sun, { altitude: moon.altitude + offset, azimuth: moon.azimuth }, 1.08, moonRadius)
}

/** Earth's umbra is global, but the selected observer must have the Moon above the horizon. */
export function realLunarAppearance(sun: CartesianVector, moon: CartesianVector, moonAltitude: number): LunarAppearance {
  const scale = (vector: CartesianVector) => ({ x: vector.x * AU_KM, y: vector.y * AU_KM, z: vector.z * AU_KM })
  const shadow = computeShadowGeometry({
    source: scale(sun), blocker: { x: 0, y: 0, z: 0 }, target: scale(moon),
    sourceRadius: SUN_RADIUS_KM, blockerRadius: EARTH_RADIUS_KM, targetRadius: MOON_RADIUS_KM
  })
  return lunarAppearance(shadow, moonAltitude)
}

function lunarAppearance(shadow: ShadowGeometry, moonAltitude: number): LunarAppearance {
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
    source: { x: -7.4, y: 0, z: 0 }, blocker: { x: 0, y: 0, z: 0 },
    target: teachingOrbitPosition(phaseAngle * Math.PI / 180, inclination * Math.PI / 180, nodeOffset * Math.PI / 180, 1.6),
    sourceRadius: .72, blockerRadius: .66, targetRadius: .25
  })
}

export function teachingLunarAppearance(moonAltitude: number, phaseAngle: number, nodeOffset: number, inclination: number): LunarAppearance {
  return lunarAppearance(teachingLunarShadow(phaseAngle, nodeOffset, inclination), moonAltitude)
}
