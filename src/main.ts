import './style.css'
import { moonPhaseFromAngle } from './core/astro-math'
import { createInitialState, parseUrlState, simulationReducer, toUrlSearchParams, type SimulationAction } from './core/state'
import type { SceneId, SimulationState } from './core/types'
import { SCENE_BY_ID, SCENE_DEFINITIONS } from './scenes/definitions'
import { createAstronomyProvider, type EclipseSummary } from './services/astronomy-provider'
import { createStage } from './rendering/stage'
import type { CameraPreset, SceneMetric } from './scenes/visuals'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('找不到應用程式掛載點。')

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div class="brand-copy">
          <h1 class="brand-title">胡哥哥天體運動 3D 實驗室</h1>
          <div class="brand-subtitle">Celestial Motion Lab</div>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="mode-switch" aria-label="模擬模式">
          <button class="mode-button" data-mode="teaching">教學</button>
          <button class="mode-button" data-mode="real">真實</button>
        </div>
        <span class="location-chip" id="location-chip"></span>
        <button class="icon-button" data-action="share" aria-label="複製分享連結" title="複製分享連結">↗</button>
        <button class="icon-button" data-action="fullscreen" aria-label="切換全螢幕" title="全螢幕">⛶</button>
        <button class="icon-button" data-action="about" aria-label="資料與使用說明" title="關於">i</button>
      </div>
    </header>

    <main class="workspace">
      <nav class="scene-nav" aria-label="教學場景">
        <p class="nav-heading">實驗場景</p>
        <div class="scene-list" id="scene-list"></div>
      </nav>

      <section class="stage-wrap" id="stage-wrap" aria-label="三維天體模型">
        <canvas id="stage-canvas" tabindex="0" aria-label="可拖曳、縮放與旋轉的 3D 天體模型；空白鍵播放，右方向鍵逐格"></canvas>
        <div class="stage-heading">
          <div class="stage-eyebrow" id="stage-eyebrow"></div>
          <h2 class="stage-title" id="stage-title"></h2>
          <p class="stage-description" id="stage-description"></p>
        </div>
        <div class="scale-badge" id="scale-badge">教學示意・非等比例</div>
        <div class="camera-toolbar" id="camera-toolbar" aria-label="相機視角"></div>
        <div class="metrics" id="metrics" aria-label="觀測數據"></div>
        <button class="fullscreen-exit ghost-button" data-action="fullscreen" aria-label="退出展開模型">返回實驗室</button>
        <div class="canvas-message" id="canvas-message" role="alert">
          <div><h2>無法顯示 3D 模型</h2><p id="canvas-message-text"></p></div>
        </div>
      </section>

      <aside class="control-panel" id="control-panel" aria-label="場景控制面板">
        <div class="control-panel-header">
          <p class="section-kicker">觀測控制</p>
          <button class="panel-close" data-action="close-panel" aria-label="關閉控制面板">關閉</button>
        </div>
        <div id="control-content"></div>
      </aside>
    </main>

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
        <button class="panel-toggle" data-action="open-panel" aria-expanded="false">調整模型</button>
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
let state = initializeState()
let cameras: readonly CameraPreset[] = []
let statusTimer = 0
let urlTimer = 0
let lastUrlWrite = -Infinity
let latestMetrics: readonly SceneMetric[] = []
let selectedEclipse: { readonly kind: 'solar' | 'lunar'; readonly result: EclipseSummary; readonly observerKey: string } | undefined

const canvas = document.querySelector<HTMLCanvasElement>('#stage-canvas')!
const stageWrap = document.querySelector<HTMLElement>('#stage-wrap')!
const stage = createStage(canvas, stageWrap, astronomy, {
  onAdvance: advanceSimulation,
  onMetrics: renderMetrics,
  onStatus: setCanvasStatus
})

cameras = stage.setScene(SCENE_BY_ID[state.sceneId])
stage.setState(state)
renderAll()
const drawerMedia = window.matchMedia('(max-width: 900px)')
function updateDrawerAccessibility(): void {
  const panel = document.querySelector<HTMLElement>('#control-panel')!
  panel.inert = drawerMedia.matches && !document.body.classList.contains('panel-open')
  document.querySelector('[data-action="open-panel"]')?.setAttribute('aria-expanded', String(!panel.inert && drawerMedia.matches))
}
drawerMedia.addEventListener('change', updateDrawerAccessibility)
updateDrawerAccessibility()

function setDrawerOpen(open: boolean): void {
  document.body.classList.toggle('panel-open', open)
  updateDrawerAccessibility()
  const focus = document.querySelector<HTMLElement>(open ? '[data-action="close-panel"]' : '[data-action="open-panel"]')
  focus?.focus({ preventScroll: true })
}

function initializeState(): SimulationState {
  const parsed = parseUrlState(new URLSearchParams(window.location.search))
  const definition = SCENE_BY_ID[parsed.sceneId]
  const cameraIds: Readonly<Record<SceneId, readonly string[]>> = {
    'celestial-sphere': ['inside', 'outside', 'horizon'],
    'sun-path': ['horizon', 'outside', 'top', 'seasons'],
    'moon-phases': ['top', 'angled', 'earth'],
    eclipses: ['side', 'moon', 'surface'],
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
  else renderTransport()
  syncUrl()
}

function selectScene(sceneId: SceneId): void {
  const definition = SCENE_BY_ID[sceneId]
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
    const secondsPerSecond = state.sceneId === 'eclipses' ? 60 : state.sceneId === 'kepler' ? 864000 : state.sceneId === 'moon-phases' ? 86400 : 3600
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
}

function stepSimulation(): void {
  if (state.mode === 'real') {
    const next = new Date(new Date(state.instant).getTime() + (state.sceneId === 'eclipses' ? 60_000 : state.sceneId === 'kepler' || state.sceneId === 'moon-phases' ? 86_400_000 : 3_600_000))
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
  renderSceneNav()
  document.querySelector('#stage-eyebrow')!.textContent = definition.eyebrow
  document.querySelector('#stage-title')!.textContent = definition.title
  document.querySelector('#stage-description')!.textContent = definition.description
  document.querySelector('#scale-badge')!.textContent = state.mode === 'real' ? '真實方向・尺寸非等比例' : '教學示意・非等比例'
  renderTopbar()
  renderCameras()
  renderControls()
  renderTransport()
  const note = document.querySelector<HTMLDetailsElement>('.lesson-note')
  if (note) note.open = noteOpen
  if (active && !active.isConnected) {
    const next = focusId ? document.getElementById(focusId) : focusData ? Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => Object.entries(focusData).every(([key, value]) => button.dataset[key] === value)) : undefined
    next?.focus({ preventScroll: true })
  }
}

function renderSceneNav(): void {
  document.querySelector('#scene-list')!.innerHTML = SCENE_DEFINITIONS.map((definition, index) => `
    <button class="scene-button" data-scene="${definition.id}" aria-current="${definition.id === state.sceneId ? 'page' : 'false'}">
      <span class="scene-number">0${index + 1}</span><span class="scene-label">${definition.shortLabel}</span>
    </button>`).join('')
}

function renderTopbar(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode))
  })
  document.querySelector('#location-chip')!.textContent = state.mode === 'real'
    ? `${state.observer.latitude.toFixed(2)}°, ${state.observer.longitude.toFixed(2)}°`
    : '台北基準・可自由調整'
}

function renderCameras(): void {
  document.querySelector('#camera-toolbar')!.innerHTML = cameras.map((camera) => `
    <button class="camera-button" data-camera="${camera.id}" aria-pressed="${camera.id === state.cameraPreset}">${camera.label}</button>`).join('')
}

function renderControls(): void {
  const definition = SCENE_BY_ID[state.sceneId]
  const presetHtml = definition.presets.map((preset) => `
    <button class="preset-button" data-preset="${preset.id}" aria-pressed="${preset.id === state.presetId}">
      <span class="preset-label">${preset.label}</span><span class="preset-desc">${preset.description}</span>
    </button>`).join('')
  const renderParameter = (slider: (typeof definition.controls)[number]): string => {
    const value = state.parameters[slider.key] ?? definition.defaultParameters[slider.key] ?? slider.min
    if (slider.options) return `<label class="field-label control-row">${slider.label}<select class="field-input" id="parameter-${slider.key}" data-parameter="${slider.key}">${slider.options.map((option) => `<option value="${option.value}" ${option.value === value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>`
    return `<div class="control-row">
      <label class="control-label" for="parameter-${slider.key}"><span>${slider.label}</span><output class="control-value" data-output="${slider.key}">${value.toFixed(slider.step < .1 ? 2 : 1)}${slider.unit}</output></label>
      <input type="range" id="parameter-${slider.key}" data-parameter="${slider.key}" data-unit="${slider.unit}" min="${slider.min}" max="${slider.max}" step="${slider.step}" value="${value}" />
    </div>`
  }
  // Keep the control list stable while a value changes.  In particular, the
  // real-mode Kepler view still shows the selected-planet control even when
  // the camera is switched to the Earth-centred comparison view.  Hiding it
  // would reorder/remove DOM controls mid-interaction and break keyboard and
  // assistive-technology navigation.
  const sliderHtml = state.mode === 'teaching' ? definition.controls.filter((control) => !control.onlyInReal).map(renderParameter).join('') : realControls() + definition.controls.filter((control) => control.availableInReal).map(renderParameter).join('')
  const seasonActions = state.sceneId === 'sun-path' && state.mode === 'real' ? `<section class="control-section"><p class="section-kicker">${new Date(state.instant).getUTCFullYear()} 年分至點</p><div class="action-row">${[['marchEquinox', '春分'], ['juneSolstice', '夏至'], ['septemberEquinox', '秋分'], ['decemberSolstice', '冬至']].map(([key, name]) => `<button class="ghost-button" data-season="${key}">${name}</button>`).join('')}</div></section>` : ''

  const eclipseActions = state.sceneId === 'eclipses' && state.mode === 'real' ? `
    <div class="control-section"><p class="section-kicker">下一次食象</p>
      <div class="action-row"><button class="ghost-button" data-action="next-solar">全球日食</button><button class="ghost-button" data-action="next-lunar">月食</button><button class="ghost-button" data-action="next-local-solar">所在地日食</button></div>
      <p class="inline-status" id="eclipse-status" role="status">${eclipseStatus()}</p>
    </div>` : ''

  document.querySelector('#control-content')!.innerHTML = `
    <section class="control-section"><p class="section-kicker">快速情境${state.mode === 'real' ? '・選取後進入教學模式' : ''}</p><div class="preset-grid">${presetHtml}</div></section>
    <section class="control-section"><p class="section-kicker">${state.mode === 'real' ? '日期與觀察位置' : '模型參數'}</p>${sliderHtml}</section>
    ${eclipseActions}
    ${seasonActions}
    <section class="control-section"><p class="section-kicker">顯示圖層</p><div class="layer-list">
      ${(['labels', 'paths', 'shadows'] as const).map((layer) => `<button class="layer-toggle" data-layer="${layer}" aria-pressed="${state.layers[layer]}">${layer === 'labels' ? '標籤' : layer === 'paths' ? '軌跡' : '光影'}</button>`).join('')}
    </div></section>
    <section class="control-section mobile-only"><p class="section-kicker">課堂連結</p><button class="ghost-button" data-action="share">複製目前場景連結</button></section>
    <section class="control-section drawer-transport"><p class="section-kicker">時間操作</p>
      <div class="action-row"><button class="ghost-button" data-action="step">向前一步</button><button class="ghost-button" data-action="reset">重設場景</button>
      <label class="field-label">播放倍率<select class="speed-select" id="drawer-speed"><option value="0.25">0.25×</option><option value="1">1×</option><option value="4">4×</option><option value="16">16×</option><option value="64">64×</option></select></label></div>
    </section>
    <section class="control-section"><p class="section-kicker">完整觀測數據</p><div id="detail-metrics"></div></section>
    <section class="control-section"><details class="lesson-note" open><summary>教學提示與課綱對應</summary>
      <ul>${definition.focus.map((item) => `<li>${item}</li>`).join('')}</ul>
      <div class="misconception"><strong>常見迷思：</strong>${definition.misconception}</div>
      <div class="curriculum"><span class="code-tag">${definition.grades}</span>${definition.curriculumCodes.map((code) => `<span class="code-tag">${code}</span>`).join('')}</div>
    </details></section>`
  renderMetrics(latestMetrics)
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
  document.querySelector<HTMLSelectElement>('#speed')!.value = String(state.speed)
  const drawerSpeed = document.querySelector<HTMLSelectElement>('#drawer-speed')
  if (drawerSpeed) drawerSpeed.value = String(state.speed)
  const play = document.querySelector<HTMLButtonElement>('[data-action="play"]')!
  play.textContent = state.playing ? 'Ⅱ' : '▶'
  play.setAttribute('aria-label', state.playing ? '暫停' : '播放')
  document.querySelector('#timeline-readout')!.textContent = timelineLabel()
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
  const sceneId = target.dataset.scene as SceneId | undefined
  if (sceneId) return selectScene(sceneId)
  if (target.dataset.preset) return applyPreset(target.dataset.preset)
  if (target.dataset.camera) return dispatch({ type: 'set-camera', cameraPreset: target.dataset.camera })
  if (target.dataset.layer) return dispatch({ type: 'toggle-layer', layer: target.dataset.layer as keyof SimulationState['layers'] })
  if (target.dataset.mode === 'teaching' || target.dataset.mode === 'real') return dispatch({ type: 'set-mode', mode: target.dataset.mode })
  if (target.dataset.season) {
    const seasons = astronomy.seasons(new Date(state.instant).getUTCFullYear())
    const instant = seasons[target.dataset.season as keyof typeof seasons]
    if (instant) dispatch({ type: 'set-instant', instant: instant.toISOString() })
    return
  }
  switch (target.dataset.action) {
    case 'play': dispatch({ type: 'set-playing', playing: !state.playing }); break
    case 'step': stepSimulation(); break
    case 'reset': resetScene(); break
    case 'open-panel': setDrawerOpen(true); break
    case 'close-panel': setDrawerOpen(false); break
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
    dispatch({ type: 'set-parameter', key: input.dataset.parameter, value }, false)
    document.querySelectorAll('[data-preset]').forEach((button) => button.setAttribute('aria-pressed', 'false'))
    const output = document.querySelector<HTMLOutputElement>(`[data-output="${input.dataset.parameter}"]`)
    if (output) output.value = `${value}${input.dataset.unit ?? ''}`
  }
})

app.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement | HTMLSelectElement
  if (input.dataset.parameter && input.tagName === 'SELECT') dispatch({ type: 'set-parameter', key: input.dataset.parameter, value: Number(input.value) })
  if (input.id === 'speed' || input.id === 'drawer-speed') dispatch({ type: 'set-speed', speed: Number(input.value) })
  if (input.dataset.parameter && input.tagName === 'SELECT') dispatch({ type: 'set-parameter', key: input.dataset.parameter, value: Number(input.value) })
  if (input.id === 'instant-input' && input.value && Number.isFinite(Date.parse(input.value)) && input.checkValidity()) { selectedEclipse = undefined; dispatch({ type: 'set-instant', instant: new Date(input.value).toISOString() }) }
  if (input.id === 'latitude-input' || input.id === 'longitude-input') updateObserverFromInputs()
})

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (document.body.classList.contains('panel-open')) setDrawerOpen(false)
    document.body.classList.remove('pseudo-fullscreen')
  }
  const tag = (event.target as HTMLElement).tagName
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(tag) || document.querySelector<HTMLDialogElement>('#about-dialog')?.open) return
  if (event.code === 'Space') {
    event.preventDefault()
    dispatch({ type: 'set-playing', playing: !state.playing })
  }
  if (event.code === 'ArrowRight') stepSimulation()
})

window.addEventListener('beforeunload', () => stage.dispose())
