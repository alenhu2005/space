import { describe, expect, it } from 'vitest'
import {
  dayLengthHours,
  horizontalCoordinates,
  keplerPosition,
  keplerVelocity,
  moonPhaseFromAngle,
  normalizeDegrees,
  orbitalPeriodYears,
  tidalAlignmentFactor
} from '../../src/core/astro-math'

describe('astronomy teaching math', () => {
  it('normalizes angles into one turn', () => {
    expect(normalizeDegrees(-15)).toBe(345)
    expect(normalizeDegrees(735)).toBe(15)
  })

  it('places the equatorial Sun at zenith at local noon', () => {
    const position = horizontalCoordinates(0, 0, 0)
    expect(position.altitude).toBeCloseTo(90, 8)
  })

  it('places the north celestial pole at the observer latitude', () => {
    const position = horizontalCoordinates(0, 90, 23.5)
    expect(position.altitude).toBeCloseTo(23.5, 8)
  })

  it('calculates equinox and polar day lengths', () => {
    expect(dayLengthHours(23.5, 0)).toBeCloseTo(12, 8)
    expect(dayLengthHours(75, 23.44)).toBe(24)
    expect(dayLengthHours(75, -23.44)).toBe(0)
  })

  it.each([
    [0, '新月'],
    [90, '上弦月'],
    [180, '滿月'],
    [270, '下弦月']
  ] as const)('maps %s degrees to %s', (angle, expected) => {
    expect(moonPhaseFromAngle(angle).name).toBe(expected)
  })

  it('solves perihelion and aphelion positions', () => {
    const perihelion = keplerPosition(0, 0.2, 2)
    const aphelion = keplerPosition(Math.PI, 0.2, 2)
    expect(perihelion.radius).toBeCloseTo(1.6, 8)
    expect(perihelion.x).toBeCloseTo(1.6, 8)
    expect(aphelion.radius).toBeCloseTo(2.4, 8)
    expect(aphelion.x).toBeCloseTo(-2.4, 8)
  })

  it('implements Kepler third law in solar units', () => {
    expect(orbitalPeriodYears(1)).toBe(1)
    expect(orbitalPeriodYears(4)).toBe(8)
  })

  it('keeps elliptic velocity tangent, obeying vis-viva and constant swept area', () => {
    const a = 2.5
    const e = .85
    for (const mean of [0, .6, Math.PI / 2, Math.PI]) {
      const point = keplerPosition(mean, e, a)
      const velocity = keplerVelocity(mean, e, a)
      expect(velocity.speed ** 2).toBeCloseTo(2 / point.radius - 1 / a, 8)
      expect(point.x * velocity.y - point.y * velocity.x).toBeCloseTo(Math.sqrt(a * (1 - e ** 2)), 8)
      const later = keplerPosition(mean + .000001, e, a)
      const derivative = { x: (later.x - point.x) / .000001, y: (later.y - point.y) / .000001 }
      expect(derivative.x * velocity.y - derivative.y * velocity.x).toBeCloseTo(0, 3)
    }
  })

  it('distinguishes spring and neap tide alignments', () => {
    expect(tidalAlignmentFactor(0)).toBeCloseTo(1, 8)
    expect(tidalAlignmentFactor(90)).toBeCloseTo(0, 8)
    expect(tidalAlignmentFactor(180)).toBeCloseTo(1, 8)
  })
})
