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
 * Fixed surface direction in scene coordinates. Longitude 0 is +x and
 * longitude 90 degrees east is +z.
 */
export function teachingObserverDirection(latitude: number, longitude: number): { readonly x: number; readonly y: number; readonly z: number } {
  const latitudeRadians = Math.max(-90, Math.min(90, latitude)) * Math.PI / 180
  const longitudeRadians = modulo(longitude, 360) * Math.PI / 180
  const horizontal = Math.cos(latitudeRadians)
  return {
    x: clean(horizontal * Math.cos(longitudeRadians)),
    y: clean(Math.sin(latitudeRadians)),
    z: clean(horizontal * Math.sin(longitudeRadians))
  }
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
