import {
  Body,
  Ecliptic,
  EclipticGeoMoon,
  EclipseKind,
  Equator,
  EquatorFromVector,
  GeoVector,
  HelioVector,
  Horizon,
  HorizonFromVector,
  Illumination,
  MakeTime,
  MoonPhase,
  Observer,
  ObserverVector,
  RotateVector,
  Rotation_EQJ_EQD,
  Rotation_EQJ_HOR,
  SearchAltitude,
  SearchGlobalSolarEclipse,
  SearchHourAngle,
  SearchLocalSolarEclipse,
  SearchLunarEclipse,
  SearchMoonPhase,
  SearchRiseSet,
  Seasons,
  SiderealTime,
  Vector,
  type AstroTime,
  type RotationMatrix,
  type LocalSolarEclipseInfo
} from 'astronomy-engine'
import type { ObserverLocation } from '../core/types'
import { discOverlapFraction } from '../core/geometry'

export type SupportedBody = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Earth' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune'

export interface CartesianVector {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface HorizontalBodyPosition {
  readonly altitude: number
  readonly azimuth: number
  readonly rightAscension: number
  readonly declination: number
  readonly distanceAu: number
}

export interface J2000StarPosition {
  readonly rightAscensionHours: number
  readonly declinationDegrees: number
  /** HYG/Hipparcos μRA* = dRA/dt × cos(declination), milliarcseconds/year. */
  readonly properMotionRaMasYear?: number
  readonly properMotionDecMasYear?: number
}

export interface EclipseContacts {
  /** Lunar penumbral contacts, or local solar partial contacts. */
  readonly start: Date
  readonly end: Date
  readonly partialStart?: Date
  readonly partialEnd?: Date
  readonly totalStart?: Date
  readonly totalEnd?: Date
}

export interface LocalEclipseSummary {
  readonly kind: EclipseKind
  readonly peak: Date
  readonly obscuration: number
  readonly visible: boolean
  readonly contacts: EclipseContacts
}

export interface EclipseSummary {
  readonly kind: EclipseKind
  readonly peak: Date
  readonly obscuration: number | undefined
  readonly visible?: boolean
  readonly contacts?: EclipseContacts
  readonly local?: LocalEclipseSummary
  readonly peakLocation?: { readonly latitude: number; readonly longitude: number }
}

export interface SeasonSummary {
  readonly marchEquinox: Date
  readonly juneSolstice: Date
  readonly septemberEquinox: Date
  readonly decemberSolstice: Date
}

export interface AstronomyProvider {
  horizontalPosition(body: SupportedBody, instant: Date, observer: ObserverLocation): HorizontalBodyPosition
  heliocentricVector(body: SupportedBody, instant: Date): CartesianVector
  /** Geocentric AU, in true ecliptic-of-date coordinates (ECT). Earth is the origin. */
  geocentricVector(body: SupportedBody, instant: Date): CartesianVector
  /** Earth-centred AU, in true ecliptic-of-date coordinates (ECT). */
  observerVector(instant: Date, observer: ObserverLocation): CartesianVector
  starHorizontalPosition(star: J2000StarPosition, instant: Date, observer: ObserverLocation): HorizontalBodyPosition
  moonPhaseAngle(instant: Date): number
  nearestMoonPhaseInstant(targetAngle: number, around: Date): Date
  moonIlluminationFraction(instant: Date): number
  moonEclipticLatitude(instant: Date): number
  riseSet(body: 'Sun' | 'Moon', instant: Date, observer: ObserverLocation): { readonly rise: Date | null; readonly transit: Date; readonly set: Date | null }
  localSiderealDegrees(instant: Date, longitude: number): number
  nextLunarEclipse(after: Date, observer?: ObserverLocation): EclipseSummary
  nextSolarEclipse(after: Date, observer?: ObserverLocation): EclipseSummary
  nextLocalSolarEclipse(after: Date, observer: ObserverLocation): EclipseSummary
  seasons(year: number): SeasonSummary
}

const BODIES: Readonly<Record<SupportedBody, Body>> = Object.freeze({
  Sun: Body.Sun,
  Moon: Body.Moon,
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Earth: Body.Earth,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune
})

function toObserver(location: ObserverLocation): Observer {
  return new Observer(location.latitude, location.longitude, location.elevation)
}

/** Any part of this interval has the body's center above the geometric horizon. */
function visibleDuring(body: Body, start: Date, end: Date, observer: ObserverLocation): boolean {
  const location = toObserver(observer)
  const altitude = (instant: Date) => {
    const equatorial = Equator(body, instant, location, true, true)
    return Horizon(instant, location, equatorial.ra, equatorial.dec).altitude
  }
  if (altitude(start) > 0 || altitude(end) > 0) return true
  return SearchAltitude(body, location, 1, start, (end.getTime() - start.getTime()) / 86_400_000, 0) !== null
}

function summarizeLocalSolar(eclipse: LocalSolarEclipseInfo, observer: ObserverLocation): LocalEclipseSummary {
  const start = new Date(eclipse.partial_begin.time.date)
  const end = new Date(eclipse.partial_end.time.date)
  return {
    kind: eclipse.kind, peak: new Date(eclipse.peak.time.date), obscuration: eclipse.obscuration,
    visible: visibleDuring(Body.Sun, start, end, observer),
    contacts: {
      start, end, partialStart: start, partialEnd: end,
      totalStart: eclipse.total_begin ? new Date(eclipse.total_begin.time.date) : undefined,
      totalEnd: eclipse.total_end ? new Date(eclipse.total_end.time.date) : undefined
    }
  }
}

/** Bounded fallback: Engine's local search skips events with both contacts below the horizon. */
function localSolarAtGlobalPeak(peak: Date, observer: ObserverLocation): LocalEclipseSummary | undefined {
  const location = toObserver(observer)
  const discs = (milliseconds: number) => {
    const instant = new Date(milliseconds)
    const sun = Equator(Body.Sun, instant, location, true, true)
    const moon = Equator(Body.Moon, instant, location, true, true)
    const rad = Math.PI / 180
    const dot = Math.sin(sun.dec * rad) * Math.sin(moon.dec * rad) + Math.cos(sun.dec * rad) * Math.cos(moon.dec * rad) * Math.cos((sun.ra - moon.ra) * 15 * rad)
    return {
      separation: Math.acos(Math.max(-1, Math.min(1, dot))),
      sunRadius: Math.asin(695_700 / (sun.dist * 149_597_870.7)),
      moonRadius: Math.asin(1737.4 / (moon.dist * 149_597_870.7))
    }
  }
  const margin = (milliseconds: number) => {
    const disc = discs(milliseconds)
    return disc.separation - disc.sunRadius - disc.moonRadius
  }
  const startWindow = peak.getTime() - 8 * 3_600_000
  const endWindow = peak.getTime() + 8 * 3_600_000
  const step = 5 * 60_000
  let first: number | undefined
  let last: number | undefined
  for (let instant = startWindow; instant <= endWindow; instant += step) {
    if (margin(instant) < 0) { first ??= instant; last = instant }
  }
  if (first === undefined || last === undefined) return undefined
  const contact = (outside: number, inside: number, gap = margin) => {
    while (Math.abs(outside - inside) > 500) {
      const middle = (outside + inside) / 2
      if (gap(middle) < 0) inside = middle
      else outside = middle
    }
    return new Date((outside + inside) / 2)
  }
  const start = contact(first - step, first)
  const end = contact(last + step, last)
  let left = start.getTime()
  let right = end.getTime()
  while (right - left > 500) {
    const a = left + (right - left) / 3
    const b = right - (right - left) / 3
    if (discs(a).separation < discs(b).separation) right = b
    else left = a
  }
  const localPeak = new Date((left + right) / 2)
  const disc = discs(localPeak.getTime())
  const obscuration = discOverlapFraction(disc.sunRadius, disc.moonRadius, disc.separation)
  const central = disc.separation < Math.abs(disc.sunRadius - disc.moonRadius)
  const centralMargin = (milliseconds: number) => {
    const value = discs(milliseconds)
    return value.separation - Math.abs(value.sunRadius - value.moonRadius)
  }
  return {
    kind: central ? disc.moonRadius >= disc.sunRadius ? EclipseKind.Total : EclipseKind.Annular : EclipseKind.Partial,
    peak: localPeak, obscuration, visible: visibleDuring(Body.Sun, start, end, observer),
    contacts: {
      start, end, partialStart: start, partialEnd: end,
      totalStart: central ? contact(start.getTime(), localPeak.getTime(), centralMargin) : undefined,
      totalEnd: central ? contact(end.getTime(), localPeak.getTime(), centralMargin) : undefined
    }
  }
}

export function createAstronomyProvider(): AstronomyProvider {
  // One current-frame entry bounds memory while sharing expensive rotations across the catalogue.
  let stellarFrame: {
    readonly key: string
    readonly time: AstroTime
    readonly equatorial: RotationMatrix
    readonly horizontal: RotationMatrix
  } | undefined
  return Object.freeze({
    horizontalPosition(body: SupportedBody, instant: Date, observer: ObserverLocation) {
      const location = toObserver(observer)
      const equatorial = Equator(BODIES[body], instant, location, true, true)
      const horizontal = Horizon(instant, location, equatorial.ra, equatorial.dec, 'normal')
      return {
        altitude: horizontal.altitude,
        azimuth: horizontal.azimuth,
        rightAscension: equatorial.ra,
        declination: equatorial.dec,
        distanceAu: equatorial.dist
      }
    },

    heliocentricVector(body: SupportedBody, instant: Date) {
      const vector = Ecliptic(HelioVector(BODIES[body], instant)).vec
      return { x: vector.x, y: vector.y, z: vector.z }
    },

    geocentricVector(body: SupportedBody, instant: Date) {
      if (body === 'Earth') return { x: 0, y: 0, z: 0 }
      const vector = Ecliptic(GeoVector(BODIES[body], instant, true)).vec
      return { x: vector.x, y: vector.y, z: vector.z }
    },

    observerVector(instant: Date, observer: ObserverLocation) {
      const vector = Ecliptic(ObserverVector(instant, toObserver(observer), false)).vec
      return { x: vector.x, y: vector.y, z: vector.z }
    },

    starHorizontalPosition(star: J2000StarPosition, instant: Date, observer: ObserverLocation) {
      const pmRa = star.properMotionRaMasYear ?? 0
      const pmDec = star.properMotionDecMasYear ?? 0
      if (![star.rightAscensionHours, star.declinationDegrees, pmRa, pmDec].every(Number.isFinite)
        || Math.abs(star.declinationDegrees) > 90) throw new RangeError('Invalid J2000 stellar coordinates.')
      const ra = star.rightAscensionHours * Math.PI / 12
      const dec = star.declinationDegrees * Math.PI / 180
      const elapsedJulianYears = (instant.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86_400_000)
      const motionScale = elapsedJulianYears * Math.PI / (180 * 3_600_000)
      const key = `${instant.getTime()}:${observer.latitude}:${observer.longitude}:${observer.elevation}`
      if (stellarFrame?.key !== key) {
        const time = MakeTime(instant)
        stellarFrame = { key, time, equatorial: Rotation_EQJ_EQD(time), horizontal: Rotation_EQJ_HOR(time, toObserver(observer)) }
      }
      // Propagate in the tangent plane, so μRA* needs no division at the poles.
      const vector = new Vector(
        Math.cos(dec) * Math.cos(ra) + motionScale * (-pmRa * Math.sin(ra) - pmDec * Math.sin(dec) * Math.cos(ra)),
        Math.cos(dec) * Math.sin(ra) + motionScale * (pmRa * Math.cos(ra) - pmDec * Math.sin(dec) * Math.sin(ra)),
        Math.sin(dec) + motionScale * pmDec * Math.cos(dec),
        stellarFrame.time
      )
      const equatorial = EquatorFromVector(RotateVector(stellarFrame.equatorial, vector))
      const horizontal = HorizonFromVector(RotateVector(stellarFrame.horizontal, vector), 'normal')
      return { altitude: horizontal.lat, azimuth: horizontal.lon, rightAscension: equatorial.ra, declination: equatorial.dec, distanceAu: Infinity }
    },

    moonPhaseAngle(instant: Date) {
      return MoonPhase(instant)
    },

    nearestMoonPhaseInstant(targetAngle: number, around: Date) {
      const normalized = ((targetAngle % 360) + 360) % 360
      const candidates = [
        SearchMoonPhase(normalized, around, -20)?.date,
        SearchMoonPhase(normalized, around, 20)?.date
      ].filter((instant): instant is Date => instant !== undefined)
      if (!candidates.length) throw new RangeError('Unable to find a matching lunar phase near the requested date.')
      return new Date(candidates.reduce((closest, candidate) =>
        Math.abs(candidate.getTime() - around.getTime()) < Math.abs(closest.getTime() - around.getTime()) ? candidate : closest
      ).getTime())
    },

    moonIlluminationFraction(instant: Date) {
      return Illumination(Body.Moon, instant).phase_fraction
    },

    moonEclipticLatitude(instant: Date) {
      return EclipticGeoMoon(instant).lat
    },

    riseSet(body: 'Sun' | 'Moon', instant: Date, observer: ObserverLocation) {
      const location = toObserver(observer)
      return {
        rise: SearchRiseSet(BODIES[body], location, 1, instant, 1)?.date ?? null,
        transit: SearchHourAngle(BODIES[body], location, 0, instant).time.date,
        set: SearchRiseSet(BODIES[body], location, -1, instant, 1)?.date ?? null
      }
    },

    localSiderealDegrees(instant: Date, longitude: number) {
      return ((SiderealTime(instant) * 15 + longitude) % 360 + 360) % 360
    },

    nextLunarEclipse(after: Date, observer?: ObserverLocation) {
      const first = SearchLunarEclipse(after)
      const eclipse = first.peak.date.getTime() > after.getTime() ? first : SearchLunarEclipse(new Date(after.getTime() + 86_400_000))
      const contact = (minutes: number) => new Date(eclipse.peak.date.getTime() + minutes * 60_000)
      const contacts = {
        start: contact(-eclipse.sd_penum), end: contact(eclipse.sd_penum),
        partialStart: eclipse.sd_partial > 0 ? contact(-eclipse.sd_partial) : undefined,
        partialEnd: eclipse.sd_partial > 0 ? contact(eclipse.sd_partial) : undefined,
        totalStart: eclipse.sd_total > 0 ? contact(-eclipse.sd_total) : undefined,
        totalEnd: eclipse.sd_total > 0 ? contact(eclipse.sd_total) : undefined
      }
      return {
        kind: eclipse.kind,
        peak: new Date(eclipse.peak.date),
        obscuration: eclipse.obscuration,
        contacts,
        visible: observer ? visibleDuring(Body.Moon, contacts.start, contacts.end, observer) : undefined
      }
    },

    nextSolarEclipse(after: Date, observer?: ObserverLocation) {
      const first = SearchGlobalSolarEclipse(after)
      // Engine searches conjunctions; at a previous peak it can return that same event.
      const global = first.peak.date.getTime() > after.getTime() ? first : SearchGlobalSolarEclipse(new Date(after.getTime() + 86_400_000))
      const peak = new Date(global.peak.date)
      const candidate = observer ? summarizeLocalSolar(SearchLocalSolarEclipse(new Date(peak.getTime() - 86_400_000), toObserver(observer)), observer) : undefined
      // A local search can skip this global event and return another year.
      const local = candidate && Math.abs(candidate.peak.getTime() - peak.getTime()) < 86_400_000 ? candidate : observer ? localSolarAtGlobalPeak(peak, observer) : undefined
      return {
        kind: global.kind, peak, obscuration: global.obscuration,
        visible: observer ? local?.visible ?? false : undefined,
        local, contacts: local?.contacts,
        peakLocation: global.latitude !== undefined && global.longitude !== undefined ? { latitude: global.latitude, longitude: global.longitude } : undefined
      }
    },

    nextLocalSolarEclipse(after: Date, observer: ObserverLocation) {
      const first = SearchLocalSolarEclipse(after, toObserver(observer))
      const eclipse = first.peak.time.date.getTime() > after.getTime() ? first : SearchLocalSolarEclipse(new Date(after.getTime() + 86_400_000), toObserver(observer))
      return summarizeLocalSolar(eclipse, observer)
    },

    seasons(year: number) {
      const result = Seasons(year)
      return {
        marchEquinox: new Date(result.mar_equinox.date),
        juneSolstice: new Date(result.jun_solstice.date),
        septemberEquinox: new Date(result.sep_equinox.date),
        decemberSolstice: new Date(result.dec_solstice.date)
      }
    }
  })
}
