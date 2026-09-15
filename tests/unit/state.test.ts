import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  parseUrlState,
  simulationReducer,
  toUrlSearchParams
} from '../../src/core/state'

describe('simulation state', () => {
  it('uses teaching mode and Taipei as safe defaults', () => {
    const state = createInitialState()
    expect(state.sceneId).toBe('celestial-sphere')
    expect(state.mode).toBe('teaching')
    expect(state.observer.latitude).toBeCloseTo(25.033)
    expect(state.observer.longitude).toBeCloseTo(121.5654)
  })

  it('ignores invalid URL values', () => {
    const state = parseUrlState(new URLSearchParams('scene=unknown&mode=magic&lat=999'))
    expect(state.sceneId).toBe('celestial-sphere')
    expect(state.mode).toBe('teaching')
    expect(state.observer.latitude).toBeCloseTo(25.033)
  })

  it('updates immutably', () => {
    const before = createInitialState()
    const after = simulationReducer(before, { type: 'set-scene', sceneId: 'eclipses' })
    expect(after).not.toBe(before)
    expect(before.sceneId).toBe('celestial-sphere')
    expect(after.sceneId).toBe('eclipses')
  })

  it('round trips camera, layers, speed and timeline, rejecting malformed values', () => {
    const initial = createInitialState()
    const shared = { ...initial, cameraPreset: 'horizon', speed: 4, timeline: .73, layers: { labels: false, paths: true, shadows: false } }
    const parsed = parseUrlState(toUrlSearchParams(shared))
    expect(parsed.cameraPreset).toBe('horizon')
    expect(parsed.speed).toBe(4)
    expect(parsed.timeline).toBeCloseTo(.73)
    expect(parsed.layers).toEqual(shared.layers)
    const invalid = parseUrlState(new URLSearchParams('camera=bogus&speed=NaN&t=NaN&layers=bogus'))
    expect(invalid.cameraPreset).toBe(initial.cameraPreset)
    expect(invalid.timeline).toBe(initial.timeline)
    expect(invalid.layers).toEqual(initial.layers)
    expect(simulationReducer(initial, { type: 'set-observer', observer: { latitude: NaN, longitude: 0, elevation: 0 } })).toBe(initial)
    expect(simulationReducer(initial, { type: 'set-speed', speed: NaN })).toBe(initial)
  })

  it('clamps observer coordinates', () => {
    const before = createInitialState()
    const after = simulationReducer(before, {
      type: 'set-observer',
      observer: { latitude: 120, longitude: -240, elevation: -30 }
    })
    expect(after.observer).toEqual({ latitude: 90, longitude: -180, elevation: 0 })
  })

  it('round trips shareable URL state', () => {
    const state = simulationReducer(createInitialState(), {
      type: 'set-scene',
      sceneId: 'kepler'
    })
    const realState = simulationReducer(state, { type: 'set-mode', mode: 'real' })
    const parsed = parseUrlState(toUrlSearchParams(realState))
    expect(parsed.sceneId).toBe('kepler')
    expect(parsed.mode).toBe('real')
  })

  it('parses valid coordinates and preserves presets in a real-mode URL', () => {
    const parsed = parseUrlState(new URLSearchParams('scene=tides&mode=real&preset=spring-new&lat=-23.5&lon=150'))
    expect(parsed.sceneId).toBe('tides')
    expect(parsed.presetId).toBe('spring-new')
    expect(parsed.observer).toEqual({ latitude: -23.5, longitude: 150, elevation: 0 })
    expect(toUrlSearchParams(parsed).get('lat')).toBe('-23.5000')
  })

  it('covers playback, time, camera, layers, parameters and reset actions', () => {
    const initial = createInitialState(new Date('2025-01-01T00:00:00Z'))
    const playing = simulationReducer(initial, { type: 'set-playing', playing: true })
    const fast = simulationReducer(playing, { type: 'set-speed', speed: 999 })
    const elapsed = simulationReducer(fast, { type: 'set-timeline', timeline: -2 })
    const camera = simulationReducer(elapsed, { type: 'set-camera', cameraPreset: 'top' })
    const hidden = simulationReducer(camera, { type: 'toggle-layer', layer: 'labels' })
    const adjusted = simulationReducer(hidden, { type: 'set-parameter', key: 'phase', value: 180 })
    expect(adjusted.playing).toBe(true)
    expect(adjusted.speed).toBe(128)
    expect(adjusted.timeline).toBe(0)
    expect(adjusted.cameraPreset).toBe('top')
    expect(adjusted.layers.labels).toBe(false)
    expect(adjusted.parameters.phase).toBe(180)
    expect(simulationReducer(adjusted, { type: 'reset', state: initial })).toBe(initial)
  })

  it('applies a valid preset instant and ignores invalid instants', () => {
    const initial = createInitialState(new Date('2025-01-01T00:00:00Z'))
    const preset = simulationReducer(initial, {
      type: 'set-preset',
      presetId: 'known',
      parameters: { phase: 180 },
      cameraPreset: 'side',
      instant: '2025-03-14T06:00:00Z'
    })
    expect(preset.instant).toBe('2025-03-14T06:00:00.000Z')
    expect(preset.cameraPreset).toBe('side')
    expect(simulationReducer(preset, { type: 'set-instant', instant: 'invalid' })).toBe(preset)
    expect(simulationReducer(preset, { type: 'set-instant', instant: '2025-04-01' }).instant).toBe('2025-04-01T00:00:00.000Z')
  })
})
