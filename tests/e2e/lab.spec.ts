import { expect, test, type Page } from '@playwright/test'
import { LabPage } from './pages/LabPage'

const primaryScenes = [
  ['太陽', '太陽視運動與四季'],
  ['月相', '月相與月球運動'],
  ['日月食', '日食與月食'],
] as const

const developerScenes = [
  ['天球', '天球與星空運動'],
  ['潮汐', '日月引潮力與潮汐'],
  ['克卜勒', '克卜勒與行星運動']
] as const

const scenes = [...primaryScenes, ...developerScenes] as const

async function skipIfWebGLUnavailable(page: Page): Promise<void> {
  const fallback = page.locator('#canvas-message.visible')
  if (await fallback.isVisible().catch(() => false)) {
    await expect(fallback).toContainText('無法啟用 WebGL 2')
    test.skip(true, '此瀏覽器 runner 沒有可用的 WebGL 2；fallback 已由專用案例驗證')
  }
}

async function unlockDeveloper(page: Page): Promise<void> {
  const tools = page.locator('#developer-tools')
  if (!(await page.locator('#developer-password').isVisible().catch(() => false))) await tools.locator('summary').click()
  await page.getByLabel('解鎖密碼').fill('0000')
  await page.getByRole('button', { name: '解鎖開發者功能', exact: true }).click()
  await expect(page.locator('#developer-lock-state')).toHaveText('✓')
}

async function showInsetInformation(page: Page): Promise<void> {
  const toggle = page.locator('.inset-toggle')
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
}

async function selectPrimaryCamera(page: Page, lab: LabPage, cameraId: string): Promise<void> {
  const toolbarButton = page.locator(`#camera-toolbar [data-camera="${cameraId}"]`)
  if (await toolbarButton.isVisible()) {
    await toolbarButton.click()
    return
  }
  await lab.openControls()
  await lab.selectControlTab('顯示')
  await page.locator(`[data-mobile-camera="${cameraId}"]`).click()
  await lab.closeControls()
}

test('頁首不佔用模型空間且分頁名稱不含個人署名', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open()
  await expect(page).toHaveTitle('天體運動 3D 實驗室')
  await expect(page.getByText('胡哥哥', { exact: false })).toHaveCount(0)
  expect((await page.locator('.topbar').boundingBox())!.height).toBeLessThanOrEqual(48)
})

test('頁面縮放鎖定但 3D 模型保留觸控縮放', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path')
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).toContain('maximum-scale=1.0')
  expect(viewport).toContain('user-scalable=no')
  await expect(page.locator('body')).toHaveCSS('touch-action', 'pan-x pan-y')
  await expect(page.locator('#stage-canvas')).toHaveCSS('touch-action', 'none')
  await expect(page.locator('.sun-view-surface').first()).toHaveCSS('touch-action', 'none')
})

test('太陽可切換原始舊版教材並返回保留參數的新版', async ({ page }) => {
  test.setTimeout(60_000)
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&preset=june-solstice&t=0.5')
  await skipIfWebGLUnavailable(page)
  await lab.openControls()
  await page.getByLabel('觀察緯度').fill('35')
  await lab.closeControls()
  const legacyLink = page.getByRole('link', { name: '切換舊版太陽教材', exact: true })
  if (!(await legacyLink.first().isVisible())) {
    await lab.openControls()
    await lab.selectControlTab('顯示')
  }
  await page.locator('[data-legacy-sun-link]:visible').click()
  await expect(page).toHaveURL(/legacy-sun\.html/)
  await expect(page.locator('#cvsObs')).toBeVisible()
  await expect(page.locator('#cvsSpace')).toBeVisible()
  await page.getByLabel('舊版觀察緯度').fill('0')
  await expect(page.locator('#txtLat')).toHaveText('0.0°N')
  await page.getByRole('button', { name: '自動播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '暫停', exact: true }).click()
  await page.getByRole('link', { name: '返回新版 3D 太陽教材', exact: true }).click()
  await expect(page.getByRole('region', { name: '當地太陽視運動' })).toBeVisible()
  await lab.openControls()
  await expect(page.getByLabel('觀察緯度')).toHaveValue('35')
  await lab.closeControls()
  await lab.selectScene('月相', '月相與月球運動')
  await expect(page.getByRole('link', { name: '切換舊版太陽教材', exact: true })).toHaveCount(0)
})

test('實驗場景可收合、展開，縮放與切換仍可操作', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open()
  const model = page.locator('#stage-wrap')
  await page.setViewportSize({ width: 1440, height: 900 })
  const expanded = await model.boundingBox()
  await page.getByRole('button', { name: '收合實驗場景', exact: true }).click()
  await expect(page.getByRole('button', { name: '展開實驗場景', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => (await model.boundingBox())!.width).toBeGreaterThan(expanded!.width)
  await lab.selectScene('月相', '月相與月球運動')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#scene-list')).toBeVisible()
  await lab.selectScene('日月食', '日食與月食')
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.locator('#scene-list')).toBeHidden()
  await page.getByRole('button', { name: '展開實驗場景', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('六個場景可切換，播放、預設與自由調參可操作', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const lab = new LabPage(page)
  await lab.open()
  await expect(page.locator('#scene-list .scene-button')).toHaveCount(3)
  for (const [label, heading] of primaryScenes) await lab.selectScene(label, heading)
  await unlockDeveloper(page)
  for (const [label, heading] of developerScenes) await lab.selectScene(label, heading)
  await lab.openControls()
  await page.getByRole('button', { name: '第二定律' }).click()
  await expect(page).toHaveURL(/scene=kepler.*preset=second-law/)
  await page.getByLabel('離心率 e').fill('0.35')
  await expect(page).not.toHaveURL(/preset=/)
  await expect(page.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0)
  await lab.closeControls()
  await page.getByRole('button', { name: '播放' }).click()
  await expect(page.getByRole('button', { name: '暫停' })).toBeVisible()
  await page.getByRole('button', { name: '暫停' }).click()
  expect(errors).toEqual([])
})

test('分享網址會還原場景、模式、預設與位置', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&mode=real&preset=equinox&lat=23.5000&lon=121.0000')
  await expect(page.locator('#stage-title')).toHaveText('太陽視運動與四季')
  await expect(page.getByRole('button', { name: '真實' })).toHaveAttribute('aria-pressed', 'true')
  await lab.openControls()
  await expect(page.getByLabel('緯度')).toHaveValue('23.5')
  await expect(page.getByLabel('經度')).toHaveValue('121')
})

test('太陽雙視窗共用時間與季節，旋轉與螢幕方向可獨立操作', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&preset=june-solstice&t=0.5')
  await skipIfWebGLUnavailable(page)
  const local = page.locator('.sun-view[aria-label="當地太陽視運動"]')
  const space = page.locator('.sun-view[aria-label="地球公轉與四季"]')
  const viewTabs = page.getByRole('tablist', { name: '太陽同步模型' })
  await expect(local).toBeVisible()
  if (await viewTabs.isVisible()) {
    await expect(space).toBeHidden()
    await viewTabs.getByRole('tab', { name: '公轉模型' }).click()
    await expect(local).toBeHidden()
  }
  await expect(space).toBeVisible()
  await expect(space.getByText('觀測者自轉軌跡', { exact: true })).toBeVisible()
  await expect(space.getByText('↺ 北極上方看', { exact: true })).toBeVisible()
  await expect(space).toHaveAttribute('data-observer-trail-latitude', '25.033')
  await expect(space).toHaveAttribute('data-observer-trail-style', 'solid')
  await expect(space).toHaveAttribute('data-earth-spin-direction', 'counterclockwise-from-north')
  await expect(space).toHaveAttribute('data-observer-texture-alignment', 'true')
  await expect(local.locator('.sun-view-surface')).not.toHaveAttribute('tabindex', '0')
  await expect(space.locator('.sun-view-surface')).not.toHaveAttribute('tabindex', '0')
  await lab.openControls()
  await page.getByLabel('觀察緯度').fill('45')
  await expect(space).toHaveAttribute('data-observer-trail-latitude', '45')
  await page.getByLabel('公轉角・春分起算').fill('270')
  await expect(space.locator('output')).toContainText('冬至')
  await expect(local.locator('output')).toContainText('赤緯 −23.4°')
  await lab.closeControls()
  await page.getByRole('slider', { name: '時間軸', exact: true }).fill('0.75')
  await expect(local).toHaveAttribute('data-timeline', '0.75')
  await expect(space).toHaveAttribute('data-timeline', '0.75')
  await space.getByRole('button', { name: '四季俯視', exact: true }).click()
  await expect(space).toHaveAttribute('data-view-camera', 'top')
  await expect(page.locator('[data-camera="horizon"]')).toHaveAttribute('aria-pressed', 'true')
  await space.getByRole('button', { name: '自由公轉視角', exact: true }).click()
  await expect(space).toHaveAttribute('data-view-camera', 'free')
  const freeViewport = await space.locator('.sun-view-surface').boundingBox()
  const beforeRotate = await page.locator('#stage-canvas').screenshot()
  await page.mouse.move(freeViewport!.x + freeViewport!.width * .45, freeViewport!.y + freeViewport!.height * .55)
  await page.mouse.down()
  await page.mouse.move(freeViewport!.x + freeViewport!.width * .7, freeViewport!.y + freeViewport!.height * .35, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await page.locator('#stage-canvas').screenshot()).equals(beforeRotate)).toBe(false)
  await space.getByRole('button', { name: '地球晝夜特寫', exact: true }).click()
  await expect(space).toHaveAttribute('data-view-camera', 'earth')
  const viewport = await space.locator('.sun-view-surface').boundingBox()
  const beforeZoom = await page.locator('#stage-canvas').screenshot()
  await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + viewport!.height / 2)
  await page.mouse.wheel(0, -200)
  await expect.poll(async () => (await page.locator('#stage-canvas').screenshot()).equals(beforeZoom)).toBe(false)
  await lab.openControls()
  await page.getByLabel('公轉角・春分起算').fill('180')
  await expect(space.locator('output')).toContainText('秋分')
  await lab.closeControls()
  await expect(space).toHaveAttribute('data-view-camera', 'earth')
  await space.getByRole('button', { name: '自由公轉視角', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(viewTabs).toBeVisible()
  await viewTabs.getByRole('tab', { name: '公轉模型' }).click()
  await expect(local).toBeHidden()
  await expect(space).toBeVisible()
  expect((await space.boundingBox())!.height).toBeGreaterThan(450)
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(local).toBeVisible()
  await expect(space).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('太陽模型明確區分地平面上下並依緯度指向北極星', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&preset=june-solstice&t=0')
  await skipIfWebGLUnavailable(page)
  const local = page.getByRole('region', { name: '當地太陽視運動' })
  await expect(local.getByText('北極星方向', { exact: true })).toBeVisible()
  await expect(local).toHaveAttribute('data-polaris-altitude', '25.033')
  await expect(local).toHaveAttribute('data-horizon-state', 'below')
  await expect(local.locator('output')).toContainText('太陽在地平面下')
  await lab.openControls()
  const quickLatitude = page.getByLabel('快速調整緯度')
  if (await quickLatitude.isVisible()) await quickLatitude.fill('45')
  else await page.getByLabel('觀察緯度').fill('45')
  await expect(local).toHaveAttribute('data-polaris-altitude', '45')
  await lab.selectControlTab('資訊')
  await expect(page.getByText(/正午高度通式：h = 90°/)).toBeVisible()
  await expect(page.locator('#detail-metrics')).toContainText('正午高度公式')
})

test('太陽真實模式把地表觀測點、貼圖與實際晝夜對齊', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&mode=real&time=2026-09-20T14%3A53%3A00Z&lat=24.7733&lon=120.96418')
  await skipIfWebGLUnavailable(page)
  const space = page.locator('.sun-view[aria-label="地球公轉與四季"]')
  await expect(space).toHaveAttribute('data-observer-texture-alignment', 'true')
  await expect(space).toHaveAttribute('data-observer-sun-altitude', '-60.88')
  expect(Number(await space.getAttribute('data-observer-sun-altitude-error'))).toBeLessThan(.3)
  await expect(page.getByRole('region', { name: '當地太陽視運動' }).locator('output')).toContainText('太陽在地平面下 60.7°')
})

test('開發者功能折疊並以四位數密碼解鎖', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open()
  await expect(page.locator('#scene-list .scene-button')).toHaveCount(3)
  await expect(page.locator('#developer-password')).toBeHidden()
  await page.locator('#developer-tools summary').click()
  await page.getByLabel('解鎖密碼').fill('1234')
  await page.getByRole('button', { name: '解鎖開發者功能', exact: true }).click()
  await expect(page.locator('#developer-error')).toContainText('密碼錯誤')
  await page.getByLabel('解鎖密碼').fill('0000')
  await page.getByRole('button', { name: '解鎖開發者功能', exact: true }).click()
  await expect(page.locator('#developer-content .developer-scene-button')).toHaveCount(3)
  await lab.selectScene('克卜勒', '克卜勒與行星運動')
})

test('定位拒絕時保留手動操作', async ({ page, context }) => {
  await context.clearPermissions()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition(_success: PositionCallback, failure: PositionErrorCallback) {
        document.documentElement.dataset.locationRequested = 'true'
        failure({ code: 1, message: 'Permission denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
      }
    } })
  })
  const lab = new LabPage(page)
  await lab.open('?scene=celestial-sphere&mode=real')
  await lab.openControls()
  await expect(page.locator('html')).not.toHaveAttribute('data-location-requested', 'true')
  await page.getByRole('button', { name: '使用裝置位置' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requested', 'true')
  await expect(page.locator('#location-status')).toContainText(/未取得定位權限|不支援定位/)
  await expect(page.getByLabel('緯度')).toBeEnabled()
})

test('地表附近可從地球夜側觀察全月食與偏月食', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=eclipses&preset=total-lunar')
  await skipIfWebGLUnavailable(page)
  await selectPrimaryCamera(page, lab, 'surface')
  await showInsetInformation(page)
  await expect(page.getByText('地球夜側・所見月面', { exact: true })).toBeVisible()
  await expect(page.locator('.phenomenon-caption')).toHaveText('月食：全食')
  await selectPrimaryCamera(page, lab, 'lunar-disc')
  await expect(page.locator('[data-camera="lunar-disc"]')).toHaveAttribute('aria-pressed', 'true')
  await lab.openControls()
  await lab.selectControlTab('模型')
  await page.getByRole('button', { name: '月偏食 月球部分進入本影', exact: true }).click()
  await lab.closeControls()
  await selectPrimaryCamera(page, lab, 'surface')
  await expect(page.getByText('地球夜側・所見月面', { exact: true })).toBeVisible()
  await expect(page.locator('.phenomenon-caption')).toHaveText('月食：偏食')
  await lab.action('向前一步')
  await expect(page.locator('[data-camera="surface"]')).toHaveAttribute('aria-pressed', 'true')
})

test('真實模式區分下點示意與所在地，地平線下不顯示所見圓盤', async ({ page }) => {
  const lab = new LabPage(page)
  for (const [instant, subpoint, belowHorizon] of [
    ['2025-03-14T07:00:00Z', '月下點', '月球在地平線下'],
    ['2024-04-08T18:17:00Z', '日下點', '太陽在地平線下']
  ]) {
    await lab.open(`?scene=eclipses&mode=real&camera=surface&time=${instant}&lat=25.033&lon=121.5654`)
    await skipIfWebGLUnavailable(page)
    await showInsetInformation(page)
    await expect(page.locator('.surface-view-note')).toHaveText(`${subpoint} 3D 示意・非選定所在地`)
    await expect(page.getByText(belowHorizon!, { exact: true })).toBeVisible()
    expect(await page.locator('.scene-inset canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value !== 0)
    })).toBe(false)
  }
})

test('鍵盤與觸控控制有可辨識名稱', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: '暫停' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /3D 天體模型/)
})

test('WebGL 2 不可用時顯示清楚提示', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    const mock = function (this: HTMLCanvasElement, type: string, ...args: unknown[]): unknown {
      if (type === 'webgl2') return null
      return Reflect.apply(original, this, [type, ...args])
    }
    HTMLCanvasElement.prototype.getContext = mock as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('無法啟用 WebGL 2')
})

test('WebGL 初始化拋出錯誤時仍顯示裝置提示', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    const mock = function (this: HTMLCanvasElement, type: string, ...args: unknown[]): unknown {
      if (type === 'webgl2') throw new Error('Graphics driver initialization failed')
      return Reflect.apply(original, this, [type, ...args])
    }
    HTMLCanvasElement.prototype.getContext = mock as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('無法啟用 WebGL 2')
  await expect(page.getByRole('navigation', { name: '教學場景' })).toBeVisible()
})

test('全螢幕按鈕會呼叫瀏覽器全螢幕介面', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function (): Promise<void> {
      document.documentElement.dataset.fullscreenRequested = 'true'
      return Promise.resolve()
    }
  })
  const lab = new LabPage(page)
  await lab.open()
  await page.getByRole('button', { name: '切換全螢幕' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-fullscreen-requested', 'true')
})

test('旋轉螢幕後控制面板、數據與時間操作仍可使用', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=eclipses&mode=teaching&preset=total-solar')
  await skipIfWebGLUnavailable(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await lab.openControls()
  await expect(page.locator('#detail-metrics')).not.toBeEmpty()
  await lab.selectControlTab('顯示')
  await page.locator('#drawer-speed').selectOption('4')
  await lab.action('向前一步')
  await expect(page.locator('#timeline')).not.toHaveValue('0')
  await lab.closeControls()
  await page.setViewportSize({ width: 844, height: 390 })
  await lab.openControls()
  await page.getByRole('slider', { name: /傾角/ }).fill('7')
  await expect(page.locator('#parameter-inclination')).toHaveValue('7')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('手機版以模型優先，使用固定場景列、精簡資訊與分頁控制抽屜', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機專用版面驗收')
  await page.setViewportSize({ width: 390, height: 844 })
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&mode=teaching&preset=first-quarter')
  await skipIfWebGLUnavailable(page)

  const stage = page.locator('#stage-wrap')
  await expect.poll(async () => (await stage.boundingBox())!.height).toBeGreaterThan(680)
  const sceneNav = page.getByRole('navigation', { name: '教學場景' })
  for (const label of ['太陽', '月相', '日月食']) await expect(sceneNav.getByRole('button', { name: new RegExp(`${label}$`) })).toBeVisible()
  expect(await sceneNav.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  await expect(page.locator('.scene-inset')).toBeVisible()
  const insetToggle = page.locator('.inset-toggle')
  await expect(insetToggle).toBeHidden()
  await expect(page.locator('.scene-inset .observer-events')).toBeVisible()
  expect((await page.locator('.scene-inset').boundingBox())!.height).toBeLessThanOrEqual(125)
  const footerSpeed = page.getByRole('contentinfo', { name: '時間控制' }).getByLabel('播放速度')
  await expect(footerSpeed).toBeVisible()
  await footerSpeed.selectOption('4')
  await expect(footerSpeed).toHaveValue('4')
  await expect(page.locator('#camera-toolbar')).toBeHidden()

  await lab.selectScene('太陽', '太陽視運動與四季')
  const quick = page.locator('#mobile-sun-controls')
  await expect(quick).toBeVisible()
  await expect(page.locator('body')).not.toHaveClass(/panel-open/)
  await expect(page.locator('.stage-heading')).toBeHidden()
  const topbarBox = await page.locator('.topbar').boundingBox()
  const sceneNavBox = await page.getByRole('navigation', { name: '教學場景' }).boundingBox()
  expect(topbarBox!.height + sceneNavBox!.height).toBeLessThanOrEqual(88)
  const viewTabs = page.getByRole('tablist', { name: '太陽同步模型' })
  await expect(viewTabs).toBeVisible()
  await expect(page.getByRole('region', { name: '當地太陽視運動' })).toBeVisible()
  await expect(page.getByRole('region', { name: '地球公轉與四季' })).toBeHidden()
  await viewTabs.getByRole('tab', { name: '公轉模型' }).click()
  await expect(page.getByRole('region', { name: '地球公轉與四季' })).toBeVisible()

  await quick.getByLabel('快速調整季節').fill('270')
  await expect(quick.locator('[data-quick-output="seasonAngle"]')).toHaveText('冬至')
  await quick.getByLabel('快速調整時間').fill('0.75')
  await expect(quick.locator('[data-quick-output="timeline"]')).toHaveText('18:00')
  await quick.getByLabel('快速調整緯度').fill('45')
  await quick.getByLabel('快速調整速度').selectOption('4')
  await quick.getByRole('button', { name: '赤道', exact: true }).click()
  await expect(page.locator('[data-polaris-altitude="0"]')).toHaveCount(1)

  await lab.openControls()
  const panel = page.locator('#control-panel')
  await expect(panel).toHaveAttribute('role', 'dialog')
  await expect(panel).toHaveAttribute('aria-modal', 'true')
  await expect(stage).toHaveAttribute('inert', '')
  await expect(page.locator('.drawer-backdrop')).toBeVisible()
  const controlTabs = panel.getByRole('tablist', { name: '控制分類' })
  await expect(panel.locator('.sun-quick-controls')).toHaveCount(0)
  await controlTabs.getByRole('tab', { name: '顯示' }).click()
  await expect(panel.getByRole('button', { name: '俯視', exact: true })).toBeVisible()
  await controlTabs.getByRole('tab', { name: '資訊' }).click()
  await expect(page.getByText('完整觀測數據', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '關閉控制面板', exact: true }).click()
  await expect(stage).not.toHaveAttribute('inert', '')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('每個場景的所有預設、相機與圖層都可操作', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const lab = new LabPage(page)
  await lab.open()
  await skipIfWebGLUnavailable(page)
  await unlockDeveloper(page)
  for (const [label, heading] of scenes) {
    await lab.closeControls()
    await lab.selectScene(label, heading)
    await lab.openControls()
    const presets = await page.locator('[data-preset]').evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).dataset.preset!))
    for (const id of presets) {
      await page.locator(`[data-preset="${id}"]`).click()
      await expect(page.locator(`[data-preset="${id}"]`)).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => new URL(page.url()).searchParams.get('preset')).toBe(id)
    }
    for (const control of await page.locator('[data-parameter]').all()) {
      const key = await control.getAttribute('data-parameter')
      if (await control.evaluate((element) => element.tagName === 'SELECT')) {
        const options = await control.locator('option').evaluateAll((elements) => elements.map((element) => (element as HTMLOptionElement).value))
        const current = await control.inputValue()
        await control.selectOption(options.find((option) => option !== current) ?? options.at(-1)!)
      } else {
        const minimum = Number(await control.getAttribute('min'))
        const maximum = Number(await control.getAttribute('max'))
        const step = Number(await control.getAttribute('step'))
        const current = Number(await control.inputValue())
        const baseline = Number((minimum + step * 2).toFixed(5))
        const next = Math.abs(current - baseline) > step / 10 ? baseline : Math.min(maximum, current + step)
        await control.fill(String(next))
      }
      await expect.poll(() => new URL(page.url()).searchParams.get('preset')).toBeNull()
      await expect.poll(() => {
        const value = new URL(page.url()).searchParams.get(`p.${key}`)
        return value === null ? NaN : Number(value)
      }).toBeCloseTo(Number(await control.inputValue()), 5)
    }
    await lab.selectControlTab('顯示')
    for (const layer of ['labels', 'paths', 'shadows']) {
      const toggle = page.locator(`[data-layer="${layer}"]`)
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    }
    await lab.closeControls()
    const cameras = await page.locator('[data-camera]').evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).dataset.camera!))
    for (const camera of cameras) {
      await selectPrimaryCamera(page, lab, camera)
      await expect(page.locator(`[data-camera="${camera}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    if (label === '太陽' && await page.getByRole('tablist', { name: '太陽同步模型' }).isVisible()) await expect(page.locator('.sun-view-readout').first()).toBeVisible()
    else await expect(page.locator('#metrics .metric').first()).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('六個場景使用固定日期真實模式並保持觀測數據', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const lab = new LabPage(page)
  await lab.open('?scene=celestial-sphere&mode=real&time=2025-06-21T04%3A00%3A00.000Z&lat=25.033&lon=121.5654')
  await skipIfWebGLUnavailable(page)
  await unlockDeveloper(page)
  for (const [label, heading] of scenes) {
    await lab.selectScene(label, heading)
    await expect(page.getByRole('button', { name: '真實', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#scale-badge')).toContainText('真實')
    await lab.openControls()
    await expect(page.getByLabel('日期與時間')).toHaveValue('2025-06-21T12:00')
    await expect(page.locator('#detail-metrics')).not.toBeEmpty()
    for (const control of await page.locator('select[data-parameter]').all()) {
      const options = await control.locator('option').evaluateAll((elements) => elements.map((element) => (element as HTMLOptionElement).value))
      await control.selectOption(options.at(-1)!)
      const key = await control.getAttribute('data-parameter')
      await expect.poll(() => new URL(page.url()).searchParams.get(`p.${key}`)).toBe(await control.inputValue())
      await expect(page.getByRole('button', { name: '真實', exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    await lab.closeControls()
  }
  expect(errors).toEqual([])
})

test('複製的連結還原自由參數、時間軸、相機與圖層', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (text: string) => { document.documentElement.dataset.copiedLink = text }
    } })
  })
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&mode=teaching&preset=june-solstice')
  await skipIfWebGLUnavailable(page)
  await lab.openControls()
  await page.getByLabel('觀察緯度').fill('35')
  await page.getByLabel('公轉角・春分起算').fill('270')
  await lab.selectControlTab('顯示')
  await page.locator('[data-layer="paths"]').click()
  await lab.closeControls()
  await selectPrimaryCamera(page, lab, 'outside')
  await page.getByRole('slider', { name: '時間軸', exact: true }).fill('0.625')
  const share = page.getByRole('button', { name: '複製分享連結', exact: true })
  if (await share.isVisible()) await share.click()
  else {
    await lab.openControls()
    await lab.selectControlTab('顯示')
    await page.getByRole('button', { name: '複製目前場景連結', exact: true }).click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-copied-link', /^http/)
  const copied = await page.locator('html').getAttribute('data-copied-link')
  await page.goto(copied!)
  await expect(page.locator('#timeline')).toHaveValue('0.625')
  await expect(page.locator('[data-camera="outside"]')).toHaveAttribute('aria-pressed', 'true')
  await lab.openControls()
  await expect(page.getByLabel('觀察緯度')).toHaveValue('35')
  await expect(page.getByLabel('公轉角・春分起算')).toHaveValue('270')
  await expect(page.locator('[data-layer="paths"]')).toHaveAttribute('aria-pressed', 'false')
})

test('重設會還原場景參數並停止播放', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&preset=first-quarter')
  await lab.openControls()
  await page.getByLabel('月球軌道傾角').fill('12')
  await lab.closeControls()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await lab.action('重設場景')
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await lab.openControls()
  await expect(page.getByLabel('月球軌道傾角')).toHaveValue('5.1')
})

test('無效分享參數使用安全預設，不產生空白畫面', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=unknown&mode=wrong&preset=missing&lat=NaN&lon=999&t=NaN&p.latitude=999')
  await expect(page.locator('#stage-title')).toHaveText('太陽視運動與四季')
  await expect(page.getByRole('button', { name: '教學', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await lab.openControls()
  await expect(page.getByLabel('觀察緯度')).toHaveValue('25')
})

test('WebGL context 遺失與恢復有提示且控制可繼續操作', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open()
  await skipIfWebGLUnavailable(page)
  const extension = await page.evaluateHandle(() => document.querySelector<HTMLCanvasElement>('#stage-canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context') ?? null)
  const supportsLoss = await extension.evaluate((value) => value !== null)
  if (supportsLoss) await extension.evaluate((value) => value!.loseContext())
  else await page.locator('#stage-canvas').dispatchEvent('webglcontextlost', { cancelable: true })
  await expect(page.getByRole('alert')).toContainText('已中斷')
  if (supportsLoss) await extension.evaluate((value) => value!.restoreContext())
  else await page.locator('#stage-canvas').dispatchEvent('webglcontextrestored')
  await expect(page.getByRole('alert')).not.toBeVisible()
  await lab.selectScene('月相', '月相與月球運動')
  await expect(page.locator('#metrics .metric').first()).toBeVisible()
  await extension.dispose()
})

test('真實模式可搜尋下一次所在地日食與月食', async ({ page }) => {
  test.setTimeout(60_000)
  const lab = new LabPage(page)
  await lab.open('?scene=eclipses&mode=real&time=2025-01-01T00%3A00%3A00.000Z&lat=25.033&lon=121.5654')
  await lab.openControls()
  const original = await page.getByLabel('日期與時間').inputValue()
  await page.getByRole('button', { name: '所在地日食', exact: true }).click()
  await expect(page.locator('#eclipse-status')).toContainText(/可見|不可見/)
  await expect(page.getByLabel('日期與時間')).not.toHaveValue(original)
  await page.getByRole('button', { name: '月食', exact: true }).click()
  await expect(page.locator('#eclipse-status')).toContainText(/可見|不可見/)
  await expect(page.locator('#eclipse-status')).not.toContainText('無法計算')
})

test('縮減動態設定保留鍵盤操作與原生控制語意', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const lab = new LabPage(page)
  await lab.open()
  const mode = page.getByRole('button', { name: '真實', exact: true })
  await mode.press('Space')
  await expect(mode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await lab.openControls()
  await page.getByLabel('緯度').focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByLabel('緯度')).toBeFocused()
  await lab.closeControls()
  const about = page.getByRole('button', { name: '資料與使用說明' })
  if (!(await about.isVisible())) {
    await lab.openControls()
    await lab.selectControlTab('資訊')
  }
  await page.locator('button[data-action="about"]:visible').click()
  await expect(page.locator('#about-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#about-dialog')).not.toBeVisible()
})

test('快速拖動參數不超過瀏覽器網址更新限制', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&mode=teaching')
  await lab.openControls()
  await page.getByLabel('觀察緯度').evaluate((element) => {
    const slider = element as HTMLInputElement
    for (let index = 0; index < 240; index += 1) {
      slider.value = String(index % 80)
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await expect(page.getByLabel('觀察緯度')).toHaveValue('79')
  await expect.poll(() => new URL(page.url()).searchParams.get('p.latitude')).toBe('79')
  expect(errors).toEqual([])
})
