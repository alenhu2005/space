import { normalizeDegrees } from './astro-math'

export interface PhysicalVector { readonly x: number; readonly y: number; readonly z: number }

/** All coordinates and radii are kilometres in one common Cartesian frame. */
export interface ShadowGeometryInput {
  readonly source: PhysicalVector
  readonly blocker: PhysicalVector
  readonly target: PhysicalVector
  readonly sourceRadius: number
  readonly blockerRadius: number
  readonly targetRadius: number
}

export interface ShadowGeometry {
  readonly axis: PhysicalVector
  readonly separationKm: number
  readonly axialDistanceKm: number
  readonly axisOffsetKm: number
  readonly umbraRadiusKm: number
  readonly penumbraRadiusKm: number
  readonly apexDistanceKm: number
  readonly targetRadiusKm: number
  readonly targetFacingUmbraRadiusKm: number
}

export type ShadowClassification = 'miss' | 'total' | 'partial' | 'annular' | 'penumbral'

/** Straight-ray, finite-source cones; Earth's atmospheric enlargement is excluded. */
export function computeShadowGeometry(input: ShadowGeometryInput): ShadowGeometry {
  const values = [input.source, input.blocker, input.target].flatMap(v => [v.x, v.y, v.z])
  if (![...values, input.sourceRadius, input.blockerRadius, input.targetRadius].every(Number.isFinite)
    || Math.min(input.sourceRadius, input.blockerRadius, input.targetRadius) <= 0) {
    throw new RangeError('Shadow coordinates must be finite and radii positive.')
  }
  const delta = { x: input.blocker.x - input.source.x, y: input.blocker.y - input.source.y, z: input.blocker.z - input.source.z }
  const separationKm = Math.hypot(delta.x, delta.y, delta.z)
  if (separationKm <= input.sourceRadius + input.blockerRadius) throw new RangeError('Source and blocker must not overlap.')
  const axis = { x: delta.x / separationKm, y: delta.y / separationKm, z: delta.z / separationKm }
  const targetDelta = { x: input.target.x - input.blocker.x, y: input.target.y - input.blocker.y, z: input.target.z - input.blocker.z }
  const axialDistanceKm = targetDelta.x * axis.x + targetDelta.y * axis.y + targetDelta.z * axis.z
  const axisOffsetKm = Math.hypot(targetDelta.x - axialDistanceKm * axis.x, targetDelta.y - axialDistanceKm * axis.y, targetDelta.z - axialDistanceKm * axis.z)
  const facingDistance = axialDistanceKm - Math.sqrt(Math.max(0, input.targetRadius ** 2 - axisOffsetKm ** 2))
  return {
    axis, separationKm, axialDistanceKm, axisOffsetKm,
    umbraRadiusKm: shadowRadius(input.sourceRadius, input.blockerRadius, separationKm, axialDistanceKm, false),
    penumbraRadiusKm: shadowRadius(input.sourceRadius, input.blockerRadius, separationKm, axialDistanceKm, true),
    apexDistanceKm: input.sourceRadius > input.blockerRadius ? input.blockerRadius * separationKm / (input.sourceRadius - input.blockerRadius) : Infinity,
    targetRadiusKm: input.targetRadius,
    targetFacingUmbraRadiusKm: shadowRadius(input.sourceRadius, input.blockerRadius, separationKm, facingDistance, false)
  }
}

/** Global solar type means a total/annular shadow touches some part of the target sphere. */
export function classifySolarShadow(shadow: ShadowGeometry): ShadowClassification {
  if (shadow.axialDistanceKm <= 0 || shadow.axisOffsetKm >= shadow.penumbraRadiusKm + shadow.targetRadiusKm) return 'miss'
  const centralRadius = shadow.targetFacingUmbraRadiusKm
  if (shadow.axisOffsetKm < shadow.targetRadiusKm + Math.abs(centralRadius)) return centralRadius >= 0 ? 'total' : 'annular'
  return 'partial'
}

/** Lunar type instead measures how much of the target Moon is immersed in Earth's shadow. */
export function classifyLunarShadow(shadow: ShadowGeometry): ShadowClassification {
  if (shadow.axialDistanceKm <= 0 || shadow.axisOffsetKm >= shadow.penumbraRadiusKm + shadow.targetRadiusKm) return 'miss'
  if (shadow.umbraRadiusKm > 0) {
    if (shadow.axisOffsetKm + shadow.targetRadiusKm <= shadow.umbraRadiusKm) return 'total'
    if (shadow.axisOffsetKm < shadow.umbraRadiusKm + shadow.targetRadiusKm) return 'partial'
  }
  return 'penumbral'
}

/** Fraction of source disc covered by blocker; radii/separation share angular or linear units. */
export function discOverlapFraction(sourceRadius: number, blockerRadius: number, separation: number): number {
  if (![sourceRadius, blockerRadius, separation].every(Number.isFinite) || sourceRadius <= 0 || blockerRadius <= 0 || separation < 0) return 0
  if (separation >= sourceRadius + blockerRadius) return 0
  if (separation <= Math.abs(sourceRadius - blockerRadius)) return Math.min(1, blockerRadius ** 2 / sourceRadius ** 2)
  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  const sourceAngle = Math.acos(clamp((separation ** 2 + sourceRadius ** 2 - blockerRadius ** 2) / (2 * separation * sourceRadius)))
  const blockerAngle = Math.acos(clamp((separation ** 2 + blockerRadius ** 2 - sourceRadius ** 2) / (2 * separation * blockerRadius)))
  const triangle = .5 * Math.sqrt(Math.max(0, (-separation + sourceRadius + blockerRadius) * (separation + sourceRadius - blockerRadius) * (separation - sourceRadius + blockerRadius) * (separation + sourceRadius + blockerRadius)))
  return Math.max(0, Math.min(1, (sourceRadius ** 2 * sourceAngle + blockerRadius ** 2 * blockerAngle - triangle) / (Math.PI * sourceRadius ** 2)))
}

/** Angular alignment only; contact times/visibility require the ephemeris provider. */
export function classifyAlignment(phase: number, latitude: number): 'solar' | 'lunar' | 'miss' | 'none' {
  const angle = normalizeDegrees(phase)
  const newMoonDistance = Math.min(angle, 360 - angle)
  const fullMoonDistance = Math.abs(angle - 180)
  if (Math.min(newMoonDistance, fullMoonDistance) > 1.5) return 'none'
  if (Math.abs(latitude) > 1.5) return 'miss'
  return newMoonDistance < fullMoonDistance ? 'solar' : 'lunar'
}

/** Signed umbral radius: negative after the apex means antumbra. All lengths use the same units. */
export function shadowRadius(sourceRadius: number, blockerRadius: number, separation: number, behind: number, penumbra: boolean): number {
  return blockerRadius + behind * (penumbra ? sourceRadius + blockerRadius : blockerRadius - sourceRadius) / separation
}

/** Kepler's second law in focus-centered coordinates. */
export function sweptArea(semiMajor: number, eccentricity: number, deltaMeanAnomaly: number): number {
  return .5 * semiMajor ** 2 * Math.sqrt(1 - eccentricity ** 2) * deltaMeanAnomaly
}
