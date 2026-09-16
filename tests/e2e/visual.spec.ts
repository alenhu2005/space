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
    await page.locator(`[data-camera="${camera}"]`).click()
    if (comparisonCamera) await page.locator(`[data-sun-camera="${comparisonCamera}"]`).click()
    if (comparisonCamera || camera === 'moon' || camera === 'lunar-disc') {
      const surface = comparisonCamera ? page.locator('[data-viewport="comparison"]') : page.locator('#stage-canvas')
      const viewport = await surface.boundingBox()
      await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + viewport!.height / 2)
      await page.mouse.wheel(0, -120)
      if (comparisonCamera) {
        await lab.openControls()
        await page.getByLabel('公轉角・春分起算').fill('180')
        await lab.closeControls()
      } else await page.locator('#stage-canvas').press('ArrowRight')
    }
    await expect(page.locator('#metrics .metric').first()).toBeVisible()
    if (scene === 'moon-phases') {
      await expect(page.getByText('地面所見月面', { exact: true })).toBeVisible()
      const inset = await page.locator('.scene-inset').boundingBox()
      const viewport = page.viewportSize()!
      expect(inset).not.toBeNull()
      expect(inset!.x).toBeGreaterThanOrEqual(0)
      expect(inset!.x + inset!.width).toBeLessThanOrEqual(viewport.width)
      expect(inset!.y + inset!.height).toBeLessThan(viewport.height)
    }
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await expect(page).toHaveScreenshot(`${snapshotName}-model.png`, { animations: 'disabled', maxDiffPixelRatio: .025 })
    await lab.openControls()
    await expect(page.locator('#detail-metrics')).not.toBeEmpty()
    await expect(page.getByText('教學提示與課綱對應', { exact: true })).toBeVisible()
    await expect(page).toHaveScreenshot(`${snapshotName}-controls.png`, { animations: 'disabled', maxDiffPixelRatio: .025 })
  })
}
