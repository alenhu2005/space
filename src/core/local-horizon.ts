/** Local ENU frame mapped to Three.js: +X east, +Y up, -Z north. */
export function horizonDirection(altitude: number, azimuth: number): { x: number; y: number; z: number } {
  const alt = altitude * Math.PI / 180
  const az = azimuth * Math.PI / 180
  return { x: Math.cos(alt) * Math.sin(az), y: Math.sin(alt), z: -Math.cos(alt) * Math.cos(az) }
}

export function normalizeAzimuth(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export function shortestAzimuthTurn(from: number, to: number): number {
  return ((to - from + 540) % 360 + 360) % 360 - 180
}

export function observerAltitude(value: number): number {
  return Math.max(-12, Math.min(90, value))
}

export function observerFov(value: number): number {
  return Math.max(12, Math.min(85, value))
}

export function cardinalDirection(azimuth: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(normalizeAzimuth(azimuth) / 45) % 8]!
}
