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

/** Local apparent solar time after the model has advanced through a synodic month. */
export function teachingSolarTime(initialHour: number, timeline: number): number {
  return modulo(initialHour + timeline * SYNODIC_MONTH_DAYS * 24, 24)
}

/**
 * Surface direction in scene coordinates. The model Sun is at -x; local
 * 18:00 therefore rotates the observer toward +z.
 */
export function teachingObserverDirection(latitude: number, solarHour: number): { readonly x: number; readonly y: number; readonly z: number } {
  const latitudeRadians = Math.max(-90, Math.min(90, latitude)) * Math.PI / 180
  const hourAngle = (modulo(solarHour, 24) - 12) * Math.PI / 12
  const horizontal = Math.cos(latitudeRadians)
  return {
    x: clean(-horizontal * Math.cos(hourAngle)),
    y: clean(Math.sin(latitudeRadians)),
    z: clean(horizontal * Math.sin(hourAngle))
  }
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

export function formatObserverCoordinates(latitude: number, longitude: number): string {
  const latitudeHemisphere = latitude >= 0 ? 'N' : 'S'
  const longitudeHemisphere = longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(latitude).toFixed(2)}°${latitudeHemisphere}・${Math.abs(longitude).toFixed(2)}°${longitudeHemisphere}`
}

export function formatTeachingObserverLocation(latitude: number, solarHour: number): string {
  const latitudeHemisphere = latitude >= 0 ? 'N' : 'S'
  const relativeLongitude = modulo((solarHour - 12) * 15 + 180, 360) - 180
  const relativeLabel = Math.abs(relativeLongitude) < .005
    ? '日下點經線'
    : `日下點${relativeLongitude > 0 ? '東' : '西'} ${Math.abs(relativeLongitude).toFixed(1)}°`
  return `${Math.abs(latitude).toFixed(1)}°${latitudeHemisphere}・${relativeLabel}`
}

export function formatSolarHour(hour: number): string {
  const totalMinutes = Math.round(modulo(hour, 24) * 60) % (24 * 60)
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}
