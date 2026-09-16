import { describe, expect, it } from 'vitest'
import { Horizon, Observer } from 'astronomy-engine'
import { createAstronomyProvider, type EclipseSummary, type HorizontalBodyPosition } from '../../src/services/astronomy-provider'

const provider = createAstronomyProvider()
const taipei = { latitude: 25.033, longitude: 121.5654, elevation: 10 }
const eclipseSearches: readonly { readonly name: string; readonly start: string; readonly search: (after: Date) => EclipseSummary }[] = [
  { name: 'global solar', start: '2024-04-01T00:00:00Z', search: after => provider.nextSolarEclipse(after) },
  { name: 'lunar', start: '2025-03-01T00:00:00Z', search: after => provider.nextLunarEclipse(after) },
  { name: 'local solar', start: '2024-04-01T00:00:00Z', search: after => provider.nextLocalSolarEclipse(after, { latitude: 32.7767, longitude: -96.797, elevation: 130 }) }
]
const angularSeparationArcseconds = (a: HorizontalBodyPosition, b: HorizontalBodyPosition) => {
  const rad = Math.PI / 180
  const dot = Math.sin(a.declination * rad) * Math.sin(b.declination * rad) + Math.cos(a.declination * rad) * Math.cos(b.declination * rad) * Math.cos((a.rightAscension - b.rightAscension) * 15 * rad)
  return Math.acos(Math.max(-1, Math.min(1, dot))) / rad * 3600
}

describe('AstronomyProvider', () => {
  it.each(eclipseSearches)('advances beyond a previous $name eclipse peak', ({ search, start }) => {
    const previous = search(new Date(start))
    for (const offset of [0, 60_000]) {
      const after = new Date(previous.peak.getTime() + offset)
      const next = search(after)
      expect(next.peak.getTime()).toBeGreaterThan(after.getTime())
      // Recalculating the same conjunction can shift peak by milliseconds;
      // a distinct eclipse must also be separated by more than one day.
      expect(next.peak.getTime() - previous.peak.getTime()).toBeGreaterThan(86_400_000)
    }
  })

  it('calculates horizontal coordinates in valid ranges', () => {
    const position = provider.horizontalPosition('Sun', new Date('2025-06-21T04:00:00Z'), taipei)
    expect(position.altitude).toBeGreaterThan(80)
    expect(position.azimuth).toBeGreaterThanOrEqual(0)
    expect(position.azimuth).toBeLessThan(360)
  })

  it('recognizes the 2024 April new moon', () => {
    const phase = provider.moonPhaseAngle(new Date('2024-04-08T18:21:00Z'))
    expect(Math.min(phase, 360 - phase)).toBeLessThan(1)
    expect(Math.abs(provider.moonEclipticLatitude(new Date('2024-04-08T18:21:00Z')))).toBeLessThan(.5)
  })

  it('returns finite heliocentric vectors', () => {
    const vector = provider.heliocentricVector('Earth', new Date('2025-01-01T00:00:00Z'))
    expect(Number.isFinite(vector.x)).toBe(true)
    expect(Math.hypot(vector.x, vector.y, vector.z)).toBeCloseTo(1, 1)
  })

  it('returns ecliptic-of-date geocentric vectors and physical illumination', () => {
    const instant = new Date('2024-04-08T18:21:00Z')
    const sun = provider.geocentricVector('Sun', instant)
    const moon = provider.geocentricVector('Moon', instant)
    expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 1)
    expect(Math.hypot(moon.x, moon.y, moon.z)).toBeGreaterThan(.002)
    expect(Math.abs(Math.atan2(moon.z, Math.hypot(moon.x, moon.y)) * 180 / Math.PI)).toBeLessThan(.5)
    expect(provider.geocentricVector('Earth', instant)).toEqual({ x: 0, y: 0, z: 0 })
    expect(provider.moonIlluminationFraction(instant)).toBeLessThan(.001)
    expect(provider.moonIlluminationFraction(new Date('2025-03-14T06:59:00Z'))).toBeGreaterThan(.999)
  })

  it('returns an observer surface vector in true ecliptic-of-date coordinates', () => {
    const instant = new Date('2025-01-01T00:00:00Z')
    const vector = provider.observerVector(instant, taipei)
    const distanceKm = Math.hypot(vector.x, vector.y, vector.z) * 149_597_870.7
    expect(distanceKm).toBeGreaterThan(6_350)
    expect(distanceKm).toBeLessThan(6_390)
    expect(Object.values(vector).every(Number.isFinite)).toBe(true)
  })

  it('precesses J2000 stellar coordinates before converting to the local horizon', () => {
    const star = { rightAscensionHours: 0, declinationDegrees: 0 }
    const result = provider.starHorizontalPosition(star, new Date('2100-01-01T00:00:00Z'), taipei)
    expect(result.rightAscension).toBeGreaterThan(.07)
    expect(result.declination).toBeGreaterThan(.5)
    expect(result.altitude).toBeGreaterThanOrEqual(-90)
    expect(result.azimuth).toBeGreaterThanOrEqual(0)
    expect(result.azimuth).toBeLessThan(360)
    expect(() => provider.starHorizontalPosition({ rightAscensionHours: 0, declinationDegrees: 91 }, new Date(), taipei)).toThrow()
    expect(() => provider.starHorizontalPosition({ rightAscensionHours: Number.NaN, declinationDegrees: 0 }, new Date(), taipei)).toThrow()
  })

  it('preserves stationary star coordinates when proper motion is zero', () => {
    const instant = new Date('2100-01-01T12:00:00Z')
    const star = { rightAscensionHours: 7, declinationDegrees: -24 }
    const stationary = provider.starHorizontalPosition(star, instant, taipei)
    const zero = provider.starHorizontalPosition({ ...star, properMotionRaMasYear: 0, properMotionDecMasYear: 0 }, instant, taipei)
    expect(zero).toEqual(stationary)
  })

  it('propagates HYG tangent-plane proper motion in milliarcseconds per Julian year', () => {
    const instant = new Date('2100-01-01T12:00:00Z')
    const star = { rightAscensionHours: 0, declinationDegrees: 60 }
    const stationary = provider.starHorizontalPosition(star, instant, taipei)
    const moving = provider.starHorizontalPosition({ ...star, properMotionRaMasYear: 90 }, instant, taipei)
    expect(angularSeparationArcseconds(stationary, moving)).toBeCloseTo(9, 3)
    expect(moving.rightAscension).toBeGreaterThan(stationary.rightAscension)
    const northward = provider.starHorizontalPosition({ ...star, properMotionDecMasYear: 90 }, instant, taipei)
    expect(angularSeparationArcseconds(stationary, northward)).toBeCloseTo(9, 3)
    expect(northward.declination).toBeGreaterThan(stationary.declination)
    expect(() => provider.starHorizontalPosition({ ...star, properMotionRaMasYear: Number.NaN }, instant, taipei)).toThrow()
  })

  it('propagates proper motion at the celestial pole without dividing by cos(declination)', () => {
    const instant = new Date('2100-01-01T12:00:00Z')
    const pole = { rightAscensionHours: 0, declinationDegrees: 90 }
    const stationary = provider.starHorizontalPosition(pole, instant, taipei)
    const moving = provider.starHorizontalPosition({ ...pole, properMotionRaMasYear: 90 }, instant, taipei)
    expect(angularSeparationArcseconds(stationary, moving)).toBeCloseTo(9, 3)
    expect(Number.isFinite(moving.rightAscension)).toBe(true)
    expect(Number.isFinite(moving.declination)).toBe(true)
    expect(Number.isFinite(moving.altitude)).toBe(true)
  })

  it('keeps vector-based stellar horizons correct when time or observer changes', () => {
    const star = { rightAscensionHours: 14.261, declinationDegrees: 19.1825, properMotionRaMasYear: -1093.39, properMotionDecMasYear: -1999.85 }
    const instants = [new Date('2026-09-15T00:00:00Z'), new Date('2026-09-15T06:00:00Z')]
    const observers = [taipei, { latitude: -33.8688, longitude: 151.2093, elevation: 20 }]
    for (const instant of instants) for (const observer of observers) {
      const result = provider.starHorizontalPosition(star, instant, observer)
      const reference = Horizon(instant, new Observer(observer.latitude, observer.longitude, observer.elevation), result.rightAscension, result.declination, 'normal')
      expect(result.altitude).toBeCloseTo(reference.altitude, 9)
      expect(result.azimuth).toBeCloseTo(reference.azimuth, 9)
    }
  })

  it('finds the next global solar eclipse without skipping one invisible in Taipei', () => {
    const start = new Date('2024-04-01T00:00:00Z')
    const taiwan = provider.nextSolarEclipse(start, taipei)
    expect(taiwan.peak.toISOString().slice(0, 10)).toBe('2024-04-08')
    expect(taiwan.kind).toBe('total')
    expect(taiwan.visible).toBe(false)
    const dallas = provider.nextSolarEclipse(start, { latitude: 32.7767, longitude: -96.797, elevation: 130 })
    expect(dallas.visible).toBe(true)
    expect(dallas.local?.kind).toBe('total')
    expect(dallas.local?.contacts.start.getTime()).toBeLessThan(dallas.local!.peak.getTime())
    expect(dallas.local?.contacts.end.getTime()).toBeGreaterThan(dallas.local!.peak.getTime())
    expect(provider.nextSolarEclipse(start).visible).toBeUndefined()
    // Through-Earth geometric alignment on the night side is not observable;
    // preserve contacts while keeping physical local visibility false.
    const nightSide = provider.nextSolarEclipse(start, { latitude: 10.2, longitude: 95.5, elevation: 0 })
    expect(nightSide.visible).toBe(false)
    expect(nightSide.local?.kind).toBe('total')
    expect(nightSide.local?.contacts.totalStart).toBeInstanceOf(Date)
  })

  it('keeps a sunset partial eclipse visible even when its peak is below the horizon', () => {
    const observer = { latitude: 50, longitude: -10, elevation: 0 }
    const eclipse = provider.nextLocalSolarEclipse(new Date('2024-04-01T00:00:00Z'), observer)
    expect(eclipse.peak.toISOString().slice(0, 10)).toBe('2024-04-08')
    expect(provider.horizontalPosition('Sun', eclipse.peak, observer).altitude).toBeLessThan(0)
    expect(eclipse.visible).toBe(true)
  })

  it('keeps partial-global obscuration unknown without an observation site', () => {
    const eclipse = provider.nextSolarEclipse(new Date('2025-03-01T00:00:00Z'))
    expect(eclipse.kind).toBe('partial')
    expect(eclipse.obscuration).toBeUndefined()
    expect(eclipse.peakLocation).toBeUndefined()
  })

  it('distinguishes absent lunar umbral/total contacts from penumbral contacts', () => {
    const penumbral = provider.nextLunarEclipse(new Date('2024-03-01T00:00:00Z'))
    expect(penumbral.kind).toBe('penumbral')
    expect(penumbral.contacts?.partialStart).toBeUndefined()
    expect(penumbral.contacts?.totalStart).toBeUndefined()
    const partial = provider.nextLunarEclipse(new Date('2024-09-01T00:00:00Z'))
    expect(partial.kind).toBe('partial')
    expect(partial.contacts?.partialStart).toBeInstanceOf(Date)
    expect(partial.contacts?.totalStart).toBeUndefined()
  })

  it('reports lunar contacts and visibility across the entire eclipse interval', () => {
    const start = new Date('2025-03-01T00:00:00Z')
    const america = provider.nextLunarEclipse(start, { latitude: 32.7767, longitude: -96.797, elevation: 130 })
    const taiwan = provider.nextLunarEclipse(start, taipei)
    expect(america.kind).toBe('total')
    expect(america.peak.toISOString().slice(0, 10)).toBe('2025-03-14')
    expect(america.visible).toBe(true)
    expect(taiwan.visible).toBe(false)
    expect(america.contacts?.totalStart).toBeInstanceOf(Date)
    expect(america.contacts?.start.getTime()).toBeLessThan(america.contacts!.partialStart!.getTime())
    expect(america.contacts?.end.getTime()).toBeGreaterThan(america.contacts!.partialEnd!.getTime())
    // Tokyo moonrise occurs near the end of the eclipse: the peak is below
    // the horizon, but the last penumbral phase is observable.
    const tokyo = provider.nextLunarEclipse(start, { latitude: 35.6762, longitude: 139.6503, elevation: 0 })
    expect(provider.horizontalPosition('Moon', tokyo.peak, { latitude: 35.6762, longitude: 139.6503, elevation: 0 }).altitude).toBeLessThan(0)
    expect(tokyo.visible).toBe(true)
  })

  it('finds eclipses after a requested instant', () => {
    const start = new Date('2024-01-01T00:00:00Z')
    const lunar = provider.nextLunarEclipse(start)
    const solar = provider.nextLocalSolarEclipse(start, taipei)
    expect(lunar.peak.getTime()).toBeGreaterThan(start.getTime())
    expect(solar.peak.getTime()).toBeGreaterThan(start.getTime())
    expect(['penumbral', 'partial', 'annular', 'total']).toContain(lunar.kind)
    expect(['partial', 'annular', 'total']).toContain(solar.kind)
  })

  it('returns seasons and local sidereal time', () => {
    const seasons = provider.seasons(2025)
    expect(seasons.marchEquinox.getUTCFullYear()).toBe(2025)
    expect(seasons.juneSolstice.getUTCMonth()).toBe(5)
    const sidereal = provider.localSiderealDegrees(new Date('2025-01-01T00:00:00Z'), 121.5654)
    expect(sidereal).toBeGreaterThanOrEqual(0)
    expect(sidereal).toBeLessThan(360)
  })

  it('handles polar Sun rise/set and actual Moon rise', () => {
    const polar = provider.riseSet('Sun', new Date('2025-06-21T00:00:00Z'), { latitude: 80, longitude: 0, elevation: 0 })
    expect(polar).toEqual({ rise: null, set: null })
    expect(provider.riseSet('Moon', new Date('2025-06-21T00:00:00Z'), taipei).rise).toBeInstanceOf(Date)
  })
})
