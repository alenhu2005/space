import { expect, test } from '@playwright/test'
import { LabPage } from './pages/LabPage'

const scenarios = [
  ['celestial-sphere', 'taipei', 'outside', 0.25],
  ['sun-path', 'june-solstice', 'horizon', 0.5],
  ['sun-path', 'june-solstice', 'horizon', 0.5, 'earth'],
  ['moon-phases', 'first-quarter', 'angled', 0.25],
  ['moon-phases', 'first-quarter', 'moon', 0.25],
  ['eclipses', 'total-solar', 'side', 0],
  ['eclipses', 'total-lunar', 'surface', 0.5],
  ['eclipses', 'total-lunar', 'lunar-disc', 0.5],
  ['tides', 'spring-new', 'top', 0],
  ['kepler', 'second-law', 'angled', 15 / 360]
] as const

const developerScenes = new Set(['celestial-sphere', 'tides', 'kepler'])

for (const [scene, preset, camera, timeline, comparisonCamera] of scenarios) {
  const snapshotName = comparisonCamera ? `${scene}-earth-focus` : camera === 'surface' ? `${scene}-lunar-surface` : camera === 'moon' || camera === 'lunar-disc' ? `${scene}-moon-focus` : scene
  test(`${snapshotName} 固定日期、時間軸、相機的模型與面板`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    })
    if (developerScenes.has(scene)) await page.addInitScript(() => sessionStorage.setItem('hu-gege-celestial-lab:developer-unlocked', 'true'))
    const lab = new LabPage(page)
    await lab.open(`?scene=${scene}&mode=teaching&preset=${preset}&time=2025-06-21T04%3A00%3A00.000Z&t=${timeline}`)
    const cameraButton = page.locator(`#camera-toolbar [data-camera="${camera}"]`)
    if (await cameraButton.isVisible()) await cameraButton.click()
    else {
      await lab.openControls()
      await lab.selectControlTab('顯示')
      await page.locator(`[data-mobile-camera="${camera}"]`).click()
      await lab.closeControls()
    }
    const sunViewTabs = page.getByRole('tablist', { name: '太陽同步模型' })
    if (comparisonCamera && await sunViewTabs.isVisible()) await sunViewTabs.getByRole('tab', { name: '公轉模型' }).click()
    if (comparisonCamera) await page.locator(`[data-sun-camera="${comparisonCamera}"]`).click()
    if (comparisonCamera || camera === 'moon' || camera === 'lunar-disc') {
      const surface = comparisonCamera ? page.locator('[data-viewport="comparison"]') : page.locator('#stage-canvas')
      const viewport = await surface.boundingBox()
      await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + viewport!.height / 2)
      await page.mouse.wheel(0, -120)
      if (comparisonCamera) {
        await lab.openControls()
        await lab.selectControlTab('模型')
        await page.getByLabel('公轉角・春分起算').fill('180')
        await lab.closeControls()
      } else await page.locator('#stage-canvas').press('ArrowRight')
    }
    if (scene === 'sun-path' && await sunViewTabs.isVisible()) await expect(page.locator('.sun-view:visible .sun-view-readout').first()).toBeVisible()
    else await expect(page.locator('#metrics .metric').first()).toBeVisible()
    if (scene === 'moon-phases') {
      const infoToggle = page.locator('.inset-toggle')
      if (await infoToggle.isVisible()) await expect(page.locator('.scene-inset')).toBeHidden()
      else {
        await expect(page.locator('.scene-inset')).toBeVisible()
        await expect(page.locator('.scene-inset strong')).toBeVisible()
        await expect(page.locator('.scene-inset .observer-events')).toBeVisible()
        const inset = await page.locator('.scene-inset').boundingBox()
        const viewport = page.viewportSize()!
        expect(inset).not.toBeNull()
        expect(inset!.x).toBeGreaterThanOrEqual(0)
        expect(inset!.x + inset!.width).toBeLessThanOrEqual(viewport.width)
        expect(inset!.y + inset!.height).toBeLessThan(viewport.height)
      }
    }
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('#stage-wrap')).toHaveAttribute('data-camera-transitioning', 'false')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await expect(page).toHaveScreenshot(`${snapshotName}-model.png`, { animations: 'disabled', maxDiffPixelRatio: .025 })
    await lab.openControls()
    const controlPanel = page.locator('#control-panel')
    await expect(controlPanel).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, 0\)|none/)
    await controlPanel.evaluate((panel) => { panel.scrollTop = 0 })
    await lab.selectControlTab('資訊')
    await expect(page.locator('#detail-metrics')).not.toBeEmpty()
    await expect(page.getByText('教學提示與課綱對應', { exact: true })).toBeVisible()
    await expect(page).toHaveScreenshot(`${snapshotName}-controls.png`, { animations: 'disabled', maxDiffPixelRatio: .025 })
  })
}

test('observer 固定日期、地點與朝向的地面天空', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&mode=real&time=2026-09-20T04%3A00%3A00Z&lat=24.7733&lon=120.9642&t=0.5&view=observer&az=180&alt=60&fov=65')
  await expect(page.locator('#observer-panel')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('observer-sky.png', { animations: 'disabled', maxDiffPixelRatio: .005 })
})

const observerLightCases = [
  ['sun-path', 'day', 't=0.5&p.latitude=24.7733&p.seasonAngle=180'],
  ['sun-path', 'dusk', 't=0.75&p.latitude=24.7733&p.seasonAngle=180'],
  ['sun-path', 'night', 't=0.9&p.latitude=24.7733&p.seasonAngle=180'],
  ['moon-phases', 'day', 't=0&p.observerSolarHour=12'],
  ['moon-phases', 'dusk', 't=0&p.observerSolarHour=18'],
  ['moon-phases', 'night', 't=0&p.observerSolarHour=22'],
  ['eclipses', 'day', 't=0&p.observerSolarHour=12'],
  ['eclipses', 'dusk', 't=0&p.observerSolarHour=18'],
  ['eclipses', 'night', 't=0&p.observerSolarHour=22']
] as const

for (const [scene, light, parameters] of observerLightCases) {
  test(`observer ${scene} ${light} 地面日夜與地景`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'visual-mobile')
    const lab = new LabPage(page)
    await lab.open(`?scene=${scene}&mode=teaching&view=observer&az=180&alt=5&fov=65&time=2026-09-20T04%3A00%3A00Z&${parameters}`)
    await expect(page.locator('#observer-panel')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`observer-${scene}-${light}.png`, { animations: 'disabled', maxDiffPixelRatio: .005 })
  })
}

test('observer 月相上弦月放大與月球周日軌跡', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'visual-mobile')
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&mode=teaching&view=observer&az=180&alt=65&fov=65&t=0.25&p.observerSolarHour=8.81646')
  await expect(page.locator('#observer-time-label')).toContainText('教學太陽時 18:00')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('observer-moon-size.png', { animations: 'disabled', maxDiffPixelRatio: .005 })
})

for (const [name, azimuth, altitude, timeline, latitude] of [
  ['polaris', 0, 25, 0, 25],
  ['southern-cross', 180, 40, .83333, -25],
  ['seasonal-sun-paths', 180, 65, .5, 25]
] as const) {
  test(`observer 太陽場景 ${name} 方位與節氣參照`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'visual-mobile')
    const lab = new LabPage(page)
    await lab.open(`?scene=sun-path&mode=teaching&view=observer&az=${azimuth}&alt=${altitude}&fov=65&t=${timeline}&p.latitude=${latitude}&p.seasonAngle=90`)
    await expect(page.locator('#observer-panel')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`observer-sun-${name}.png`, { animations: 'disabled', maxDiffPixelRatio: .005 })
  })
}

for (const [name, mode, preset, time, latitude, longitude, timeline, kind, visible] of [
  ['teaching-total-solar', 'teaching', 'total-solar', '2026-09-20T04%3A00%3A00Z', 25.033, 121.5654, 0, 'total', 'true'],
  ['teaching-partial-solar', 'teaching', 'partial-solar', '2026-09-20T04%3A00%3A00Z', 25.033, 121.5654, 0, 'partial', 'true'],
  ['teaching-annular-solar', 'teaching', 'annular-solar', '2026-09-20T04%3A00%3A00Z', 25.033, 121.5654, 0, 'annular', 'true'],
  ['teaching-total-lunar', 'teaching', 'total-lunar', '2026-09-20T04%3A00%3A00Z', 25.033, 121.5654, .5, 'total', 'true'],
  ['teaching-partial-lunar', 'teaching', 'partial-lunar', '2026-09-20T04%3A00%3A00Z', 25.033, 121.5654, .5, 'partial', 'true'],
  ['real-local-total-solar', 'real', 'total-solar', '2024-04-08T18%3A42%3A37Z', 32.7767, -96.797, 0, 'total', 'true'],
  ['real-local-annular-solar', 'real', 'annular-solar', '2023-10-14T16%3A36%3A53Z', 35.0844, -106.6504, 0, 'annular', 'true'],
  ['real-other-side-solar', 'real', 'total-solar', '2024-04-08T18%3A42%3A37Z', 25.033, 121.5654, 0, 'none', 'false']
] as const) {
  test(`observer ${name} 食象與所在地`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'visual-mobile')
    const lab = new LabPage(page)
    await lab.open(`?scene=eclipses&mode=${mode}&view=observer&az=180&alt=65&fov=45&preset=${preset}&time=${time}&lat=${latitude}&lon=${longitude}&t=${timeline}`)
    await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-kind', kind)
    await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-visible', visible)
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`observer-${name}.png`, { animations: 'disabled', maxDiffPixelRatio: .005 })
  })
}
