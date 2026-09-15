export const SCENE_IDS = [
  'celestial-sphere',
  'sun-path',
  'moon-phases',
  'eclipses',
  'tides',
  'kepler'
] as const

export type SceneId = (typeof SCENE_IDS)[number]
export type SimulationMode = 'teaching' | 'real'

export interface ObserverLocation {
  readonly latitude: number
  readonly longitude: number
  readonly elevation: number
}

export interface LayerState {
  readonly labels: boolean
  readonly paths: boolean
  readonly shadows: boolean
}

export interface SimulationState {
  readonly sceneId: SceneId
  readonly mode: SimulationMode
  readonly instant: string
  readonly observer: ObserverLocation
  readonly playing: boolean
  readonly speed: number
  readonly timeline: number
  readonly presetId: string
  readonly cameraPreset: string
  readonly layers: LayerState
  readonly parameters: Readonly<Record<string, number>>
}

export interface ScenePreset {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly parameters: Readonly<Record<string, number>>
  readonly cameraPreset?: string
  readonly instant?: string
}

export interface SceneControl {
  readonly key: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit: string
  readonly options?: readonly { readonly value: number; readonly label: string }[]
  readonly availableInReal?: boolean
  readonly onlyInReal?: boolean
}

export interface SceneDefinition {
  readonly id: SceneId
  readonly shortLabel: string
  readonly title: string
  readonly eyebrow: string
  readonly description: string
  readonly grades: string
  readonly curriculumCodes: readonly string[]
  readonly focus: readonly string[]
  readonly misconception: string
  readonly controls: readonly SceneControl[]
  readonly presets: readonly ScenePreset[]
  readonly defaultParameters: Readonly<Record<string, number>>
}
