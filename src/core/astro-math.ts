const TAU = Math.PI * 2

export interface HorizontalPosition {
  readonly altitude: number
  readonly azimuth: number
}

export interface MoonPhase {
  readonly name: '新月' | '眉月' | '上弦月' | '盈凸月' | '滿月' | '虧凸月' | '下弦月' | '殘月'
  readonly illumination: number
}

export interface KeplerPoint {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly eccentricAnomaly: number
  readonly trueAnomaly: number
}

export function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

export function radiansToDegrees(radians: number): number {
  return radians * 180 / Math.PI
}

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Eastward spin around the north-pole axis; positive is counterclockwise from above the north pole. */
export function earthEastwardRotationRadians(cycles: number): number {
  return cycles * TAU
}

/** Places a surface observer relative to the subsolar meridian using the same eastward convention. */
export function observerLongitudeRadians(subsolarLongitude: number, hourAngleDegrees: number): number {
  return subsolarLongitude - degreesToRadians(hourAngleDegrees)
}

export function horizontalCoordinates(
  hourAngleDegrees: number,
  declinationDegrees: number,
  latitudeDegrees: number
): HorizontalPosition {
  const hourAngle = degreesToRadians(hourAngleDegrees)
  const declination = degreesToRadians(declinationDegrees)
  const latitude = degreesToRadians(latitudeDegrees)
  const sinAltitude = Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)))
  const azimuth = Math.atan2(
    -Math.sin(hourAngle) * Math.cos(declination),
    Math.sin(declination) * Math.cos(latitude)
      - Math.cos(declination) * Math.sin(latitude) * Math.cos(hourAngle)
  )

  return {
    altitude: radiansToDegrees(altitude),
    azimuth: normalizeDegrees(radiansToDegrees(azimuth))
  }
}

export function dayLengthHours(latitudeDegrees: number, declinationDegrees: number): number {
  const latitude = degreesToRadians(latitudeDegrees)
  const declination = degreesToRadians(declinationDegrees)
  const cosineHourAngle = -Math.tan(latitude) * Math.tan(declination)

  if (cosineHourAngle <= -1) return 24
  if (cosineHourAngle >= 1) return 0
  return 2 * radiansToDegrees(Math.acos(cosineHourAngle)) / 15
}

export function moonPhaseFromAngle(angleDegrees: number): MoonPhase {
  const angle = normalizeDegrees(angleDegrees)
  const names = ['新月', '眉月', '上弦月', '盈凸月', '滿月', '虧凸月', '下弦月', '殘月'] as const
  const sector = Math.floor((angle + 22.5) / 45) % names.length
  const illumination = (1 - Math.cos(degreesToRadians(angle))) / 2
  return { name: names[sector] ?? '新月', illumination }
}

export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  const eccentricitySafe = Math.max(0, Math.min(0.95, eccentricity))
  let eccentricAnomaly = ((meanAnomaly % TAU) + TAU) % TAU

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const residual = eccentricAnomaly - eccentricitySafe * Math.sin(eccentricAnomaly) - eccentricAnomalyFromMean(meanAnomaly)
    const derivative = 1 - eccentricitySafe * Math.cos(eccentricAnomaly)
    eccentricAnomaly -= residual / derivative
  }

  return eccentricAnomaly
}

function eccentricAnomalyFromMean(meanAnomaly: number): number {
  return ((meanAnomaly % TAU) + TAU) % TAU
}

export function keplerPosition(meanAnomaly: number, eccentricity: number, semiMajorAxis = 1): KeplerPoint {
  const eccentricitySafe = Math.max(0, Math.min(0.95, eccentricity))
  const eccentricAnomaly = solveKepler(meanAnomaly, eccentricitySafe)
  const x = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricitySafe)
  const y = semiMajorAxis * Math.sqrt(1 - eccentricitySafe ** 2) * Math.sin(eccentricAnomaly)
  const radius = Math.hypot(x, y)
  const trueAnomaly = Math.atan2(y, x)
  return { x, y, radius, eccentricAnomaly, trueAnomaly }
}

export function orbitalPeriodYears(semiMajorAxisAu: number): number {
  return Math.sqrt(Math.max(0, semiMajorAxisAu) ** 3)
}

/** Velocity in units of Earth's circular orbital speed; tangent and vis-viva consistent. */
export function keplerVelocity(meanAnomaly: number, eccentricity: number, semiMajor: number): { readonly x: number; readonly y: number; readonly speed: number } {
  const point = keplerPosition(meanAnomaly, eccentricity, semiMajor)
  const e = Math.max(0, Math.min(.95, eccentricity))
  const rate = 1 / (semiMajor ** 1.5 * (1 - e * Math.cos(point.eccentricAnomaly)))
  const x = -semiMajor * Math.sin(point.eccentricAnomaly) * rate
  const y = semiMajor * Math.sqrt(1 - e ** 2) * Math.cos(point.eccentricAnomaly) * rate
  return { x, y, speed: Math.hypot(x, y) }
}

export function tidalAlignmentFactor(moonPhaseAngleDegrees: number): number {
  return Math.abs(Math.cos(degreesToRadians(moonPhaseAngleDegrees)))
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
