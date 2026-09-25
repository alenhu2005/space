import { describe, expect, it } from 'vitest'
import {
  earthTextureSurfaceDirection,
  formatObserverCoordinates,
  formatObserverEventTime,
  formatObserverTime,
  formatSolarHour,
  observerTimeZone,
  observerClockHour,
  teachingEarthRotation,
  teachingEclipseSolarTime,
  teachingEclipsePhase,
  teachingInitialEclipseSolarTime,
  teachingInitialSolarTime,
  teachingObserverDirection,
  teachingMoonEvents,
  teachingSolarTime
} from '../../src/core/moon-observer'

describe('moon observer helpers', () => {
  it('derives approximate rise, transit, and set times from the phase angle', () => {
    expect(teachingMoonEvents(0)).toEqual({ rise: 6, transit: 12, set: 18 })
    expect(teachingMoonEvents(90)).toEqual({ rise: 12, transit: 18, set: 0 })
    expect(teachingMoonEvents(180)).toEqual({ rise: 18, transit: 0, set: 6 })
    expect(teachingMoonEvents(270)).toEqual({ rise: 0, transit: 6, set: 12 })
  })

  it('keeps a teaching observer at a fixed latitude and longitude', () => {
    expect(teachingObserverDirection(0, 0)).toEqual({ x: 1, y: 0, z: 0 })
    const east = teachingObserverDirection(0, 90)
    expect(east.x).toBeCloseTo(0, 12)
    expect(east.y).toBe(0)
    expect(east.z).toBeCloseTo(-1, 12)
    expect(teachingObserverDirection(90, 121.5)).toEqual({ x: 0, y: 1, z: 0 })
    expect(teachingObserverDirection(-30, -70)).toEqual(earthTextureSurfaceDirection(-30, -70))
  })

  it('advances local solar time while rotating the fixed longitude with Earth', () => {
    expect(teachingSolarTime(12, 0)).toBe(12)
    expect(teachingSolarTime(12, .25)).toBeCloseTo(21.18354, 5)
    expect(teachingSolarTime(12, .5)).toBeCloseTo(6.36708, 5)
    expect(teachingEarthRotation(121.5, 12)).toBeCloseTo(-301.5 * Math.PI / 180, 12)
    expect(teachingEarthRotation(121.5, 18)).toBeCloseTo(-211.5 * Math.PI / 180, 12)
  })

  it('places the selected observer on the day or night side at the chosen eclipse clock time', () => {
    const longitude = 120.9642
    const surface = earthTextureSurfaceDirection(24.7733, longitude)
    const sunwardX = (hour: number) => {
      const rotation = teachingEarthRotation(longitude, hour)
      return surface.x * Math.cos(rotation) + surface.z * Math.sin(rotation)
    }
    expect(sunwardX(12)).toBeCloseTo(-Math.cos(24.7733 * Math.PI / 180), 10)
    expect(sunwardX(0)).toBeCloseTo(Math.cos(24.7733 * Math.PI / 180), 10)
    expect(sunwardX(6)).toBeCloseTo(0, 10)
  })

  it('rotates Earth during both eclipse presets while keeping their initial local times', () => {
    expect(teachingEclipseSolarTime(12, .5, 0)).toBe(12)
    expect(teachingEclipseSolarTime(0, .5, 3)).toBe(0)
    expect(teachingEclipseSolarTime(12, .1, 0)).toBeCloseTo(7.2)
    expect(teachingEclipseSolarTime(0, .51, 3)).not.toBe(0)
    expect(teachingEclipsePhase(.5, 0)).toBe(0)
    expect(teachingEclipsePhase(.5, 3)).toBe(180)
    expect(teachingEclipsePhase(.1, 0)).toBe(332)
    expect(teachingEclipsePhase(.1, 3)).toBe(124)
    for (const [timeline, eclipseType] of [[.01, 0], [.505, 3], [.52, 4]] as const) {
      const current = teachingEclipseSolarTime(12, timeline, eclipseType)
      expect(teachingEclipseSolarTime(teachingInitialEclipseSolarTime(current, timeline, eclipseType), timeline, eclipseType)).toBeCloseTo(current, 8)
    }
  })

  it('sets the current teaching clock without changing the selected lunar phase', () => {
    for (const timeline of [0, .1, .25, .5, .9]) {
      for (const clock of [0, 6.25, 12, 18.5, 23.75]) {
        expect(teachingSolarTime(teachingInitialSolarTime(clock, timeline), timeline)).toBeCloseTo(clock, 8)
      }
    }
  })

  it('formats explicit civil time zones without guessing from longitude', () => {
    const instant = new Date('2025-01-01T00:15:00Z')
    expect(observerTimeZone(0)).toBe('Asia/Taipei')
    expect(observerTimeZone(1)).toBe('UTC')
    expect(observerTimeZone(999)).toBe('Asia/Taipei')
    expect(formatObserverTime(instant, 'UTC')).toContain('00:15')
    expect(formatObserverTime(instant, 'Asia/Taipei')).toContain('08:15')
    expect(formatObserverEventTime(instant, 'Asia/Taipei')).toContain('08:15')
    expect(formatObserverEventTime(null, 'UTC')).toBe('24h 內無事件')
    expect(observerClockHour(instant, 'UTC')).toBeCloseTo(.25, 8)
    expect(observerClockHour(instant, 'Asia/Taipei')).toBeCloseTo(8.25, 8)
  })

  it('formats observer coordinates in both hemispheres', () => {
    expect(formatObserverCoordinates(25.033, 121.5654)).toBe('25.03°N・121.57°E')
    expect(formatObserverCoordinates(-33.8688, -151.2093)).toBe('33.87°S・151.21°W')
  })

  it('formats clock hours around midnight', () => {
    expect(formatSolarHour(23.999)).toBe('00:00')
    expect(formatSolarHour(-1)).toBe('23:00')
  })
})
