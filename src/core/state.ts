import { clamp } from './astro-math'
import { SCENE_IDS, type ObserverLocation, type SceneId, type SimulationMode, type SimulationState } from './types'

const DEFAULT_OBSERVER: ObserverLocation = Object.freeze({
  latitude: 25.033,
  longitude: 121.5654,
  elevation: 10
})

export type SimulationAction =
  | { readonly type: 'set-scene'; readonly sceneId: SceneId }
  | { readonly type: 'set-mode'; readonly mode: SimulationMode }
  | { readonly type: 'set-observer'; readonly observer: ObserverLocation }
  | { readonly type: 'set-instant'; readonly instant: string }
  | { readonly type: 'set-playing'; readonly playing: boolean }
  | { readonly type: 'set-speed'; readonly speed: number }
  | { readonly type: 'set-timeline'; readonly timeline: number }
  | { readonly type: 'set-preset'; readonly presetId: string; readonly parameters: Readonly<Record<string, number>>; readonly cameraPreset?: string; readonly instant?: string }
  | { readonly type: 'set-camera'; readonly cameraPreset: string }
  | { readonly type: 'toggle-layer'; readonly layer: keyof SimulationState['layers'] }
  | { readonly type: 'set-parameter'; readonly key: string; readonly value: number }
  | { readonly type: 'reset'; readonly state: SimulationState }

export function createInitialState(now = new Date()): SimulationState {
  return {
    sceneId: 'celestial-sphere',
    mode: 'teaching',
    instant: now.toISOString(),
    observer: DEFAULT_OBSERVER,
    playing: false,
    speed: 1,
    timeline: 0.25,
    presetId: 'taipei',
    cameraPreset: 'outside',
    layers: Object.freeze({ labels: true, paths: true, shadows: true }),
    parameters: Object.freeze({})
  }
}

export function simulationReducer(state: SimulationState, action: SimulationAction): SimulationState {
  switch (action.type) {
    case 'set-scene':
      return { ...state, sceneId: action.sceneId, presetId: '', parameters: Object.freeze({}), playing: false }
    case 'set-mode':
      return { ...state, mode: action.mode, playing: false }
    case 'set-observer':
      if (!Object.values(action.observer).every(Number.isFinite)) return state
      return {
        ...state,
        observer: Object.freeze({
          latitude: clamp(action.observer.latitude, -90, 90),
          longitude: clamp(action.observer.longitude, -180, 180),
          elevation: clamp(action.observer.elevation, 0, 10_000)
        })
      }
    case 'set-instant':
      return Number.isNaN(Date.parse(action.instant)) ? state : { ...state, instant: new Date(action.instant).toISOString() }
    case 'set-playing':
      return { ...state, playing: action.playing }
    case 'set-speed':
      return Number.isFinite(action.speed) ? { ...state, speed: clamp(action.speed, 0.1, 128) } : state
    case 'set-timeline':
      return Number.isFinite(action.timeline) ? { ...state, timeline: clamp(action.timeline, 0, 1) } : state
    case 'set-preset':
      return {
        ...state,
        presetId: action.presetId,
        parameters: Object.freeze({ ...action.parameters }),
        cameraPreset: action.cameraPreset ?? state.cameraPreset,
        instant: action.instant && !Number.isNaN(Date.parse(action.instant))
          ? new Date(action.instant).toISOString()
          : state.instant
      }
    case 'set-camera':
      return { ...state, cameraPreset: action.cameraPreset }
    case 'toggle-layer':
      return { ...state, layers: Object.freeze({ ...state.layers, [action.layer]: !state.layers[action.layer] }) }
    case 'set-parameter':
      return Number.isFinite(action.value) ? { ...state, presetId: '', parameters: Object.freeze({ ...state.parameters, [action.key]: action.value }) } : state
    case 'reset':
      return action.state
  }
}

function isSceneId(value: string | null): value is SceneId {
  return value !== null && (SCENE_IDS as readonly string[]).includes(value)
}

function isMode(value: string | null): value is SimulationMode {
  return value === 'teaching' || value === 'real'
}

function finiteNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseUrlState(search: URLSearchParams, now = new Date()): SimulationState {
  const defaults = createInitialState(now)
  const scene = search.get('scene')
  const mode = search.get('mode')
  const latitude = finiteNumber(search.get('lat'))
  const longitude = finiteNumber(search.get('lon'))
  const presetId = search.get('preset') ?? ''
  const camera = search.get('camera') ?? ''
  const validCameras = ['inside', 'outside', 'horizon', 'top', 'angled', 'earth', 'side', 'moon', 'surface', 'seasons']
  const speed = finiteNumber(search.get('speed'))
  const timeline = finiteNumber(search.get('t'))
  const layerNames = search.get('layers')?.split(',')
  const validLayers = layerNames?.every((layer) => ['labels', 'paths', 'shadows', ''].includes(layer))
  const instant = search.get('time')

  return {
    ...defaults,
    sceneId: isSceneId(scene) ? scene : defaults.sceneId,
    mode: isMode(mode) ? mode : defaults.mode,
    presetId,
    cameraPreset: validCameras.includes(camera) ? camera : defaults.cameraPreset,
    speed: speed !== undefined && speed >= .1 && speed <= 128 ? speed : defaults.speed,
    timeline: timeline !== undefined && timeline >= 0 && timeline <= 1 ? timeline : defaults.timeline,
    layers: validLayers ? Object.freeze({ labels: layerNames!.includes('labels'), paths: layerNames!.includes('paths'), shadows: layerNames!.includes('shadows') }) : defaults.layers,
    instant: instant && Number.isFinite(Date.parse(instant)) ? new Date(instant).toISOString() : defaults.instant,
    observer: latitude !== undefined && longitude !== undefined
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
      ? Object.freeze({ latitude, longitude, elevation: 0 })
      : defaults.observer
  }
}

export function toUrlSearchParams(state: SimulationState): URLSearchParams {
  const search = new URLSearchParams()
  search.set('scene', state.sceneId)
  search.set('mode', state.mode)
  if (state.presetId) search.set('preset', state.presetId)
  if (state.mode === 'real') {
    search.set('time', state.instant)
    search.set('lat', state.observer.latitude.toFixed(4))
    search.set('lon', state.observer.longitude.toFixed(4))
  }
  search.set('t', state.timeline.toFixed(5))
  search.set('camera', state.cameraPreset)
  search.set('speed', String(state.speed))
  search.set('layers', Object.entries(state.layers).filter(([, visible]) => visible).map(([layer]) => layer).join(','))
  for (const [key, value] of Object.entries(state.parameters)) search.set(`p.${key}`, String(value))
  return search
}
