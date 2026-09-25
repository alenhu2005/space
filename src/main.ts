import './style.css'
import { moonPhaseFromAngle } from './core/astro-math'
import { cardinalDirection } from './core/local-horizon'
import { formatObserverCoordinates, formatSolarHour, teachingEclipseSolarTime, teachingInitialEclipseSolarTime, teachingInitialSolarTime, teachingSolarTime } from './core/moon-observer'
import type { ObserverEclipseAppearance } from './core/observer-eclipse'
import { OBSERVER_SCENES, createInitialState, parseUrlState, simulationReducer, toUrlSearchParams, type SimulationAction } from './core/state'
import type { SceneId, SimulationMode, SimulationState } from './core/types'
import { SCENE_BY_ID } from './scenes/definitions'
import { createAstronomyProvider, type EclipseSummary } from './services/astronomy-provider'
import { createStage } from './rendering/stage'
import type { CameraPreset, SceneMetric } from './scenes/visuals'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('找不到應用程式掛載點。')

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-actions">
        <div class="mode-switch" aria-label="模擬模式">
          <button class="mode-button" data-mode="teaching">教學</button>
          <button class="mode-button" data-mode="real">真實</button>
        </div>
        <div class="view-switch" id="view-switch" role="group" aria-label="觀看位置">
          <button data-view="space">太空視角</button><button data-view="observer">地面觀測</button>
        </div>
        <span class="location-chip" id="location-chip"></span>
        <button class="icon-button" data-action="share" aria-label="複製分享連結" title="複製分享連結">↗</button>
        <button class="icon-button" data-action="fullscreen" aria-label="切換全螢幕" title="全螢幕">⛶</button>
        <button class="icon-button" data-action="about" aria-label="資料與使用說明" title="關於">i</button>
      </div>
    </header>

    <main class="workspace">
      <nav class="scene-nav" aria-label="教學場景">
        <div class="nav-header"><p class="nav-heading">實驗場景</p><button class="icon-button nav-toggle" data-action="toggle-nav" aria-label="收合實驗場景" aria-expanded="true" aria-controls="scene-list developer-tools" title="收合實驗場景">‹</button></div>
        <div class="scene-list" id="scene-list"></div>
        <details class="developer-tools" id="developer-tools">
          <summary aria-label="開發者功能" title="開發者功能"><span>開發者功能</span><span class="developer-lock-state" id="developer-lock-state">🔒</span></summary>
          <div class="developer-content" id="developer-content"></div>
        </details>
      </nav>

      <section class="stage-wrap" id="stage-wrap" aria-label="三維天體模型">
        <canvas id="stage-canvas" tabindex="0" aria-label="3D 天體模型；可拖曳、縮放與旋轉；空白鍵播放，地面視角按住方向鍵連續轉頭，太空視角以右方向鍵逐格"></canvas>
        <div class="stage-heading">
          <div class="stage-eyebrow" id="stage-eyebrow"></div>
          <h2 class="stage-title" id="stage-title"></h2>
          <p class="stage-description" id="stage-description"></p>
        </div>
        <div class="scale-badge" id="scale-badge">教學示意・非等比例</div>
        <div class="observer-panel" id="observer-panel" aria-label="觀看方位" hidden>
          <div class="observer-bearing">
            <div class="observer-bearing-current"><strong id="observer-cardinal"></strong><span id="observer-azimuth"></span></div>
            <div class="observer-compass-window" aria-hidden="true"><div class="observer-compass-track" id="observer-compass-track"></div><i class="observer-compass-pointer"></i></div>
          </div>
          <div class="visually-hidden" id="observer-place"></div>
          <div class="visually-hidden" id="observer-time-label"></div>
          <div class="visually-hidden" id="observer-angles"></div>
        </div>
        <div class="observer-targets"><button data-look="Sun">看向太陽</button><button data-look="Moon">看向月球</button></div>
        <div class="observer-eclipse-preview" id="observer-eclipse-preview" aria-label="選定地點食象特寫" hidden>
          <canvas id="observer-eclipse-canvas" width="160" height="160" aria-label="食象放大示意"></canvas>
          <span id="observer-eclipse-status"></span>
        </div>
        <button class="inset-toggle" data-action="toggle-inset" aria-controls="scene-inset-overlay" aria-expanded="false" hidden>觀測資訊</button>
        <div class="camera-toolbar" id="camera-toolbar" aria-label="相機視角"></div>
        <div class="metrics" id="metrics" aria-label="觀測數據"></div>
        <button class="fullscreen-exit ghost-button" data-action="fullscreen" aria-label="退出展開模型">返回實驗室</button>
        <div class="canvas-message" id="canvas-message" role="alert">
          <div><h2>無法顯示 3D 模型</h2><p id="canvas-message-text"></p></div>
        </div>
      </section>

      <button class="drawer-backdrop" data-action="close-panel" aria-label="返回模型" hidden></button>
      <aside class="control-panel" id="control-panel" aria-label="場景控制面板">
        <div class="control-panel-header">
          <p class="section-kicker">觀測控制</p>
          <button class="panel-close" data-action="close-panel" aria-label="關閉控制面板">關閉</button>
        </div>
        <div id="control-content"></div>
      </aside>
    </main>

    <section class="sun-quick-controls mobile-sun-controls" id="mobile-sun-controls" aria-label="太陽模型快速調整" hidden></section>

    <footer class="transport" aria-label="時間控制">
      <div class="transport-buttons">
        <button class="play-button" data-action="play" aria-label="播放">▶</button>
        <button class="icon-button step-button" data-action="step" aria-label="向前一步">▸|</button>
        <button class="icon-button step-button" data-action="reset" aria-label="重設場景">↺</button>
      </div>
      <label class="timeline-wrap">
        <span class="sr-only">時間軸</span>
        <input id="timeline" type="range" min="0" max="1" step="0.001" />
        <output class="timeline-readout" id="timeline-readout"></output>
      </label>
      <div class="transport-options">
        <label class="sr-only" for="speed">播放速度</label>
        <select class="speed-select" id="speed" aria-label="播放速度">
          <option value="0.25">0.25×</option><option value="1">1×</option><option value="4">4×</option>
          <option value="16">16×</option><option value="64">64×</option>
        </select>
        <button class="panel-toggle" data-action="open-panel" aria-label="調整模型" aria-expanded="false">控制</button>
      </div>
    </footer>
  </div>

  <dialog class="about-dialog" id="about-dialog">
    <h2>關於這座實驗室</h2>
    <p>本教材聚焦台灣 108 課綱中適合以動態模型理解的天體運動。教學模式會誇張尺寸、距離、傾角或潮汐隆起；真實模式則使用實際時間與天文方向，但仍不代表視覺尺寸等比例。</p>
    <ul>
      <li>天文計算：Astronomy Engine</li>
      <li>地球與月球圖像：NASA 公開素材，本機打包</li>
      <li>亮星：HYG Database v4.1 篩選資料</li>
    </ul>
    <p><a href="${import.meta.env.BASE_URL}sources.html" target="_blank" rel="noreferrer">查看完整資料與素材來源</a></p>
    <div class="dialog-actions"><button class="ghost-button" data-action="close-about">關閉</button></div>
  </dialog>
  <div class="status-toast" id="status-toast" role="status" aria-live="polite"></div>
`

const astronomy = createAstronomyProvider()
const PRIMARY_SCENE_IDS: readonly SceneId[] = ['sun-path', 'moon-phases', 'eclipses']
const DEVELOPER_SCENE_IDS: readonly SceneId[] = ['celestial-sphere', 'tides', 'kepler']
const DEVELOPER_UNLOCK_KEY = 'hu-gege-celestial-lab:developer-unlocked'
let developerUnlocked = readDeveloperUnlock()
let developerError = ''
let state = initializeState()
let cameras: readonly CameraPreset[] = []
let statusTimer = 0
let urlTimer = 0
let lastUrlWrite = -Infinity
let latestMetrics: readonly SceneMetric[] = []
let mobileControlTab: 'model' | 'display' | 'info' = 'model'
let selectedEclipse: { readonly kind: 'solar' | 'lunar'; readonly result: EclipseSummary; readonly observerKey: string } | undefined
const heldLookKeys = new Set<string>()
let lookVelocityAzimuth = 0
let lookVelocityAltitude = 0

function readDeveloperUnlock(): boolean {
  try {
    return window.sessionStorage.getItem(DEVELOPER_UNLOCK_KEY) === 'true'
  } catch {
    return false
  }
}

function isDeveloperScene(sceneId: SceneId): boolean {
  return DEVELOPER_SCENE_IDS.includes(sceneId)
}

const canvas = document.querySelector<HTMLCanvasElement>('#stage-canvas')!
const stageWrap = document.querySelector<HTMLElement>('#stage-wrap')!
const viewSwitcher = document.querySelector<HTMLElement>('#view-switch')!
const viewButtons = Array.from(viewSwitcher.querySelectorAll<HTMLButtonElement>('[data-view]'))
const observerPanel = document.querySelector<HTMLElement>('#observer-panel')!
const observerPlace = document.querySelector<HTMLElement>('#observer-place')!
const observerTimeLabel = document.querySelector<HTMLElement>('#observer-time-label')!
const observerCardinal = document.querySelector<HTMLElement>('#observer-cardinal')!
const observerAzimuth = document.querySelector<HTMLElement>('#observer-azimuth')!
const observerCompassTrack = document.querySelector<HTMLElement>('#observer-compass-track')!
const observerAngles = document.querySelector<HTMLElement>('#observer-angles')!
observerCompassTrack.innerHTML = Array.from({ length: 73 }, (_, index) => {
  const angle = (index - 24) * 15
  const degree = (angle + 720) % 360
  const label = degree % 90 === 0 ? ['N', 'E', 'S', 'W'][degree / 90] : degree % 45 === 0 ? String(degree) : ''
  return `<span class="observer-compass-tick${degree % 45 === 0 ? ' major' : ''}" style="left:${index * 30}px">${label}</span>`
}).join('')
const observerEclipsePreview = document.querySelector<HTMLElement>('#observer-eclipse-preview')!
const observerEclipseCanvas = document.querySelector<HTMLCanvasElement>('#observer-eclipse-canvas')!
const observerEclipseStatus = document.querySelector<HTMLElement>('#observer-eclipse-status')!
let observerMetadataKey = ''
let observerHeadingKey = ''
let switchViewKey = ''
const stage = createStage(canvas, stageWrap, astronomy, {
  onAdvance: advanceSimulation,
  onFrame: advanceKeyboardLook,
  onMetrics: renderMetrics,
  onStatus: setCanvasStatus,
  onObserverView: setObserverHeading
})

cameras = stage.setScene(SCENE_BY_ID[state.sceneId])
stage.setState(state)
renderAll()
const drawerMedia = window.matchMedia('(max-width: 900px)')
const phoneMedia = window.matchMedia('(max-width: 560px)')
function updateSceneNav(): void {
  const collapsed = document.body.classList.contains('nav-collapsed')
  const effectivelyCollapsed = collapsed && !phoneMedia.matches
  const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle')!
  const label = collapsed ? '展開實驗場景' : '收合實驗場景'
  toggle.setAttribute('aria-label', label)
  toggle.setAttribute('aria-expanded', String(!collapsed))
  toggle.title = label
  toggle.textContent = collapsed ? '☰' : '‹'
  document.querySelector<HTMLElement>('#scene-list')!.inert = effectivelyCollapsed && drawerMedia.matches
  document.querySelector<HTMLElement>('#developer-tools')!.inert = effectivelyCollapsed
}
try { document.body.classList.toggle('nav-collapsed', sessionStorage.getItem('hu-gege-celestial-lab:nav-collapsed') === 'true') } catch { /* Storage may be disabled; keep the menu expanded. */ }
drawerMedia.addEventListener('change', updateSceneNav)
phoneMedia.addEventListener('change', updateSceneNav)
updateSceneNav()
function updateDrawerAccessibility(): void {
  const panel = document.querySelector<HTMLElement>('#control-panel')!
  const open = drawerMedia.matches && document.body.classList.contains('panel-open')
  panel.inert = drawerMedia.matches && !open
  if (drawerMedia.matches && open) {
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
  } else {
    panel.removeAttribute('role')
    panel.removeAttribute('aria-modal')
  }
  for (const selector of ['.topbar', '.scene-nav', '#stage-wrap', '.transport']) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element) element.inert = open
  }
  const backdrop = document.querySelector<HTMLButtonElement>('.drawer-backdrop')!
  backdrop.hidden = !open
  document.querySelector('[data-action="open-panel"]')?.setAttribute('aria-expanded', String(open))
}
drawerMedia.addEventListener('change', updateDrawerAccessibility)
updateDrawerAccessibility()

function updateInsetToggle(reset = false): void {
  const toggle = document.querySelector<HTMLButtonElement>('.inset-toggle')!
  const hasInset = Boolean(stageWrap.querySelector('.scene-inset'))
  if (reset || !hasInset) stageWrap.classList.remove('inset-open')
  const open = hasInset && stageWrap.classList.contains('inset-open')
  toggle.hidden = !hasInset
  toggle.setAttribute('aria-expanded', String(open))
  toggle.textContent = open ? '收起資訊' : '觀測資訊'
}

function updateControlTabs(): void {
  const panel = document.querySelector<HTMLElement>('#control-panel')!
  panel.dataset.controlTab = mobileControlTab
  panel.querySelectorAll<HTMLButtonElement>('[data-control-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.controlTab === mobileControlTab))
  })
}

function setDrawerOpen(open: boolean): void {
  document.body.classList.toggle('panel-open', open)
  updateDrawerAccessibility()
  const focus = document.querySelector<HTMLElement>(open ? '[data-action="close-panel"]' : '[data-action="open-panel"]')
  focus?.focus({ preventScroll: true })
}

function initializeState(): SimulationState {
  const parsedState = parseUrlState(new URLSearchParams(window.location.search))
  const safeSceneId = !developerUnlocked && isDeveloperScene(parsedState.sceneId) ? PRIMARY_SCENE_IDS[0]! : parsedState.sceneId
  const parsed = safeSceneId === parsedState.sceneId ? parsedState : { ...parsedState, sceneId: safeSceneId, presetId: '' }
  const definition = SCENE_BY_ID[safeSceneId]
  const cameraIds: Readonly<Record<SceneId, readonly string[]>> = {
    'celestial-sphere': ['inside', 'outside', 'horizon'],
    'sun-path': ['horizon', 'outside', 'top', 'seasons'],
    'moon-phases': ['top', 'angled', 'earth', 'moon'],
    eclipses: ['side', 'moon', 'surface', 'lunar-disc'],
    tides: ['top', 'angled', 'earth'],
    kepler: ['top', 'angled', 'side']
  }
  const requested = definition.presets.find((preset) => preset.id === parsed.presetId)
  const preset = requested ?? definition.presets[0]
  if (!preset) return { ...parsed, parameters: definition.defaultParameters }
  const withPreset = simulationReducer(parsed, {
    type: 'set-preset',
    presetId: preset.id,
    parameters: preset.parameters,
    cameraPreset: preset.cameraPreset,
    instant: preset.instant
  })
  const search = new URLSearchParams(window.location.search)
  let restored = simulationReducer(withPreset, { type: 'set-timeline', timeline: timelineFor(preset.parameters, parsed.timeline) })
  if (!cameraIds[parsed.sceneId].includes(parsed.cameraPreset)) restored = { ...restored, cameraPreset: preset.cameraPreset ?? cameraIds[parsed.sceneId][0]! }
  const hiddenBounds: Readonly<Record<string, readonly [number, number]>> = { phase: [0, 360], sidereal: [0, 360], hour: [0, 24], meanAnomaly: [0, 360], eclipseType: [0, 4], viewMode: [0, 2] }
  const keys = new Set([...Object.keys(definition.defaultParameters), ...definition.controls.map((control) => control.key)])
  for (const key of keys) {
    const raw = search.get(`p.${key}`)
    const value = raw === null ? NaN : Number(raw)
    const control = definition.controls.find((control) => control.key === key)
    const bounds = control ? [control.min, control.max] : hiddenBounds[key]
    if (bounds && Number.isFinite(value) && value >= bounds[0]! && value <= bounds[1]! && (!control?.options || control.options.some((option) => option.value === value))) {
      restored = { ...restored, parameters: Object.freeze({ ...restored.parameters, [key]: value }) }
    }
  }
  if (search.has('camera')) restored = { ...restored, cameraPreset: parsed.cameraPreset }
  if (!requested && search.has('preset')) restored = { ...restored, presetId: definition.presets[0]?.id ?? '' }
  if (!search.has('preset') && [...search.keys()].some((key) => key.startsWith('p.'))) restored = { ...restored, presetId: '' }
  const time = search.get('time')
  if (time && Number.isFinite(Date.parse(time))) restored = simulationReducer(restored, { type: 'set-instant', instant: time })
  const timeline = search.get('t')
  if (timeline !== null && Number.isFinite(Number(timeline))) restored = simulationReducer(restored, { type: 'set-timeline', timeline: Number(timeline) })
  return restored
}

function timelineFor(parameters: Readonly<Record<string, number>>, fallback: number): number {
  if (parameters.hour !== undefined) return (parameters.hour % 24 + 24) % 24 / 24
  for (const key of ['phase', 'sidereal', 'meanAnomaly']) {
    if (parameters[key] !== undefined) return ((parameters[key] % 360 + 360) % 360) / 360
  }
  return fallback
}

function dispatch(action: SimulationAction, render = true): void {
  state = simulationReducer(state, action)
  stage.setState(state)
  if (render) renderAll()
  else {
    renderTransport()
    if (state.viewMode === 'observer') renderObserverInfo()
  }
  if (action.type === 'set-view') stage.resize()
  syncUrl()
}

function setObserverHeading(azimuth: number, altitude: number, fov: number): void {
  state = simulationReducer(state, { type: 'set-observer-view', observerView: { azimuth, altitude, fov } })
  stage.setState(state)
  renderObserverInfo()
  syncUrl()
}

function advanceKeyboardLook(elapsed: number): void {
  if (state.viewMode !== 'observer' || heldLookKeys.size === 0) {
    lookVelocityAzimuth = lookVelocityAltitude = 0
    return
  }
  const horizontal = Number(heldLookKeys.has('ArrowRight')) - Number(heldLookKeys.has('ArrowLeft'))
  const vertical = Number(heldLookKeys.has('ArrowUp')) - Number(heldLookKeys.has('ArrowDown'))
  const speed = heldLookKeys.has('ShiftLeft') || heldLookKeys.has('ShiftRight') ? 160 : 90
  const smoothing = 1 - Math.exp(-elapsed * 14)
  lookVelocityAzimuth += (horizontal * speed - lookVelocityAzimuth) * smoothing
  lookVelocityAltitude += (vertical * speed - lookVelocityAltitude) * smoothing
  if (horizontal || vertical) {
    const { azimuth, altitude, fov } = state.observerView
    setObserverHeading(azimuth + lookVelocityAzimuth * elapsed, altitude + lookVelocityAltitude * elapsed, fov)
  }
}

function setSimulationMode(mode: SimulationMode): void {
  if (state.mode === mode) return
  let next = state
  if (state.sceneId === 'moon-phases') {
    if (mode === 'teaching') {
      next = simulationReducer(next, { type: 'set-timeline', timeline: astronomy.moonPhaseAngle(new Date(next.instant)) / 360 })
    } else {
      const instant = astronomy.nearestMoonPhaseInstant(next.timeline * 360, new Date(next.instant))
      const dayFraction = (instant.getUTCHours() * 3600 + instant.getUTCMinutes() * 60 + instant.getUTCSeconds()) / 86_400
      next = simulationReducer(next, { type: 'set-instant', instant: instant.toISOString() })
      next = simulationReducer(next, { type: 'set-timeline', timeline: dayFraction })
    }
    next = { ...next, presetId: '' }
  }
  state = simulationReducer(next, { type: 'set-mode', mode })
  selectedEclipse = undefined
  stage.setState(state)
  renderAll()
  syncUrl()
}

function selectScene(sceneId: SceneId): void {
  if (isDeveloperScene(sceneId) && !developerUnlocked) {
    const tools = document.querySelector<HTMLDetailsElement>('#developer-tools')
    if (tools) tools.open = true
    showTransientStatus('請先在「開發者功能」輸入密碼解鎖。')
    document.querySelector<HTMLInputElement>('#developer-password')?.focus({ preventScroll: true })
    return
  }
  const definition = SCENE_BY_ID[sceneId]
  mobileControlTab = 'model'
  state = simulationReducer(state, { type: 'set-scene', sceneId })
  selectedEclipse = undefined
  const preset = definition.presets[0]
  if (preset) {
    state = simulationReducer(state, {
      type: 'set-preset',
      presetId: preset.id,
      parameters: preset.parameters,
      cameraPreset: preset.cameraPreset,
      instant: preset.instant
    })
    state = simulationReducer(state, { type: 'set-timeline', timeline: timelineFor(preset.parameters, .25) })
  }
  cameras = stage.setScene(definition)
  stageWrap.classList.remove('inset-open')
  latestMetrics = []
  stage.setState(state)
  renderAll()
  syncUrl()
}

function applyPreset(id: string): void {
  const preset = SCENE_BY_ID[state.sceneId].presets.find((item) => item.id === id)
  if (!preset) return
  state = simulationReducer(state, { type: 'set-mode', mode: 'teaching' })
  selectedEclipse = undefined
  state = simulationReducer(state, {
    type: 'set-preset', presetId: preset.id, parameters: preset.parameters,
    cameraPreset: preset.cameraPreset, instant: preset.instant
  })
  state = simulationReducer(state, { type: 'set-timeline', timeline: timelineFor(preset.parameters, state.timeline) })
  stage.setState(state)
  renderAll()
  syncUrl()
}

function resetScene(): void {
  const definition = SCENE_BY_ID[state.sceneId]
  const initial = createInitialState(new Date(state.instant))
  const firstPreset = definition.presets[0]
  const presetParameters = firstPreset?.parameters ?? definition.defaultParameters
  const reset = {
    ...initial,
    sceneId: state.sceneId,
    mode: state.mode,
    viewMode: state.viewMode,
    observerView: state.observerView,
    observer: state.observer,
    layers: state.layers,
    parameters: Object.freeze({ ...presetParameters }),
    cameraPreset: firstPreset?.cameraPreset ?? cameras[0]?.id ?? 'outside',
    presetId: firstPreset?.id ?? '',
    timeline: timelineFor(presetParameters, .25)
  }
  dispatch({ type: 'reset', state: reset })
}

function advanceSimulation(elapsed: number): void {
  if (!state.playing) return
  if (state.mode === 'real') {
    const secondsPerSecond = state.sceneId === 'eclipses' ? 60 : state.sceneId === 'kepler' ? 864000 : state.sceneId === 'moon-phases' ? 21600 : 3600
    const next = new Date(new Date(state.instant).getTime() + elapsed * state.speed * secondsPerSecond * 1000)
    state = simulationReducer(state, { type: 'set-instant', instant: next.toISOString() })
    const dayFraction = (next.getUTCHours() * 3600 + next.getUTCMinutes() * 60 + next.getUTCSeconds()) / 86400
    state = simulationReducer(state, { type: 'set-timeline', timeline: dayFraction })
  } else {
    const period = state.sceneId === 'sun-path' ? 48 : state.sceneId === 'celestial-sphere' ? 72 : 64
    const next = (state.timeline + elapsed * state.speed / period) % 1
    state = simulationReducer(state, { type: 'set-timeline', timeline: next })
  }
  stage.setState(state)
  renderTransport()
  if (state.viewMode === 'observer') renderObserverInfo()
}

function stepSimulation(): void {
  if (state.mode === 'real') {
    const next = new Date(new Date(state.instant).getTime() + (state.sceneId === 'eclipses' ? 60_000 : state.sceneId === 'kepler' ? 86_400_000 : state.sceneId === 'moon-phases' ? 21_600_000 : 3_600_000))
    dispatch({ type: 'set-instant', instant: next.toISOString() })
    return
  }
  dispatch({ type: 'set-timeline', timeline: (state.timeline + 1 / 48) % 1 })
}

function renderAll(): void {
  const active = document.activeElement as HTMLElement | null
  const focusId = active?.id
  const focusData = active?.closest('button')?.dataset
  const noteOpen = document.querySelector<HTMLDetailsElement>('.lesson-note')?.open ?? true
  const definition = SCENE_BY_ID[state.sceneId]
  document.body.classList.toggle('moon-observer-visible', state.sceneId === 'moon-phases')
  renderSceneNav()
  document.querySelector('#stage-eyebrow')!.textContent = definition.eyebrow
  document.querySelector('#stage-title')!.textContent = definition.title
  document.querySelector('#stage-description')!.textContent = definition.description
  document.querySelector('#scale-badge')!.textContent = state.mode === 'real' ? '真實方向・尺寸非等比例' : '教學示意・非等比例'
  renderTopbar()
  renderObserverInfo()
  renderCameras()
  renderControls()
  renderMobileSunControls()
  renderTransport()
  updateInsetToggle()
  const note = document.querySelector<HTMLDetailsElement>('.lesson-note')
  if (note) note.open = noteOpen
  if (active && !active.isConnected) {
    const next = focusId ? document.getElementById(focusId) : focusData ? Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => Object.entries(focusData).every(([key, value]) => button.dataset[key] === value)) : undefined
    next?.focus({ preventScroll: true })
  }
}

function renderObserverInfo(): void {
  const supported = OBSERVER_SCENES.includes(state.sceneId)
  const observer = supported && state.viewMode === 'observer'
  stageWrap.classList.toggle('observer-active', observer)
  viewSwitcher.hidden = !supported
  const nextSwitchKey = `${supported}|${state.viewMode}`
  if (switchViewKey !== nextSwitchKey) {
    viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.viewMode)))
    switchViewKey = nextSwitchKey
  }
  observerPanel.hidden = !observer
  observerEclipsePreview.hidden = !observer || state.sceneId !== 'eclipses'
  if (!observer) return
  const { azimuth, altitude, fov } = state.observerView
  const zenith = altitude > 89.5
  const metadataKey = `${state.sceneId}|${state.mode}|${state.instant.slice(0, 19)}|${state.timeline.toFixed(4)}|${state.observer.latitude}|${state.observer.longitude}|${JSON.stringify(state.parameters)}`
  const metadataChanged = metadataKey !== observerMetadataKey
  if (metadataChanged) {
    const modelLatitude = state.mode === 'teaching' && ['moon-phases', 'eclipses'].includes(state.sceneId)
      ? state.parameters.observerLatitude ?? state.observer.latitude : state.observer.latitude
    const modelLongitude = state.mode === 'teaching' && state.sceneId === 'moon-phases' ? state.parameters.observerLongitude ?? state.observer.longitude : state.observer.longitude
    observerPlace.textContent = `${state.mode === 'teaching' ? '教學觀測地' : '觀測地'} ${formatObserverCoordinates(modelLatitude, modelLongitude)}`
    observerTimeLabel.textContent = state.mode === 'real'
      ? `${new Date(state.instant).toLocaleString('zh-TW', { hour12: false })}（裝置時區）`
      : state.sceneId === 'moon-phases'
        ? `教學太陽時 ${formatSolarHour(teachingSolarTime(state.parameters.observerSolarHour ?? 12, state.timeline))} · ${timelineLabel()}`
        : state.sceneId === 'eclipses'
          ? `教學太陽時 ${formatSolarHour(teachingEclipseSolarTime(state.parameters.observerSolarHour ?? 12, state.timeline, state.parameters.eclipseType ?? 0))} · ${timelineLabel()}`
          : `教學時間 ${timelineLabel()}${state.sceneId === 'sun-path' ? ` · 緯度 ${(state.parameters.latitude ?? state.observer.latitude).toFixed(1)}°` : ''}`
    observerMetadataKey = metadataKey
  }
  if (state.sceneId === 'eclipses' && metadataChanged) {
    const appearance = stage.observerEclipseAppearance()
    if (appearance) drawObserverEclipse(appearance)
  }
  const headingKey = `${azimuth.toFixed(1)}|${altitude.toFixed(1)}|${fov.toFixed(0)}`
  if (headingKey !== observerHeadingKey) {
    observerCardinal.textContent = zenith ? '天頂' : cardinalDirection(azimuth)
    observerAzimuth.textContent = zenith ? '' : `${azimuth.toFixed(0)}°`
    observerCompassTrack.style.transform = `translateX(-${(azimuth + 360) * 2}px)`
    observerAngles.textContent = `Az ${zenith ? '—' : `${azimuth.toFixed(1)}°`} · Alt ${altitude >= 0 ? '+' : ''}${altitude.toFixed(1)}° · FOV ${fov.toFixed(0)}°`
    observerHeadingKey = headingKey
  }
}

function drawObserverEclipse(appearance: ObserverEclipseAppearance): void {
  const context = observerEclipseCanvas.getContext('2d')
  if (!context) return
  const name = appearance.kind === 'none' ? '無食象' : appearance.kind === 'total' ? '全食' : appearance.kind === 'annular' ? '環食' : appearance.kind === 'penumbral' ? '半影月食' : '偏食'
  const sunBelow = appearance.type === 'solar' && !appearance.sunAboveHorizon
  const moonBelow = appearance.type === 'lunar' && !appearance.visible && appearance.kind !== 'none'
  observerEclipsePreview.dataset.kind = appearance.kind
  observerEclipsePreview.dataset.visible = String(appearance.visible)
  observerEclipsePreview.dataset.coverage = appearance.coverage.toFixed(3)
  observerEclipseStatus.textContent = sunBelow ? '此地太陽在地平線下'
    : moonBelow ? '此地月球在地平線下'
      : appearance.kind === 'none' ? '此地此時無食象'
        : `${state.mode === 'real' ? '所在地' : '教學'}${appearance.type === 'solar' ? '日' : '月'}${name} · ${Math.round(appearance.coverage * 100)}%`
  context.clearRect(0, 0, 160, 160)
  if (sunBelow || moonBelow) return
  const center = 80
  if (appearance.type === 'solar') {
    const radius = 49
    const glow = context.createRadialGradient(center, center, radius * .75, center, center, radius * 1.35)
    glow.addColorStop(0, 'rgba(247,185,85,.85)')
    glow.addColorStop(1, 'rgba(247,185,85,0)')
    context.fillStyle = glow
    context.beginPath(); context.arc(center, center, radius * 1.35, 0, Math.PI * 2); context.fill()
    context.fillStyle = '#ffd276'
    context.beginPath(); context.arc(center, center, radius, 0, Math.PI * 2); context.fill()
    const separation = Math.hypot(appearance.moonOffsetXDegrees, appearance.moonOffsetYDegrees)
    if (separation < appearance.sunRadiusDegrees + appearance.moonRadiusDegrees) {
      const scale = radius / appearance.sunRadiusDegrees
      context.fillStyle = '#09141b'
      context.beginPath()
      context.arc(center + appearance.moonOffsetXDegrees * scale, center - appearance.moonOffsetYDegrees * scale, appearance.moonRadiusDegrees * scale, 0, Math.PI * 2)
      context.fill()
    }
  } else {
    const radius = 49
    context.fillStyle = '#c8cbd0'
    context.beginPath(); context.arc(center, center, radius, 0, Math.PI * 2); context.fill()
    if (appearance.kind !== 'none') {
      context.save()
      context.beginPath(); context.arc(center, center, radius, 0, Math.PI * 2); context.clip()
      context.fillStyle = appearance.kind === 'penumbral' ? 'rgba(73,48,48,.3)' : 'rgba(91,28,23,.87)'
      context.beginPath()
      context.arc(center + appearance.umbraOffsetInMoonRadii * radius, center, appearance.umbraRadiusInMoonRadii * radius, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
  }
}

function renderSceneNav(): void {
  const mainDefinitions = PRIMARY_SCENE_IDS.map((id) => SCENE_BY_ID[id])
  document.querySelector('#scene-list')!.innerHTML = mainDefinitions.map((definition, index) => `
    <button class="scene-button" data-scene="${definition.id}" aria-label="${index + 1} ${definition.shortLabel}" title="${definition.shortLabel}" aria-current="${definition.id === state.sceneId ? 'page' : 'false'}">
      <span class="scene-number">${index + 1}</span><span class="scene-label">${definition.shortLabel}</span>
    </button>`).join('')
  document.querySelector('#developer-lock-state')!.textContent = developerUnlocked ? '✓' : '🔒'
  document.querySelector('#developer-content')!.innerHTML = developerUnlocked
    ? `<div class="developer-scene-list">${DEVELOPER_SCENE_IDS.map((id, index) => {
      const definition = SCENE_BY_ID[id]
      return `<button class="scene-button developer-scene-button" data-scene="${id}" aria-current="${id === state.sceneId ? 'page' : 'false'}">
        <span class="scene-number">D${index + 1}</span><span class="scene-label">${definition.shortLabel}</span>
      </button>`
    }).join('')}</div>`
    : `<p class="developer-description">進階模型已折疊。輸入密碼後解鎖天球、潮汐與克卜勒場景。</p>
       <label class="developer-password-label" for="developer-password">解鎖密碼
         <input class="field-input" id="developer-password" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" aria-describedby="developer-error" />
       </label>
       <button class="developer-unlock" type="button" data-action="unlock-developer">解鎖開發者功能</button>
       <p class="developer-error" id="developer-error" role="status">${developerError}</p>`
}

function renderTopbar(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode))
  })
  document.querySelector('#location-chip')!.textContent = state.mode === 'real'
    ? `${state.observer.latitude.toFixed(2)}°, ${state.observer.longitude.toFixed(2)}°`
    : state.sceneId === 'eclipses'
      ? `教學觀測緯度 ${(state.parameters.observerLatitude ?? 0).toFixed(1)}°`
    : '台北基準・可自由調整'
}

function renderCameras(): void {
  document.querySelector('#camera-toolbar')!.innerHTML = cameras.map((camera) => `
    <button class="camera-button" data-camera="${camera.id}" aria-pressed="${camera.id === state.cameraPreset}">${camera.label}</button>`).join('')
    + (state.sceneId === 'sun-path' ? `<a class="camera-button" id="legacy-sun-link" data-legacy-sun-link href="${import.meta.env.BASE_URL}legacy-sun.html" aria-label="切換舊版太陽教材">切換舊版</a>` : '')
}

function renderControls(): void {
  const definition = SCENE_BY_ID[state.sceneId]
  const presetHtml = definition.presets.map((preset) => `
    <button class="preset-button" data-preset="${preset.id}" aria-pressed="${state.mode === 'teaching' && preset.id === state.presetId}">
      <span class="preset-label">${preset.label}</span><span class="preset-desc">${preset.description}</span>
    </button>`).join('')
  const renderParameter = (slider: (typeof definition.controls)[number]): string => {
    const storedValue = state.parameters[slider.key] ?? definition.defaultParameters[slider.key] ?? slider.min
    const value = slider.key === 'observerSolarHour' && state.sceneId === 'moon-phases'
      ? teachingSolarTime(storedValue, state.timeline)
      : slider.key === 'observerSolarHour' && state.sceneId === 'eclipses'
        ? teachingEclipseSolarTime(storedValue, state.timeline, state.parameters.eclipseType ?? 0)
        : storedValue
    if (slider.options) return `<label class="field-label control-row">${slider.label}<select class="field-input" id="parameter-${slider.key}" data-parameter="${slider.key}">${slider.options.map((option) => `<option value="${option.value}" ${option.value === value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>`
    return `<div class="control-row">
      <label class="control-label" for="parameter-${slider.key}"><span>${slider.label}</span><output class="control-value" data-output="${slider.key}">${slider.key === 'observerSolarHour' ? formatSolarHour(value) : `${value.toFixed(slider.step < .1 ? 2 : 1)}${slider.unit}`}</output></label>
      <input type="range" id="parameter-${slider.key}" data-parameter="${slider.key}" data-unit="${slider.unit}" min="${slider.min}" max="${slider.max}" step="${slider.step}" value="${value}" />
    </div>`
  }
  // Keep the control list stable while a value changes.  In particular, the
  // real-mode Kepler view still shows the selected-planet control even when
  // the camera is switched to the Earth-centred comparison view.  Hiding it
  // would reorder/remove DOM controls mid-interaction and break keyboard and
  // assistive-technology navigation.
  const sliderHtml = state.mode === 'teaching' ? definition.controls.filter((control) => !control.onlyInReal).map(renderParameter).join('') : realControls() + definition.controls.filter((control) => control.availableInReal).map(renderParameter).join('')
  const seasonActions = state.sceneId === 'sun-path' && state.mode === 'real' ? `<section class="control-section" data-control-group="model"><p class="section-kicker">${new Date(state.instant).getUTCFullYear()} 年分至點</p><div class="action-row">${[['marchEquinox', '春分'], ['juneSolstice', '夏至'], ['septemberEquinox', '秋分'], ['decemberSolstice', '冬至']].map(([key, name]) => `<button class="ghost-button" data-season="${key}">${name}</button>`).join('')}</div></section>` : ''

  const eclipseActions = state.sceneId === 'eclipses' && state.mode === 'real' ? `
    <div class="control-section" data-control-group="model"><p class="section-kicker">下一次食象</p>
      <div class="action-row"><button class="ghost-button" data-action="next-solar">全球日食</button><button class="ghost-button" data-action="next-lunar">月食</button><button class="ghost-button" data-action="next-local-solar">所在地日食</button></div>
      <p class="inline-status" id="eclipse-status" role="status">${eclipseStatus()}</p>
    </div>` : ''

  document.querySelector('#control-content')!.innerHTML = `
    <div class="control-tabs mobile-only" role="tablist" aria-label="控制分類">
      <button role="tab" data-control-tab="model">模型</button>
      <button role="tab" data-control-tab="display">顯示</button>
      <button role="tab" data-control-tab="info">資訊</button>
    </div>
    <section class="control-section preset-section" data-control-group="model"><p class="section-kicker">快速情境${state.mode === 'real' ? '・選取後進入教學模式' : ''}</p><div class="preset-grid">${presetHtml}</div></section>
    <section class="control-section parameter-section" data-control-group="model"><p class="section-kicker">${state.mode === 'real' ? '日期與觀察位置' : '模型參數'}</p>${sliderHtml}</section>
    ${eclipseActions}
    ${seasonActions}
    <section class="control-section" data-control-group="display"><p class="section-kicker">顯示圖層</p><div class="layer-list">
      ${(['labels', 'paths', 'shadows'] as const).map((layer) => `<button class="layer-toggle" data-layer="${layer}" aria-pressed="${state.layers[layer]}">${layer === 'labels' ? '標籤' : layer === 'paths' ? '軌跡' : '光影'}</button>`).join('')}
    </div></section>
    <section class="control-section mobile-only" data-control-group="display"><p class="section-kicker">相機視角</p><div class="action-row">${cameras.map((camera) => `<button class="ghost-button" data-mobile-camera="${camera.id}" aria-pressed="${camera.id === state.cameraPreset}">${camera.label}</button>`).join('')}</div></section>
    ${state.sceneId === 'sun-path' ? `<section class="control-section mobile-only" data-control-group="display"><a class="ghost-button mobile-legacy-link" data-legacy-sun-link href="${import.meta.env.BASE_URL}legacy-sun.html" aria-label="切換舊版太陽教材">切換舊版太陽教材</a></section>` : ''}
    <section class="control-section mobile-only" data-control-group="display"><p class="section-kicker">課堂連結</p><button class="ghost-button" data-action="share">複製目前場景連結</button></section>
    <section class="control-section drawer-transport" data-control-group="display"><p class="section-kicker">時間操作</p>
      <div class="action-row"><button class="ghost-button" data-action="step">向前一步</button><button class="ghost-button" data-action="reset">重設場景</button>
      <label class="field-label">播放倍率<select class="speed-select" id="drawer-speed"><option value="0.25">0.25×</option><option value="1">1×</option><option value="4">4×</option><option value="16">16×</option><option value="64">64×</option></select></label></div>
    </section>
    <section class="control-section" data-control-group="info"><p class="section-kicker">完整觀測數據</p><div id="detail-metrics"></div></section>
    <section class="control-section mobile-only" data-control-group="info"><button class="ghost-button" data-action="about">資料與使用說明</button></section>
    <section class="control-section" data-control-group="info"><details class="lesson-note" open><summary>教學提示與課綱對應</summary>
      <ul>${definition.focus.map((item) => `<li>${item}</li>`).join('')}</ul>
      <div class="misconception"><strong>常見迷思：</strong>${definition.misconception}</div>
      <div class="curriculum"><span class="code-tag">${definition.grades}</span>${definition.curriculumCodes.map((code) => `<span class="code-tag">${code}</span>`).join('')}</div>
    </details></section>`
  updateControlTabs()
  renderMetrics(latestMetrics)
}

function renderMobileSunControls(): void {
  const controls = document.querySelector<HTMLElement>('#mobile-sun-controls')!
  const visible = state.sceneId === 'sun-path'
  controls.hidden = !visible
  document.body.classList.toggle('sun-quick-visible', visible)
  if (!visible) {
    controls.replaceChildren()
    return
  }

  const seasonAngle = state.parameters.seasonAngle ?? SCENE_BY_ID['sun-path'].defaultParameters.seasonAngle ?? 0
  const seasonNames = ['春分', '夏至', '秋分', '冬至']
  const seasonIndex = Math.round(seasonAngle / 90) % 4
  const seasonLabel = Math.abs(seasonAngle % 90) < .5 ? seasonNames[seasonIndex] : `${seasonAngle.toFixed(0)}°`
  const speedOptions = [.25, 1, 4, 16, 64].map((speed) => `<option value="${speed}" ${state.speed === speed ? 'selected' : ''}>${speed}×</option>`).join('')

  controls.innerHTML = state.mode === 'teaching' ? `
    <div class="sun-quick-grid">
      <label><span>季節</span><input type="range" min="0" max="360" step="1" value="${seasonAngle}" data-quick-parameter="seasonAngle" aria-label="快速調整季節"><output data-quick-output="seasonAngle">${seasonLabel}</output></label>
      <label><span>時間</span><input type="range" min="0" max="1" step="0.001" value="${state.timeline}" data-quick-timeline aria-label="快速調整時間"><output data-quick-output="timeline">${timelineLabel()}</output></label>
      <label><span>緯度</span><input type="range" min="-90" max="90" step=".1" value="${state.parameters.latitude ?? 25.033}" data-quick-parameter="latitude" aria-label="快速調整緯度"><output data-quick-output="latitude">${(state.parameters.latitude ?? 25.033).toFixed(1)}°</output></label>
      <label><span>速度</span><select id="sun-quick-speed" aria-label="快速調整速度">${speedOptions}</select><output>${state.speed}×</output></label>
    </div>
    <div class="sun-quick-latitudes" aria-label="常用緯度">${[90, 66.5, 45, 23.5, 0, -23.5, -45, -66.5, -90].map((latitude) => `<button data-quick-latitude="${latitude}">${latitude > 0 ? `${latitude}°N` : latitude < 0 ? `${Math.abs(latitude)}°S` : '赤道'}</button>`).join('')}</div>
  ` : `
    <div class="sun-quick-real-grid">
      <label><span>日期時間</span><input type="datetime-local" value="${toLocalInputValue(new Date(state.instant))}" data-quick-instant aria-label="快速日期"></label>
      <label><span>緯度</span><input type="number" min="-90" max="90" step=".0001" value="${state.observer.latitude}" data-quick-observer="latitude" aria-label="快速南北位置"></label>
      <label><span>經度</span><input type="number" min="-180" max="180" step=".0001" value="${state.observer.longitude}" data-quick-observer="longitude" aria-label="快速東西位置"></label>
      <label><span>速度</span><select id="sun-quick-speed" aria-label="快速調整速度">${speedOptions}</select></label>
    </div>
  `
}

function realControls(): string {
  return `<label class="field-label">日期與時間
      <input class="field-input" id="instant-input" type="datetime-local" min="1600-01-01T00:00" max="2600-12-31T23:59" value="${toLocalInputValue(new Date(state.instant))}" />
    </label>
    <div class="coordinate-grid control-row">
      <label class="field-label">緯度<input class="field-input" id="latitude-input" required type="number" min="-90" max="90" step="0.0001" value="${state.observer.latitude}" /></label>
      <label class="field-label">經度<input class="field-input" id="longitude-input" required type="number" min="-180" max="180" step="0.0001" value="${state.observer.longitude}" /></label>
    </div>
    <div class="action-row control-row"><button class="ghost-button" data-action="use-location">使用裝置位置</button><button class="ghost-button" data-action="use-now">回到現在</button></div>
    <p class="inline-status" id="location-status">只有按下按鈕後才會要求定位權限。</p>`
}

function toLocalInputValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

function renderTransport(): void {
  const timeline = document.querySelector<HTMLInputElement>('#timeline')!
  const window = eclipseWindow()
  const current = Date.parse(state.instant)
  const realFraction = window ? (current - window[0]) / (window[1] - window[0]) : (new Date(current).getUTCHours() * 3600 + new Date(current).getUTCMinutes() * 60 + new Date(current).getUTCSeconds()) / 86400
  timeline.value = String(state.mode === 'real' ? Math.max(0, Math.min(1, realFraction)) : state.timeline)
  timeline.setAttribute('aria-valuetext', timelineLabel())
  const instantInput = document.querySelector<HTMLInputElement>('#instant-input')
  if (instantInput && document.activeElement !== instantInput) instantInput.value = toLocalInputValue(new Date(state.instant))
  const quickInstant = document.querySelector<HTMLInputElement>('[data-quick-instant]')
  if (quickInstant && document.activeElement !== quickInstant) quickInstant.value = toLocalInputValue(new Date(state.instant))
  document.querySelector<HTMLSelectElement>('#speed')!.value = String(state.speed)
  const drawerSpeed = document.querySelector<HTMLSelectElement>('#drawer-speed')
  if (drawerSpeed) drawerSpeed.value = String(state.speed)
  const quickTimeline = document.querySelector<HTMLInputElement>('[data-quick-timeline]')
  if (quickTimeline && document.activeElement !== quickTimeline) quickTimeline.value = String(state.timeline)
  const quickTimelineOutput = document.querySelector<HTMLOutputElement>('[data-quick-output="timeline"]')
  if (quickTimelineOutput) quickTimelineOutput.value = timelineLabel()
  const quickSpeed = document.querySelector<HTMLSelectElement>('#sun-quick-speed')
  if (quickSpeed) quickSpeed.value = String(state.speed)
  if ((state.sceneId === 'moon-phases' || state.sceneId === 'eclipses') && state.mode === 'teaching') {
    const localHour = state.sceneId === 'moon-phases'
      ? teachingSolarTime(state.parameters.observerSolarHour ?? 12, state.timeline)
      : teachingEclipseSolarTime(state.parameters.observerSolarHour ?? 12, state.timeline, state.parameters.eclipseType ?? 0)
    const clock = document.querySelector<HTMLInputElement>('#parameter-observerSolarHour')
    if (clock && document.activeElement !== clock) clock.value = String(localHour)
    const clockOutput = document.querySelector<HTMLOutputElement>('[data-output="observerSolarHour"]')
    if (clockOutput) clockOutput.value = formatSolarHour(localHour)
  }
  const play = document.querySelector<HTMLButtonElement>('[data-action="play"]')!
  play.textContent = state.playing ? 'Ⅱ' : '▶'
  play.setAttribute('aria-label', state.playing ? '暫停' : '播放')
  document.querySelector('#timeline-readout')!.textContent = timelineLabel()
  document.querySelectorAll<HTMLAnchorElement>('[data-legacy-sun-link]').forEach((link) => {
    link.search = toUrlSearchParams(state).toString()
  })
}

function timelineLabel(): string {
  if (state.mode === 'real') return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(state.instant))
  if (state.sceneId === 'sun-path') {
    const hours = state.timeline * 24
    return `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor(hours % 1 * 60)).padStart(2, '0')}`
  }
  if (['moon-phases', 'eclipses', 'tides'].includes(state.sceneId)) return moonPhaseFromAngle(state.timeline * 360).name
  return `${Math.round(state.timeline * 360)}°`
}

function renderMetrics(metrics: readonly SceneMetric[]): void {
  latestMetrics = metrics
  document.querySelector('#metrics')!.innerHTML = metrics.map((metric) => `<div class="metric"><span class="metric-label">${metric.label}</span><span class="metric-value">${metric.value}</span></div>`).join('')
  const details = document.querySelector('#detail-metrics')
  if (details) details.innerHTML = metrics.map((metric) => `<p class="control-label"><span>${metric.label}</span><span>${metric.value}</span></p>`).join('')
}

function setCanvasStatus(message: string): void {
  const panel = document.querySelector('#canvas-message')!
  document.querySelector('#canvas-message-text')!.textContent = message
  panel.classList.toggle('visible', Boolean(message))
}

function showTransientStatus(message: string): void {
  window.clearTimeout(statusTimer)
  const toast = document.querySelector('#status-toast')!
  toast.textContent = message
  toast.classList.add('visible')
  statusTimer = window.setTimeout(() => toast.classList.remove('visible'), 3000)
}

function urlForState(): URL {
  const url = new URL(window.location.href)
  url.search = toUrlSearchParams(state).toString()
  return url
}

function syncUrl(): void {
  window.clearTimeout(urlTimer)
  urlTimer = window.setTimeout(() => {
    const url = urlForState()
    if (url.href === window.location.href) return
    try {
      window.history.replaceState(null, '', url)
      lastUrlWrite = performance.now()
    } catch {
      // Some browsers rate-limit history updates; simulation and sharing remain usable.
      lastUrlWrite = performance.now() + 1000
      syncUrl()
    }
  }, Math.max(0, 250 - (performance.now() - lastUrlWrite)))
}

function updateObserverFromInputs(): void {
  const inputs = ['latitude-input', 'longitude-input'].map((id) => document.querySelector<HTMLInputElement>(`#${id}`)!)
  if (!inputs.every((input) => input.reportValidity())) return
  const latitude = Number(document.querySelector<HTMLInputElement>('#latitude-input')?.value)
  const longitude = Number(document.querySelector<HTMLInputElement>('#longitude-input')?.value)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
  dispatch({ type: 'set-observer', observer: { latitude, longitude, elevation: state.observer.elevation } })
}

function useDeviceLocation(): void {
  const status = document.querySelector('#location-status')
  if (!navigator.geolocation) {
    if (status) status.textContent = '此瀏覽器不支援定位，仍可手動輸入經緯度。'
    return
  }
  if (status) status.textContent = '正在取得位置…'
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => dispatch({ type: 'set-observer', observer: { latitude: coords.latitude, longitude: coords.longitude, elevation: Math.max(0, coords.altitude ?? 0) } }),
    () => {
      const next = document.querySelector('#location-status')
      if (next) next.textContent = '未取得定位權限；已保留目前座標，可繼續手動輸入。'
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
  )
}

function jumpToEclipse(kind: 'solar' | 'lunar'): void {
  try {
    selectedEclipse = undefined
    const result = kind === 'solar'
      ? astronomy.nextSolarEclipse(new Date(state.instant), state.observer)
      : astronomy.nextLunarEclipse(new Date(state.instant), state.observer)
    selectedEclipse = { kind, result, observerKey: observerKey() }
    dispatch({ type: 'set-instant', instant: result.peak.toISOString() })
  } catch {
    const status = document.querySelector('#eclipse-status')
    if (status) status.textContent = '暫時無法計算此日期之後的食象。'
  }
}

function observerKey(): string {
  return `${state.observer.latitude},${state.observer.longitude},${state.observer.elevation}`
}

function eclipseWindow(): readonly [number, number] | undefined {
  if (!selectedEclipse || state.sceneId !== 'eclipses' || state.mode !== 'real' || selectedEclipse.observerKey !== observerKey()) return undefined
  const contacts = selectedEclipse.result.contacts ?? selectedEclipse.result.local?.contacts
  const peak = selectedEclipse.result.peak.getTime()
  return contacts ? [contacts.start.getTime() - 10 * 60000, contacts.end.getTime() + 10 * 60000] : [peak - 3 * 3600000, peak + 3 * 3600000]
}

function eclipseStatus(): string {
  if (!selectedEclipse || selectedEclipse.observerKey !== observerKey()) return '依選定位置計算整段食相可見性。時間採裝置時區；忽略地形與天氣。'
  const { kind, result } = selectedEclipse
  const names: Readonly<Record<string, string>> = { total: '全食', annular: '環食', partial: '偏食', penumbral: '半影月食' }
  const local = result.local
  const visibility = result.visible ? '所在地可見部分或全部食相' : '所在地不可見'
  const contacts = result.contacts ?? local?.contacts
  const times = contacts ? `；接觸 ${contacts.start.toLocaleTimeString('zh-TW')}～${contacts.end.toLocaleTimeString('zh-TW')}` : ''
  const localType = local ? `；所在地：${names[local.kind] ?? local.kind}` : ''
  return `${result.peak.toLocaleString('zh-TW')}・${kind === 'solar' ? '日食' : '月食'}・${names[result.kind] ?? result.kind}・${visibility}${localType}${times}（裝置時區；幾何地平線）`
}

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button')
  if (!target) return
  if (target.dataset.view === 'space' || target.dataset.view === 'observer') {
    dispatch({ type: 'set-view', viewMode: target.dataset.view })
    return
  }
  if (target.dataset.look === 'Sun' || target.dataset.look === 'Moon') {
    if (!stage.lookAtBody(target.dataset.look)) showTransientStatus(`${target.dataset.look === 'Sun' ? '太陽' : '月球'}目前在地平線下`)
    return
  }
  if (target.dataset.controlTab === 'model' || target.dataset.controlTab === 'display' || target.dataset.controlTab === 'info') {
    mobileControlTab = target.dataset.controlTab
    updateControlTabs()
    return
  }
  const sceneId = target.dataset.scene as SceneId | undefined
  if (sceneId) return selectScene(sceneId)
  if (target.dataset.preset) return applyPreset(target.dataset.preset)
  if (target.dataset.quickLayer) return dispatch({ type: 'toggle-layer', layer: target.dataset.quickLayer as keyof SimulationState['layers'] })
  if (target.dataset.quickLatitude) {
    dispatch({ type: 'set-parameter', key: 'latitude', value: Number(target.dataset.quickLatitude) })
    return
  }
  if (target.dataset.camera) {
    dispatch({ type: 'set-camera', cameraPreset: target.dataset.camera })
    stage.focusCamera(target.dataset.camera)
    return
  }
  if (target.dataset.mobileCamera) {
    dispatch({ type: 'set-camera', cameraPreset: target.dataset.mobileCamera })
    stage.focusCamera(target.dataset.mobileCamera)
    return
  }
  if (target.dataset.layer) return dispatch({ type: 'toggle-layer', layer: target.dataset.layer as keyof SimulationState['layers'] })
  if (target.dataset.mode === 'teaching' || target.dataset.mode === 'real') return setSimulationMode(target.dataset.mode)
  if (target.dataset.season) {
    const seasons = astronomy.seasons(new Date(state.instant).getUTCFullYear())
    const instant = seasons[target.dataset.season as keyof typeof seasons]
    if (instant) dispatch({ type: 'set-instant', instant: instant.toISOString() })
    return
  }
  switch (target.dataset.action) {
    case 'toggle-nav': {
      const collapsed = document.body.classList.toggle('nav-collapsed')
      try { sessionStorage.setItem('hu-gege-celestial-lab:nav-collapsed', String(collapsed)) } catch { /* The menu still works without storage. */ }
      updateSceneNav()
      break
    }
    case 'unlock-developer': {
      const password = document.querySelector<HTMLInputElement>('#developer-password')?.value ?? ''
      if (password === '0000') {
        developerUnlocked = true
        developerError = ''
        try { window.sessionStorage.setItem(DEVELOPER_UNLOCK_KEY, 'true') } catch { /* private browsing may block storage */ }
        renderAll()
        showTransientStatus('開發者功能已解鎖')
      } else {
        developerError = '密碼錯誤，請輸入四位數密碼。'
        const error = document.querySelector('#developer-error')
        if (error) error.textContent = developerError
      }
      break
    }
    case 'play': dispatch({ type: 'set-playing', playing: !state.playing }); break
    case 'step': stepSimulation(); break
    case 'reset': resetScene(); break
    case 'open-panel': setDrawerOpen(true); break
    case 'close-panel': setDrawerOpen(false); break
    case 'toggle-inset': {
      stageWrap.classList.toggle('inset-open')
      updateInsetToggle()
      stage.resize()
      break
    }
    case 'fullscreen': {
      if (document.body.classList.contains('pseudo-fullscreen')) document.body.classList.remove('pseudo-fullscreen')
      else if (document.fullscreenElement) void document.exitFullscreen().catch(() => showTransientStatus('無法退出全螢幕'))
      else {
        const expand = () => { document.body.classList.add('pseudo-fullscreen'); showTransientStatus('模型已展開，可按返回實驗室退出') }
        const request = document.documentElement.requestFullscreen?.()
        if (request) void request.catch(expand)
        else expand()
      }
      break
    }
    case 'share': {
      syncUrl()
      const url = urlForState().href
      if (!navigator.clipboard) showTransientStatus('請從網址列複製連結')
      else void navigator.clipboard.writeText(url).then(() => showTransientStatus('分享連結已複製')).catch(() => showTransientStatus('請從網址列複製連結'))
      break
    }
    case 'about': document.querySelector<HTMLDialogElement>('#about-dialog')?.showModal(); break
    case 'close-about': document.querySelector<HTMLDialogElement>('#about-dialog')?.close(); break
    case 'use-location': useDeviceLocation(); break
    case 'use-now': selectedEclipse = undefined; dispatch({ type: 'set-instant', instant: new Date().toISOString() }); break
    case 'next-solar': jumpToEclipse('solar'); break
    case 'next-lunar': jumpToEclipse('lunar'); break
    case 'next-local-solar': {
      try {
        const result = astronomy.nextLocalSolarEclipse(new Date(state.instant), state.observer)
        selectedEclipse = { kind: 'solar', result, observerKey: observerKey() }
        dispatch({ type: 'set-instant', instant: result.peak.toISOString() })
      } catch { showTransientStatus('無法計算此日期之後的所在地日食') }
      break
    }
  }
})

app.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement
  if (input.dataset.quickTimeline !== undefined) {
    dispatch({ type: 'set-timeline', timeline: Number(input.value) }, false)
    const output = document.querySelector<HTMLOutputElement>('[data-quick-output="timeline"]')
    if (output) output.value = timelineLabel()
  }
  if (input.dataset.quickParameter) {
    const value = Number(input.value)
    dispatch({ type: 'set-parameter', key: input.dataset.quickParameter, value }, false)
    document.querySelectorAll('[data-preset]').forEach((button) => button.setAttribute('aria-pressed', 'false'))
    const output = document.querySelector<HTMLOutputElement>(`[data-quick-output="${input.dataset.quickParameter}"]`)
    if (output) output.value = input.dataset.quickParameter === 'seasonAngle'
      ? (Math.abs(value % 90) < .5 ? ['春分', '夏至', '秋分', '冬至'][Math.round(value / 90) % 4]! : `${value.toFixed(0)}°`)
      : `${value.toFixed(1)}°`
  }
  if (input.id === 'timeline') {
    const timeline = Number(input.value)
    if (state.mode === 'real') {
      const window = eclipseWindow()
      const date = new Date(state.instant)
      if (window) date.setTime(window[0] + timeline * (window[1] - window[0]))
      else { date.setUTCHours(0, 0, 0, 0); date.setTime(date.getTime() + timeline * 86_400_000) }
      state = simulationReducer(state, { type: 'set-instant', instant: date.toISOString() })
    }
    dispatch({ type: 'set-timeline', timeline }, false)
  }
  if (input.dataset.parameter) {
    const value = Number(input.value)
    const teachingClock = state.mode === 'teaching' && input.dataset.parameter === 'observerSolarHour'
    const initialHour = teachingClock && state.sceneId === 'moon-phases' ? teachingInitialSolarTime(value, state.timeline)
      : teachingClock && state.sceneId === 'eclipses' ? teachingInitialEclipseSolarTime(value, state.timeline, state.parameters.eclipseType ?? 0)
      : value
    dispatch({ type: 'set-parameter', key: input.dataset.parameter, value: initialHour }, false)
    document.querySelectorAll('[data-preset]').forEach((button) => button.setAttribute('aria-pressed', 'false'))
    const output = document.querySelector<HTMLOutputElement>(`[data-output="${input.dataset.parameter}"]`)
    if (output) output.value = input.dataset.parameter === 'observerSolarHour' ? formatSolarHour(value) : `${value}${input.dataset.unit ?? ''}`
  }
})

app.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement | HTMLSelectElement
  if (input.dataset.parameter && input.tagName === 'SELECT') dispatch({ type: 'set-parameter', key: input.dataset.parameter, value: Number(input.value) })
  if (input.id === 'speed' || input.id === 'drawer-speed' || input.id === 'sun-quick-speed') dispatch({ type: 'set-speed', speed: Number(input.value) })
  if (input.dataset.parameter && input.tagName === 'SELECT') dispatch({ type: 'set-parameter', key: input.dataset.parameter, value: Number(input.value) })
  if (input.id === 'instant-input' && input.value && Number.isFinite(Date.parse(input.value)) && input.checkValidity()) { selectedEclipse = undefined; dispatch({ type: 'set-instant', instant: new Date(input.value).toISOString() }) }
  if (input.dataset.quickInstant !== undefined && input.value && Number.isFinite(Date.parse(input.value)) && input.checkValidity()) {
    selectedEclipse = undefined
    dispatch({ type: 'set-instant', instant: new Date(input.value).toISOString() })
  }
  if (input.dataset.quickObserver && input.checkValidity()) {
    const value = Number(input.value)
    if (Number.isFinite(value)) dispatch({
      type: 'set-observer',
      observer: { ...state.observer, [input.dataset.quickObserver]: value }
    })
  }
  if (input.id === 'latitude-input' || input.id === 'longitude-input') updateObserverFromInputs()
})

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (document.body.classList.contains('panel-open')) setDrawerOpen(false)
    document.body.classList.remove('pseudo-fullscreen')
  }
  if (event.key === 'Tab' && drawerMedia.matches && document.body.classList.contains('panel-open')) {
    const panel = document.querySelector<HTMLElement>('#control-panel')!
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button, input, select, summary, a[href]'))
      .filter((element) => !element.inert && !element.hasAttribute('disabled') && element.getClientRects().length > 0)
    const first = focusable[0]
    const last = focusable.at(-1)
    if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault()
      const destination = event.shiftKey ? last : first
      destination.focus()
    }
  }
  const tag = (event.target as HTMLElement).tagName
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(tag) || document.querySelector<HTMLDialogElement>('#about-dialog')?.open) return
  if (event.code === 'Space') {
    event.preventDefault()
    dispatch({ type: 'set-playing', playing: !state.playing })
  }
  if (state.viewMode === 'observer' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.code.startsWith('Arrow')) {
      event.preventDefault()
      heldLookKeys.add(event.code)
      if (event.shiftKey) heldLookKeys.add('ShiftLeft')
      return
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') heldLookKeys.add(event.code)
  }
  if (event.code === 'ArrowRight') stepSimulation()
})

window.addEventListener('keyup', (event) => {
  heldLookKeys.delete(event.code)
  if (!event.shiftKey) { heldLookKeys.delete('ShiftLeft'); heldLookKeys.delete('ShiftRight') }
})
window.addEventListener('blur', () => heldLookKeys.clear())
document.addEventListener('visibilitychange', () => { if (document.hidden) heldLookKeys.clear() })

window.addEventListener('beforeunload', () => stage.dispose())
