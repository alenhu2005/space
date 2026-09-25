import { describe, expect, it } from 'vitest'
import { realLunarAppearance, realSolarAppearance, teachingLunarAppearance, teachingLunarShadow, teachingSolarView } from '../../src/core/observer-eclipse'
import { classifyLunarShadow } from '../../src/core/geometry'
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
    const view = (latitude: number, solarHour: number, type: number, node = 0, phase = 0) =>
      teachingSolarView(phase, latitude, 121.5654, solarHour, type, node, 25).appearance
    expect(view(0, 12, 0).kind).toBe('total')
    expect(view(0, 12, 2).kind).toBe('annular')
    expect(view(10, 12, 2).kind).toBe('partial')
    expect(view(70, 12, 2).kind).toBe('none')
    expect(view(-40, 12, 1, 90).kind).toBe('partial')
    expect(view(70, 12, 0).kind).toBe('none')
    expect(view(0, 0, 0).visible).toBe(false)
    expect(view(0, 12, 0, 90).kind).toBe('none')
    expect(teachingLunarAppearance(65, 180, 0, 25).kind).toBe('total')
    expect(teachingLunarAppearance(65, 180, 50, 25).kind).toBe('partial')
  })

  it('keeps the ground view eclipsed throughout the space-view umbra crossing', () => {
    for (const phase of [180, 181.8, 187.2]) {
      const shadow = teachingLunarShadow(phase, 0, 25)
      const ground = teachingLunarAppearance(65, phase, 0, 25)
      expect(ground.kind).toBe(classifyLunarShadow(shadow))
      expect(ground.coverage).toBeGreaterThan(0)
      expect(ground.visible).toBe(true)
    }
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
