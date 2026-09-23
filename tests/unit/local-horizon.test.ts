import { describe, expect, it } from 'vitest'
import { cardinalDirection, horizonDirection, normalizeAzimuth, observerAltitude, observerFov, shortestAzimuthTurn } from '../../src/core/local-horizon'

describe('observer local horizon frame', () => {
  it.each([
    [0, 0, 0, 0, -1],
    [90, 0, 1, 0, 0],
    [180, 0, 0, 0, 1],
    [270, 0, -1, 0, 0],
    [0, 90, 0, 1, 0]
  ])('maps azimuth %s° altitude %s° to ENU', (az, alt, x, y, z) => {
    const actual = horizonDirection(alt, az)
    expect(actual.x).toBeCloseTo(x)
    expect(actual.y).toBeCloseTo(y)
    expect(actual.z).toBeCloseTo(z)
  })

  it('normalizes heading and turns by the short path across north', () => {
    expect(normalizeAzimuth(361)).toBe(1)
    expect(normalizeAzimuth(-1)).toBe(359)
    expect(shortestAzimuthTurn(350, 10)).toBe(20)
    expect(shortestAzimuthTurn(10, 350)).toBe(-20)
  })

  it('clamps pitch and FOV and names all eight directions', () => {
    expect(observerAltitude(-50)).toBe(-12)
    expect(observerAltitude(150)).toBe(90)
    expect(observerFov(2)).toBe(12)
    expect(observerFov(180)).toBe(85)
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(cardinalDirection))
      .toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
  })
})
