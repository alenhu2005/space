import { expect, test, type Page } from '@playwright/test'
import { LabPage } from './pages/LabPage'

async function skipIfWebGLUnavailable(page: Page): Promise<void> {
  const fallback = page.locator('#canvas-message.visible')
  if (await fallback.isVisible().catch(() => false)) {
    await expect(fallback).toContainText('無法啟用 WebGL 2')
    test.skip(true, 'runner 沒有 WebGL 2；沿用既有 fallback 規則')
  }
}

test('Observer 可環視、縮放、看向太陽並在分享網址還原，切換不重設宇宙', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=sun-path&mode=real&time=2026-09-20T04%3A00%3A00Z&lat=24.7733&lon=120.9642&t=0.5&view=observer&az=358&alt=20&fov=65')
  await skipIfWebGLUnavailable(page)
  await expect(page.locator('#observer-panel')).toBeVisible()
  await expect(page.locator('#observer-azimuth')).toHaveText('358°')
  expect((await page.locator('#observer-panel').boundingBox())!.height).toBeLessThan(40)
  await expect(page.locator('#observer-place')).toHaveCSS('width', '1px')
  await expect(page.locator('#observer-angles')).toContainText('Az 358.0°')
  const before = new URL(page.url())
  const canvas = page.locator('#stage-canvas')
  const box = (await canvas.boundingBox())!
  const x = box.x + box.width * .52
  const y = box.y + box.height * .55
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 65, y - 45, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => Number(new URL(page.url()).searchParams.get('az'))).toBeLessThan(60)
  expect(Number(new URL(page.url()).searchParams.get('az'))).toBeGreaterThan(0)

  await page.mouse.move(x, y)
  await page.mouse.wheel(0, -420)
  await expect.poll(async () => Number(new URL(page.url()).searchParams.get('fov'))).toBeLessThan(65)
  await page.locator('[data-look="Sun"]').click()
  await expect.poll(async () => Number(new URL(page.url()).searchParams.get('alt')), { timeout: 5_000 }).toBeGreaterThan(20)
  await expect(page.locator('#stage-wrap')).toHaveAttribute('data-observer-turning', 'false')
  await expect.poll(async () => {
    const visible = /Az ([\d.]+)°/.exec(await page.locator('#observer-angles').textContent() ?? '')?.[1]
    return visible === Number(new URL(page.url()).searchParams.get('az')).toFixed(1)
  }).toBe(true)

  const observed = new URL(page.url())
  await page.reload()
  await skipIfWebGLUnavailable(page)
  await expect(page.locator('#observer-panel')).toBeVisible()
  await expect(page.locator('#observer-angles')).toContainText(`Az ${Number(observed.searchParams.get('az')).toFixed(1)}°`)
  await page.locator('[data-view="space"]').click()
  await expect(page.locator('#observer-panel')).toBeHidden()
  const after = new URL(page.url())
  for (const key of ['scene', 'mode', 'lat', 'lon']) expect(after.searchParams.get(key)).toBe(before.searchParams.get(key))
  expect(Number(after.searchParams.get('t'))).toBe(Number(before.searchParams.get('t')))
  expect(Date.parse(after.searchParams.get('time')!)).toBe(Date.parse(before.searchParams.get('time')!))
})

test('pitch 受限且只有適用場景提供地面觀測', async ({ page }) => {
  const lab = new LabPage(page)
  await lab.open('?scene=moon-phases&view=observer&az=10&alt=89&fov=60')
  await skipIfWebGLUnavailable(page)
  const canvas = page.locator('#stage-canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .6)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .2, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('#observer-cardinal')).toHaveText('天頂')
  await expect(page.locator('#observer-angles')).toContainText('Az —')
  await expect.poll(async () => Number(new URL(page.url()).searchParams.get('alt'))).toBe(90)
  await page.locator('#developer-tools summary').click()
  await page.getByLabel('解鎖密碼').fill('0000')
  await page.getByRole('button', { name: '解鎖開發者功能' }).click()
  await lab.open('?scene=tides&view=observer')
  await expect(page.locator('#view-switch')).toBeHidden()
  await expect(page.locator('#observer-panel')).toBeHidden()
})

test('方向鍵轉動地面視角，刻度帶跟隨方位且不攔截滑桿', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  const lab = new LabPage(page)
  await lab.open('?scene=eclipses&mode=teaching&view=observer&az=358&alt=20&fov=65&preset=annular-solar&t=0')
  await skipIfWebGLUnavailable(page)
  const canvas = page.locator('#stage-canvas')
  await canvas.focus()
  const track = page.locator('#observer-compass-track')
  const before = await track.getAttribute('style')
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(240)
  await page.keyboard.up('ArrowRight')
  await expect.poll(() => {
    const current = Number(new URL(page.url()).searchParams.get('az'))
    return ((current - 358 + 540) % 360) - 180
  }).toBeGreaterThan(5)
  expect(await track.getAttribute('style')).not.toBe(before)
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(180)
  await page.keyboard.up('ArrowUp')
  await expect.poll(() => Number(new URL(page.url()).searchParams.get('alt'))).toBeGreaterThan(20)
  const azimuthAfterUp = Number(new URL(page.url()).searchParams.get('az'))
  await page.keyboard.down('Shift')
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(200)
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.up('Shift')
  await expect.poll(() => {
    const current = Number(new URL(page.url()).searchParams.get('az'))
    return ((current - azimuthAfterUp + 540) % 360) - 180
  }).toBeLessThan(-5)
  await page.locator('#timeline').focus()
  await page.keyboard.press('ArrowRight')
  const afterSlider = Number(new URL(page.url()).searchParams.get('az'))
  expect(((afterSlider - azimuthAfterUp + 540) % 360) - 180).toBeLessThan(-5)
  await expect(page.locator('.observer-bearing')).toHaveCSS('border-top-width', '0px')
})

test('手機單指拖曳與雙指縮放可控制觀測方向', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) > 560, '手機限定')
  const lab = new LabPage(page)
  await lab.open('?scene=eclipses&view=observer&az=350&alt=15&fov=65')
  await skipIfWebGLUnavailable(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 420, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 230, y: 390, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y: 420, id: 1 }, { x: 180, y: 420, id: 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 130, y: 420, id: 1 }, { x: 230, y: 420, id: 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => Number(new URL(page.url()).searchParams.get('az'))).toBeLessThan(80)
  await expect.poll(async () => Number(new URL(page.url()).searchParams.get('fov'))).toBeLessThan(65)
})
