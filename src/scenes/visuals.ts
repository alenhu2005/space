import type { BuildContext, SceneVisual } from './shared'
export type { SceneMetric, CameraPreset, SceneVisual } from './shared'
import { createCelestialSphere } from './celestial-sphere'
import { createSunPath } from './sun-path'
import { createMoonPhases } from './moon-phases'
import { createEclipses } from './eclipses'
import { createTides } from './tides'
import { createKepler } from './kepler'

export function createSceneVisual(context: BuildContext): SceneVisual {
  switch (context.definition.id) {
    case 'celestial-sphere': return createCelestialSphere(context)
    case 'sun-path': return createSunPath(context)
    case 'moon-phases': return createMoonPhases(context)
    case 'eclipses': return createEclipses(context)
    case 'tides': return createTides(context)
    case 'kepler': return createKepler(context)
  }
}
