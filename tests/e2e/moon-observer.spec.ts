import { expect, test, type Page } from '@playwright/test'
import { LabPage } from './pages/LabPage'

async function skipIfWebGLUnavailable(page: Page): Promise<void> {
  const fallback = page.locator('#canvas-message.visible')
  if (await fallback.isVisible().catch(() => false)) {
    await expect(fallback).toContainText('無法啟用 WebGL 2')
    test.skip(true, '此瀏覽器 runner 沒有可用的 WebGL 2；fallback 已由專用案例驗證')
  }
}

test('月面視窗將觀測者固定於地表並隨地球自轉更新時間', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&preset=new-moon&t=0&p.observerLatitude=25&p.observerLongitude=121.5&p.observerSolarHour=12')
  await skipIfWebGLUnavailable(page)
  await expect(page.locator('.observer-location')).toHaveText('觀測者 25.00°N・121.50°E')
  await expect(page.locator('.observer-time')).toHaveText('教學太陽時 12:00')
  await expect(page.locator('.observer-event-rise')).toContainText('06:00')
  await expect(page.locator('.observer-event-transit')).toContainText('12:00')
  await expect(page.locator('.observer-event-set')).toContainText('18:00')

  await page.getByRole('slider', { name: '時間軸', exact: true }).fill('0.25')
  await expect(page.locator('.observer-location')).toHaveText('觀測者 25.00°N・121.50°E')
  await expect(page.locator('.observer-time')).toHaveText('教學太陽時 21:11')
  await expect(page.locator('.observer-event-rise')).toContainText('12:00')
  await expect(page.locator('.observer-event-transit')).toContainText('18:00')
  await expect(page.locator('.observer-event-set')).toContainText('00:00')
  await expect(page.locator('.observer-zone-note')).toContainText('標記隨地球自轉')

  await lab.openControls()
  await page.getByLabel('觀測者緯度').fill('-30')
  await page.getByLabel('觀測者經度').fill('-70')
  await expect(page.locator('.observer-location')).toHaveText('觀測者 30.00°S・70.00°W')
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
  await expect(page.locator('.observer-event-transit')).toContainText('/')

  await lab.openControls()
  await page.getByLabel('觀測者民用時區').selectOption('1')
  await expect(page.locator('.observer-time')).toContainText('00:15（UTC）')
})

test('月相切換教學與真實模式時保留月相，真實播放會推進所在地時間', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&mode=teaching&preset=first-quarter&t=0.25&time=2026-09-16T23%3A48%3A00Z')
  await skipIfWebGLUnavailable(page)
  await expect(page.locator('#metrics')).toContainText('月相角・黃經差90.0°')

  await page.getByRole('button', { name: '真實', exact: true }).click()
  await expect(page.locator('#metrics')).toContainText('月相角・黃經差90.0°')
  const before = await page.locator('.observer-time').textContent()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect.poll(async () => page.locator('.observer-time').textContent(), { timeout: 5_000 }).not.toBe(before)
  await page.getByRole('button', { name: '暫停', exact: true }).click()

  const realPhase = await page.locator('#metrics .metric').filter({ hasText: '月相角・黃經差' }).locator('.metric-value').textContent()
  await page.getByRole('button', { name: '教學', exact: true }).click()
  const teachingPhase = await page.locator('#metrics .metric').filter({ hasText: '月相角・黃經差' }).locator('.metric-value').textContent()
  expect(Math.abs(Number.parseFloat(teachingPhase!) - Number.parseFloat(realPhase!))).toBeLessThan(.3)
})
