import { describe, expect, it } from 'vitest'
import { realLunarAppearance, realSolarAppearance, teachingLunarAppearance, teachingSolarAppearance } from '../../src/core/observer-eclipse'
import { createAstronomyProvider } from '../../src/services/astronomy-provider'

describe('observer eclipse appearance', () => {
  const sun = { altitude: 65, azimuth: 180, rightAscension: 0, declination: 0, distanceAu: 1 }
  const nearMoon = { altitude: 65, azimuth: 180, rightAscension: 0, declination: 0, distanceAu: .0024 }

  it('distinguishes a covered Sun from a ring and a partial bite', () => {
    expect(realSolarAppearance(sun, nearMoon).kind).toBe('total')
    const annular = realSolarAppearance(sun, { ...nearMoon, distanceAu: .0027 })
    expect(annular.kind).toBe('annular')
    expect(annular.coverage).toBeLessThan(1)
    expect(realSolarAppearance(sun, { ...nearMoon, azimuth: 180.5 }).kind).toBe('partial')
    expect(realSolarAppearance(sun, { ...nearMoon, azimuth: 190 }).kind).toBe('none')
    expect(realSolarAppearance({ ...sun, altitude: -10 }, { ...nearMoon, altitude: -10 }).visible).toBe(false)
  })

  it('shows the intended teaching total, annular, partial and lunar presets', () => {
    const overhead = { ...sun, altitude: 90 }
    expect(teachingSolarAppearance(overhead, overhead, 0, 0, 25).kind).toBe('total')
    expect(teachingSolarAppearance(overhead, overhead, 2, 0, 25).kind).toBe('annular')
    expect(teachingSolarAppearance(sun, sun, 2, 0, 25).kind).toBe('partial')
    expect(teachingSolarAppearance(sun, sun, 1, 90, 25).kind).toBe('partial')
    const outsidePenumbra = { ...sun, altitude: 20 }
    expect(teachingSolarAppearance(outsidePenumbra, outsidePenumbra, 2, 0, 25).kind).toBe('none')
    expect(teachingSolarAppearance(outsidePenumbra, outsidePenumbra, 0, 0, 25).visible).toBe(false)
    expect(teachingLunarAppearance(65, 3, 0, 180).kind).toBe('total')
    expect(teachingLunarAppearance(65, 4, 50, 180).kind).toBe('partial')
  })

  it('checks observer-specific totality and the night-side non-visibility', () => {
    const provider = createAstronomyProvider()
    const dallas = { latitude: 32.7767, longitude: -96.797, elevation: 130 }
    const taipei = { latitude: 25.033, longitude: 121.5654, elevation: 0 }
    const event = provider.nextLocalSolarEclipse(new Date('2024-04-01T00:00:00Z'), dallas)
    const at = (body: 'Sun' | 'Moon', observer: typeof dallas) => provider.horizontalPosition(body, event.peak, observer)
    expect(realSolarAppearance(at('Sun', dallas), at('Moon', dallas)).kind).toBe('total')
    expect(realSolarAppearance(at('Sun', taipei), at('Moon', taipei)).visible).toBe(false)
  })

  it('requires the Moon above the local horizon even during a global lunar eclipse', () => {
    const sunVector = { x: 1, y: 0, z: 0 }
    const moonVector = { x: -.00257, y: 0, z: 0 }
    expect(realLunarAppearance(sunVector, moonVector, 45).kind).toBe('total')
    expect(realLunarAppearance(sunVector, moonVector, -20).visible).toBe(false)
    expect(realLunarAppearance(sunVector, { ...moonVector, y: 5_000 / 149_597_870.7 }, 45).kind).toBe('partial')
  })
})
