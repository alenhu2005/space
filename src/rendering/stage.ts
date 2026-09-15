import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { SceneDefinition, SimulationState } from '../core/types'
import type { AstronomyProvider } from '../services/astronomy-provider'
import { createSceneVisual, type CameraPreset, type SceneMetric, type SceneVisual } from '../scenes/visuals'
import { createStarField, disposeObject } from './helpers'

interface StageCallbacks {
  readonly onAdvance: (elapsedSeconds: number) => void
  readonly onMetrics: (metrics: readonly SceneMetric[]) => void
  readonly onStatus: (message: string) => void
}

interface NavigatorWithMemory extends Navigator {
  readonly deviceMemory?: number
}

export interface StageController {
  readonly available: boolean
  setScene(definition: SceneDefinition): readonly CameraPreset[]
  setState(state: SimulationState): void
  resize(): void
  dispose(): void
}

function preferredPixelRatio(): number {
  const memory = (navigator as NavigatorWithMemory).deviceMemory ?? 4
  const cores = navigator.hardwareConcurrency ?? 4
  const cap = memory <= 2 || cores <= 4 ? 1.15 : memory <= 4 ? 1.5 : 1.85
  return Math.min(window.devicePixelRatio || 1, cap)
}

export function webGl2Available(canvas: HTMLCanvasElement): boolean {
  try {
    // Software WebGL is common in headless Firefox and on low-power devices.
    // It is still a valid WebGL 2 context; adaptive pixel ratio keeps the
    // scene usable without rejecting the entire lesson up front.
    return canvas.getContext('webgl2') !== null
  } catch {
    return false
  }
}

export function createStage(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  astronomy: AstronomyProvider,
  callbacks: StageCallbacks
): StageController {
  let renderer: THREE.WebGLRenderer | undefined
  try {
    const context = canvas.getContext('webgl2', {
      alpha: false, antialias: true, powerPreference: 'high-performance'
    })
    if (context) renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true })
  } catch {
    renderer = undefined
  }
  if (!renderer) {
    callbacks.onStatus('此裝置無法啟用 WebGL 2。請更新瀏覽器、開啟硬體加速，或改用較新的裝置。')
    return {
      available: false,
      setScene: () => [],
      setState: () => undefined,
      resize: () => undefined,
      dispose: () => undefined
    }
  }

  const activeRenderer = renderer
  activeRenderer.localClippingEnabled = true
  const maximumPixelRatio = preferredPixelRatio()
  let activePixelRatio = maximumPixelRatio
  renderer.setPixelRatio(activePixelRatio)
  renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x010406)
  scene.fog = new THREE.FogExp2(0x010406, .012)
  const camera = new THREE.PerspectiveCamera(42, 1, .005, 1500)
  camera.position.set(8, 5.8, 8)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = .075
  controls.minDistance = .25
  controls.maxDistance = 250
  controls.target.set(0, .5, 0)

  const hemisphere = new THREE.HemisphereLight(0x98c7d4, 0x071013, .2)
  const keyLight = new THREE.DirectionalLight(0xfff0d1, 2.7)
  keyLight.position.set(-10, 0, 0)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  const rimLight = new THREE.DirectionalLight(0x54a8ff, .08)
  rimLight.position.set(7, 3, -8)
  const backgroundStars = createStarField(900, 52)
  scene.add(hemisphere, keyLight, rimLight, backgroundStars)

  const base = import.meta.env.BASE_URL
  let visual: SceneVisual | undefined
  let currentState: SimulationState | undefined
  let cameraGoal: CameraPreset | undefined
  let lastFrame = performance.now()
  let lastMetrics = 0
  let lastMetricsKey = ''
  let contextLost = false
  let sampledFrames = 0
  let sampledSeconds = 0
  let updatedState: SimulationState | undefined
  let metrics: readonly SceneMetric[] = []
  let labels: THREE.Sprite[] = []
  let previousCameraScale = 1
  controls.addEventListener('start', () => { cameraGoal = undefined })

  const selectCamera = (id: string): void => {
    if (visual && currentState && updatedState !== currentState) {
      metrics = visual.update(currentState)
      updatedState = currentState
    }
    const preset = visual?.cameras.find((item) => item.id === id) ?? visual?.cameras[0]
    if (preset) {
      const scale = currentState ? visual?.cameraScale?.(currentState) ?? 1 : 1
      cameraGoal = { ...preset, position: preset.position.clone().sub(preset.target).multiplyScalar(scale).add(preset.target), target: preset.target.clone() }
    }
  }

  function arrangeLabels(): void {
    const width = container.clientWidth
    const height = container.clientHeight
    camera.updateMatrixWorld()
    visual?.root.updateMatrixWorld(true)
    const origin = container.getBoundingClientRect()
    const occupied = Array.from(container.querySelectorAll<HTMLElement>('.stage-heading, .scale-badge, .camera-toolbar, .metrics, .scene-inset')).map((element) => {
      const rectangle = element.getBoundingClientRect()
      return { left: rectangle.left - origin.left, right: rectangle.right - origin.left, top: rectangle.top - origin.top, bottom: rectangle.bottom - origin.top }
    })
    for (const label of labels) {
      if (!label.visible) continue
      const position = label.getWorldPosition(new THREE.Vector3()).project(camera)
      const scale = label.getWorldScale(new THREE.Vector3())
      const distance = label.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position)
      const labelHeight = Math.max(10, height * scale.y * camera.zoom / (2 * Math.max(.01, distance) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))))
      const labelWidth = labelHeight * Math.min(4, Math.max(1.4, String(label.userData.text).length * .5))
      const x = (position.x + 1) * width / 2
      const y = (1 - position.y) * height / 2
      const box = { left: x - labelWidth / 2, right: x + labelWidth / 2, top: y - labelHeight / 2, bottom: y + labelHeight / 2 }
      let parentVisible = true
      for (let parent = label.parent; parent; parent = parent.parent) if (!parent.visible) parentVisible = false
      const overlaps = occupied.some((other) => box.left < other.right + 3 && box.right > other.left - 3 && box.top < other.bottom + 3 && box.bottom > other.top - 3)
      if (!parentVisible || label.userData.belowHorizon || position.z < -1 || position.z > 1 || box.left < 0 || box.right > width || box.top < 0 || box.bottom > height || overlaps) {
        label.visible = false
        label.userData.layoutHidden = true
      } else occupied.push(box)
    }
  }

  const animate = (time: number): void => {
    const elapsed = Math.min(.1, Math.max(0, (time - lastFrame) / 1000))
    lastFrame = time
    if (document.hidden || contextLost) return
    for (const label of labels) {
      if (label.userData.layoutHidden) {
        label.visible = (currentState?.layers.labels ?? true) && !label.userData.modeHidden
        label.userData.layoutHidden = false
      }
    }
    sampledFrames += 1
    sampledSeconds += elapsed
    if (sampledFrames >= 120 && sampledSeconds > 0) {
      const framesPerSecond = sampledFrames / sampledSeconds
      canvas.dataset.fps = framesPerSecond.toFixed(1)
      canvas.dataset.pixelRatio = activePixelRatio.toFixed(2)
      const nextRatio = framesPerSecond < 34
        ? Math.max(1, activePixelRatio - .15)
        : framesPerSecond > 56 ? Math.min(maximumPixelRatio, activePixelRatio + .1) : activePixelRatio
      if (nextRatio !== activePixelRatio) {
        activePixelRatio = nextRatio
        activeRenderer.setPixelRatio(activePixelRatio)
        activeRenderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false)
      }
      sampledFrames = 0
      sampledSeconds = 0
    }
    if (currentState?.playing) callbacks.onAdvance(elapsed)
    if (cameraGoal) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const alpha = reduced ? 1 : 1 - Math.exp(-elapsed * 7)
      camera.position.lerp(cameraGoal.position, alpha)
      controls.target.lerp(cameraGoal.target, alpha)
      if (camera.position.distanceTo(cameraGoal.position) < .015) cameraGoal = undefined
    }
    controls.update()
    if (visual && currentState) {
      if (updatedState !== currentState) {
        metrics = visual.update(currentState)
        updatedState = currentState
        labels = []
        visual.root.traverse((object) => { if (object instanceof THREE.Sprite && object.userData.layer === 'labels') labels.push(object) })
        labels.sort((a, b) => String(a.userData.text).length - String(b.userData.text).length)
      }
      visual.root.traverse((object) => {
        if (object.userData.billboard) object.quaternion.copy(camera.quaternion)
      })
      if (time - lastMetrics > 140) {
        const key = JSON.stringify(metrics)
        if (key !== lastMetricsKey) {
          callbacks.onMetrics(metrics)
          lastMetricsKey = key
        }
        lastMetrics = time
      }
    }
    arrangeLabels()
    activeRenderer.render(scene, camera)
  }

  activeRenderer.setAnimationLoop(animate)

  const resizeObserver = new ResizeObserver(() => {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    activeRenderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.zoom = Math.min(1, camera.aspect / 1.1)
    camera.updateProjectionMatrix()
  })
  resizeObserver.observe(container)

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    contextLost = true
    callbacks.onStatus('3D 圖形連線已中斷。正在等待瀏覽器恢復 WebGL context…')
  })
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false
    callbacks.onStatus('')
  })

  return {
    available: true,
    setScene(definition) {
      // Moon phases must be illuminated from the same direction as the drawn Sun.
      hemisphere.intensity = definition.id === 'celestial-sphere' ? 1.2 : definition.id === 'kepler' ? .7 : definition.id === 'sun-path' ? .35 : .2
      keyLight.intensity = definition.id === 'sun-path' ? .2 : 2.7
      keyLight.castShadow = definition.id === 'eclipses'
      backgroundStars.visible = definition.id !== 'celestial-sphere'
      if (visual) {
        scene.remove(visual.root)
        visual.overlay?.remove()
        disposeObject(visual.root)
      }
      visual = createSceneVisual({
        definition,
        astronomy,
        earthTextureUrl: `${base}assets/earth-blue-marble.png`,
        moonTextureUrl: `${base}assets/moon-lro.jpg`
      })
      scene.add(visual.root)
      if (visual.overlay) container.append(visual.overlay)
      labels = []
      visual.root.traverse((object) => { if (object instanceof THREE.Sprite && object.userData.layer === 'labels') labels.push(object) })
      labels.sort((a, b) => String(a.userData.text).length - String(b.userData.text).length)
      updatedState = undefined
      lastMetricsKey = ''
      selectCamera(currentState?.cameraPreset ?? visual.cameras[0]?.id ?? '')
      return visual.cameras
    },
    setState(state) {
      const cameraChanged = state.cameraPreset !== currentState?.cameraPreset
      currentState = state
      activeRenderer.shadowMap.enabled = state.sceneId === 'eclipses' && state.mode === 'teaching' && state.layers.shadows
      const scale = visual?.cameraScale?.(state) ?? 1
      if (cameraChanged || scale !== previousCameraScale) selectCamera(state.cameraPreset)
      previousCameraScale = scale
    },
    resize() {
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      activeRenderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.zoom = Math.min(1, camera.aspect / 1.1)
      camera.updateProjectionMatrix()
    },
    dispose() {
      activeRenderer.setAnimationLoop(null)
      resizeObserver.disconnect()
      controls.dispose()
      if (visual) disposeObject(visual.root)
      visual?.overlay?.remove()
      disposeObject(backgroundStars)
      activeRenderer.dispose()
    }
  }
}
