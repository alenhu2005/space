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

test('太陽可切換原始舊版教材並返回保留參數的新版', async ({ page }) => {
  test.setTimeout(60_000)
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&preset=june-solstice&t=0.5')
  await skipIfWebGLUnavailable(page)
  await lab.openControls()
  await page.getByLabel('觀察緯度').fill('35')
  await lab.closeControls()
  await page.getByRole('link', { name: '切換舊版太陽教材', exact: true }).click()
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
  await expect(page.locator('#scene-list')).toBeHidden()
  await page.getByRole('button', { name: '展開實驗場景', exact: true }).click()
  await expect(page.locator('#scene-list')).toBeVisible()
  await lab.selectScene('日月食', '日食與月食')
  await page.setViewportSize({ width: 844, height: 390 })
  await page.getByRole('button', { name: '收合實驗場景', exact: true }).click()
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
  await expect(page.getByRole('heading', { name: '太陽視運動與四季' })).toBeVisible()
  await expect(page.getByRole('button', { name: '真實' })).toHaveAttribute('aria-pressed', 'true')
  await lab.openControls()
  await expect(page.getByLabel('緯度')).toHaveValue('23.5')
  await expect(page.getByLabel('經度')).toHaveValue('121')
})

test('太陽雙視窗共用時間與季節，旋轉與螢幕方向可獨立操作', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&preset=june-solstice&t=0.5')
  await skipIfWebGLUnavailable(page)
  const local = page.getByRole('region', { name: '當地太陽視運動' })
  const space = page.getByRole('region', { name: '地球公轉與四季' })
  await expect(local).toBeVisible()
  await expect(space).toBeVisible()
  await expect(space.getByText('觀測者自轉軌跡', { exact: true })).toBeVisible()
  await expect(space).toHaveAttribute('data-observer-trail-latitude', '25.033')
  await expect(space).toHaveAttribute('data-observer-trail-style', 'solid')
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
  const a = await local.boundingBox()
  const b = await space.boundingBox()
  expect(a).not.toBeNull()
  expect(b).not.toBeNull()
  expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height)
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(local).toBeVisible()
  await expect(space).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
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
  await page.locator('[data-camera="surface"]').click()
  await expect(page.getByText('地球夜側・所見月面', { exact: true })).toBeVisible()
  await expect(page.locator('.phenomenon-caption')).toHaveText('月食：全食')
  await page.getByRole('button', { name: '月面特寫', exact: true }).click()
  await expect(page.locator('[data-camera="lunar-disc"]')).toHaveAttribute('aria-pressed', 'true')
  await lab.openControls()
  await page.getByRole('button', { name: '月偏食 月球部分進入本影', exact: true }).click()
  await lab.closeControls()
  await page.locator('[data-camera="surface"]').click()
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
        await control.selectOption(options.at(-1)!)
      } else {
        const minimum = Number(await control.getAttribute('min'))
        const step = Number(await control.getAttribute('step'))
        await control.fill(String(Number((minimum + step * 2).toFixed(5))))
      }
      await expect.poll(() => new URL(page.url()).searchParams.get('preset')).toBeNull()
      await expect.poll(() => {
        const value = new URL(page.url()).searchParams.get(`p.${key}`)
        return value === null ? NaN : Number(value)
      }).toBeCloseTo(Number(await control.inputValue()), 5)
    }
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
      await page.locator(`[data-camera="${camera}"]`).click()
      await expect(page.locator(`[data-camera="${camera}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(page.locator('#metrics .metric').first()).toBeVisible()
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
  await page.locator('[data-layer="paths"]').click()
  await lab.closeControls()
  await page.locator('[data-camera="outside"]').click()
  await page.getByRole('slider', { name: '時間軸', exact: true }).fill('0.625')
  const share = page.getByRole('button', { name: '複製分享連結', exact: true })
  if (await share.isVisible()) await share.click()
  else {
    await lab.openControls()
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
  await expect(page.getByRole('heading', { name: '太陽視運動與四季' })).toBeVisible()
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
  await mode.focus()
  await page.keyboard.press('Space')
  await expect(mode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await lab.openControls()
  await page.getByLabel('緯度').focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByLabel('緯度')).toBeFocused()
  await page.getByRole('button', { name: '資料與使用說明' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
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
