import { expect, test, type Page } from '@playwright/test'
import { LabPage } from './pages/LabPage'

async function skipIfWebGLUnavailable(page: Page): Promise<void> {
  const fallback = page.locator('#canvas-message.visible')
  if (await fallback.isVisible().catch(() => false)) {
    await expect(fallback).toContainText('無法啟用 WebGL 2')
    test.skip(true, '此瀏覽器 runner 沒有可用的 WebGL 2；fallback 已由專用案例驗證')
  }
}

test('月面視窗顯示教學觀測位置，時間隨朔望月時間軸同步', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&preset=new-moon&t=0&p.observerLatitude=25&p.observerSolarHour=12')
  await skipIfWebGLUnavailable(page)
  await expect(page.locator('.observer-location')).toHaveText('觀測者 25.0°N・日下點經線')
  await expect(page.locator('.observer-time')).toHaveText('教學太陽時 12:00')
  await expect(page.locator('.observer-zone-note')).toContainText('29.53059 日')

  await page.getByRole('slider', { name: '時間軸', exact: true }).fill('0.5')
  await expect(page.locator('.observer-time')).toHaveText('教學太陽時 06:22')

  await lab.openControls()
  await page.getByLabel('觀測者緯度').fill('-30')
  await expect(page.locator('.observer-location')).toContainText('30.0°S')
  await lab.closeControls()

  await page.locator('[data-camera="moon"]').click()
  await expect(page.locator('[data-camera="moon"]')).toHaveAttribute('aria-pressed', 'true')
})

test('月面視窗使用明示民用時區，UTC 與台北相差八小時', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&mode=real&time=2025-01-01T00%3A15%3A00Z&lat=25.033&lon=121.5654')
  await skipIfWebGLUnavailable(page)
  await expect(page.locator('.observer-location')).toHaveText('觀測者 25.03°N・121.57°E')
  await expect(page.locator('.observer-time')).toContainText('08:15（Asia/Taipei）')
  await expect(page.locator('.observer-zone-note')).toHaveText('時區需自行選擇；不依經度推測民用時區。')

  await lab.openControls()
  await page.getByLabel('觀測者民用時區').selectOption('1')
  await expect(page.locator('.observer-time')).toContainText('00:15（UTC）')
})
