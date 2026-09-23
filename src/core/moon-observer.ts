const SYNODIC_MONTH_DAYS = 29.53059

export const OBSERVER_TIME_ZONES = Object.freeze([
  { value: 0, id: 'Asia/Taipei', label: '台北（UTC+8）' },
  { value: 1, id: 'UTC', label: '世界協調時間（UTC）' },
  { value: 2, id: 'Asia/Tokyo', label: '東京' },
  { value: 3, id: 'Europe/London', label: '倫敦' },
  { value: 4, id: 'America/New_York', label: '紐約' },
  { value: 5, id: 'America/Los_Angeles', label: '洛杉磯' },
  { value: 6, id: 'Australia/Sydney', label: '雪梨' }
] as const)

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function clean(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value
}

/**
 * Fixed direction on the equirectangular Earth texture. Longitude 0 is +x;
 * because Three.js SphereGeometry runs its U coordinate toward +z westward,
 * longitude 90 degrees east is -z.
 */
export function earthTextureSurfaceDirection(latitude: number, longitude: number): { readonly x: number; readonly y: number; readonly z: number } {
  const latitudeRadians = Math.max(-90, Math.min(90, latitude)) * Math.PI / 180
  const longitudeRadians = modulo(longitude, 360) * Math.PI / 180
  const horizontal = Math.cos(latitudeRadians)
  return {
    x: clean(horizontal * Math.cos(longitudeRadians)),
    y: clean(Math.sin(latitudeRadians)),
    z: clean(-horizontal * Math.sin(longitudeRadians))
  }
}

export function teachingObserverDirection(latitude: number, longitude: number): { readonly x: number; readonly y: number; readonly z: number } {
  return earthTextureSurfaceDirection(latitude, longitude)
}

/** Local apparent solar time as the phase timeline advances through one synodic month. */
export function teachingSolarTime(initialHour: number, timeline: number): number {
  return modulo(initialHour + timeline * SYNODIC_MONTH_DAYS * 24, 24)
}

/** Set the displayed local solar time without changing the selected lunar phase. */
export function teachingInitialSolarTime(localHour: number, timeline: number): number {
  return modulo(localHour - timeline * SYNODIC_MONTH_DAYS * 24, 24)
}

/**
 * Earth rotation that keeps the selected longitude attached to the surface
 * while placing it at the requested local solar time. The model Sun is -x.
 */
export function teachingEarthRotation(longitude: number, solarHour: number): number {
  const longitudeRadians = modulo(longitude, 360) * Math.PI / 180
  const hourAngle = (modulo(solarHour, 24) - 12) * Math.PI / 12
  return -longitudeRadians - Math.PI + hourAngle
}

export function teachingMoonEvents(phaseAngle: number): { readonly rise: number; readonly transit: number; readonly set: number } {
  const rise = modulo(6 + phaseAngle / 15, 24)
  return { rise, transit: modulo(rise + 6, 24), set: modulo(rise + 12, 24) }
}

export function observerTimeZone(value: number): string {
  return OBSERVER_TIME_ZONES.find((zone) => zone.value === value)?.id ?? OBSERVER_TIME_ZONES[0].id
}

export function formatObserverTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}/${value('month')}/${value('day')} ${value('hour')}:${value('minute')}`
}

export function observerClockHour(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return value('hour') + value('minute') / 60 + value('second') / 3600
}

export function formatObserverEventTime(instant: Date | null, timeZone: string): string {
  if (!instant) return '24h 內無事件'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone, month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(instant)
}

export function formatObserverCoordinates(latitude: number, longitude: number): string {
  const latitudeHemisphere = latitude >= 0 ? 'N' : 'S'
  const longitudeHemisphere = longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(latitude).toFixed(2)}°${latitudeHemisphere}・${Math.abs(longitude).toFixed(2)}°${longitudeHemisphere}`
}

export function formatSolarHour(hour: number): string {
  const totalMinutes = Math.round(modulo(hour, 24) * 60) % (24 * 60)
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}
