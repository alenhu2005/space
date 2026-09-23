import * as THREE from 'three'
import { horizonDirection } from '../core/local-horizon'
import type { SceneDefinition, SimulationState } from '../core/types'
import type { AstronomyProvider } from '../services/astronomy-provider'
import { createLabel, setLayerVisibility } from '../rendering/helpers'

export interface SceneMetric {
  readonly label: string
  readonly value: string
}

export interface CameraPreset {
  readonly id: string
  readonly label: string
  readonly position: THREE.Vector3
  readonly target: THREE.Vector3
  /** Follow a moving target without resetting the user's zoom, angle or pan. */
  readonly preserveOrbit?: boolean
}

export interface SceneVisual {
  readonly root: THREE.Group
  readonly cameras: readonly CameraPreset[]
  readonly overlay?: HTMLElement
  readonly comparison?: {
    readonly root: THREE.Group
    readonly cameras: readonly CameraPreset[]
    readonly trackingCameraIds?: readonly string[]
  }
  readonly trackingCameraIds?: readonly string[]
  dispose?(): void
  cameraScale?(state: SimulationState): number
  update(state: SimulationState): readonly SceneMetric[]
}

export interface BuildContext {
  readonly definition: SceneDefinition
  readonly astronomy: AstronomyProvider
  readonly earthTextureUrl: string
  readonly moonTextureUrl: string
}

export function parameter(state: SimulationState, definition: SceneDefinition, key: string): number {
  return state.parameters[key] ?? definition.defaultParameters[key] ?? 0
}

export function applyLayers(root: THREE.Object3D, state: SimulationState): void {
  setLayerVisibility(root, state.layers.labels, state.layers.paths, state.layers.shadows)
}

export function riseSetMetrics(astronomy: AstronomyProvider, body: 'Sun' | 'Moon'): (state: SimulationState) => readonly SceneMetric[] {
  let key = ''
  let metrics: readonly SceneMetric[] = []
  let validUntil = Infinity
  return (state) => {
    const nextKey = `${state.instant.slice(0, 13)}-${state.observer.latitude}-${state.observer.longitude}`
    if (nextKey !== key || Date.parse(state.instant) >= validUntil) {
      const result = astronomy.riseSet(body, new Date(state.instant), state.observer)
      const format = (date: Date | null): string => date ? date.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '24h 內無事件'
      validUntil = Math.min(result.rise?.getTime() ?? Infinity, result.transit.getTime(), result.set?.getTime() ?? Infinity)
      metrics = [
        { label: `${body === 'Sun' ? '日' : '月'}升（裝置時區）`, value: format(result.rise) },
        ...(body === 'Moon' ? [{ label: '月球中天', value: format(result.transit) }] : []),
        { label: `${body === 'Sun' ? '日' : '月'}落`, value: format(result.set) }
      ]
      key = nextKey
    }
    return metrics
  }
}

export function horizontalVector(altitude: number, azimuth: number, radius: number): THREE.Vector3 {
  const direction = horizonDirection(altitude, azimuth)
  return new THREE.Vector3(direction.x * radius, direction.y * radius, direction.z * radius)
}

/** Keep the Sun to the left while preserving true relative 3D ecliptic directions. */
export function sunAlignedVector(vector: { readonly x: number; readonly y: number; readonly z: number }, sun: { readonly x: number; readonly y: number }): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.z, -vector.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI - Math.atan2(sun.y, sun.x))
}

export function addLabel(parent: THREE.Object3D, text: string, position: THREE.Vector3, color = '#eef7f5', size = .36): THREE.Sprite {
  const label = createLabel(text, color, size)
  label.position.copy(position)
  parent.add(label)
  return label
}
