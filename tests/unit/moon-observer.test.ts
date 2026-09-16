import { describe, expect, it } from 'vitest'
import {
  formatObserverCoordinates,
  formatObserverTime,
  formatSolarHour,
  formatTeachingObserverLocation,
  observerTimeZone,
  teachingObserverDirection,
  teachingSolarTime
} from '../../src/core/moon-observer'

describe('moon observer helpers', () => {
  it('advances teaching solar time through one synodic month', () => {
    expect(teachingSolarTime(12, 0)).toBe(12)
    expect(teachingSolarTime(12, .5)).toBeCloseTo(6.36708, 5)
    expect(teachingSolarTime(23, 1)).toBeCloseTo(11.73416, 5)
  })

  it('places noon toward the Sun, midnight away, and 18:00 toward +z', () => {
    expect(teachingObserverDirection(0, 12)).toEqual({ x: -1, y: 0, z: 0 })
    expect(teachingObserverDirection(0, 0)).toEqual({ x: 1, y: 0, z: 0 })
    const evening = teachingObserverDirection(0, 18)
    expect(evening.x).toBeCloseTo(0, 12)
    expect(evening.y).toBe(0)
    expect(evening.z).toBeCloseTo(1, 12)
    expect(teachingObserverDirection(90, 12)).toEqual({ x: 0, y: 1, z: 0 })
  })

  it('formats explicit civil time zones without guessing from longitude', () => {
    const instant = new Date('2025-01-01T00:15:00Z')
    expect(observerTimeZone(0)).toBe('Asia/Taipei')
    expect(observerTimeZone(1)).toBe('UTC')
    expect(observerTimeZone(999)).toBe('Asia/Taipei')
    expect(formatObserverTime(instant, 'UTC')).toContain('00:15')
    expect(formatObserverTime(instant, 'Asia/Taipei')).toContain('08:15')
  })

  it('formats observer coordinates in both hemispheres', () => {
    expect(formatObserverCoordinates(25.033, 121.5654)).toBe('25.03°N・121.57°E')
    expect(formatObserverCoordinates(-33.8688, -151.2093)).toBe('33.87°S・151.21°W')
  })

  it('labels teaching coordinates relative to the subsolar meridian', () => {
    expect(formatTeachingObserverLocation(25, 12)).toBe('25.0°N・日下點經線')
    expect(formatTeachingObserverLocation(-30, 18)).toBe('30.0°S・日下點東 90.0°')
    expect(formatTeachingObserverLocation(0, 6)).toBe('0.0°N・日下點西 90.0°')
    expect(formatSolarHour(23.999)).toBe('00:00')
    expect(formatSolarHour(-1)).toBe('23:00')
  })
})
