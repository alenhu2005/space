import { expect, test, type Page } from '@playwright/test'
import { LabPage } from './pages/LabPage'

async function openEclipse(page: Page, query: string): Promise<void> {
  await new LabPage(page).open(`?scene=eclipses&view=observer&${query}`)
  const fallback = page.locator('#canvas-message.visible')
  if (await fallback.isVisible().catch(() => false)) {
    await expect(fallback).toContainText('無法啟用 WebGL 2')
    test.skip(true, 'runner 沒有 WebGL 2')
  }
  await expect(page.locator('#observer-eclipse-preview')).toBeVisible()
}

for (const [preset, timeline, kind] of [
  ['total-solar', .5, 'total'],
  ['partial-solar', .5, 'partial'],
  ['annular-solar', .5, 'annular'],
  ['total-lunar', .5, 'total'],
  ['partial-lunar', .5, 'partial']
] as const) {
  test(`地面教學 ${preset} 呈現正確食象`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop' && testInfo.project.name !== 'mobile')
    await openEclipse(page, `mode=teaching&preset=${preset}&t=${timeline}`)
    const preview = page.locator('#observer-eclipse-preview')
    await expect(preview).toHaveAttribute('data-kind', kind)
    await expect(preview).toHaveAttribute('data-visible', 'true')
    expect(Number(await preview.getAttribute('data-coverage'))).toBeGreaterThan(0)
  })
}

test('五個教學預設從食前開始，時間軸能拖到食甚', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  for (const [preset, kind] of [
    ['total-solar', 'total'], ['partial-solar', 'partial'], ['annular-solar', 'annular'],
    ['total-lunar', 'total'], ['partial-lunar', 'partial']
  ] as const) {
    await openEclipse(page, `mode=teaching&preset=${preset}`)
    await expect(page.locator('#timeline')).toHaveValue('0.1')
    await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-visible', 'false')
    await page.locator('#timeline').fill('0.5')
    await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-kind', kind)
    await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-visible', 'true')
  }
})

test('日環食的放大圖保留發光環，日全食中心與邊緣皆被遮住', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  const ringColor = async () => page.locator('#observer-eclipse-canvas').evaluate((node) => {
    const context = (node as HTMLCanvasElement).getContext('2d')!
    return [...context.getImageData(80, 126, 1, 1).data].slice(0, 3)
  })
  await openEclipse(page, 'mode=teaching&preset=annular-solar&t=0.5')
  const ring = await ringColor()
  await openEclipse(page, 'mode=teaching&preset=total-solar&t=0.5')
  const covered = await ringColor()
  expect(ring[0]).toBeGreaterThan(covered[0]! + 100)
})

test('真實日食只在觀測地可見，且能區分全食與環食', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  const preview = page.locator('#observer-eclipse-preview')
  await openEclipse(page, 'mode=real&time=2024-04-08T18%3A42%3A37Z&lat=32.7767&lon=-96.797')
  await expect(preview).toHaveAttribute('data-kind', 'total')
  await expect(preview).toHaveAttribute('data-visible', 'true')
  await openEclipse(page, 'mode=real&time=2023-10-14T16%3A36%3A53Z&lat=35.0844&lon=-106.6504')
  await expect(preview).toHaveAttribute('data-kind', 'annular')
  await expect(preview).toHaveAttribute('data-visible', 'true')
  await openEclipse(page, 'mode=real&time=2024-04-08T18%3A42%3A37Z&lat=25.033&lon=121.5654')
  await expect(preview).toHaveAttribute('data-visible', 'false')
  await expect(page.locator('#observer-eclipse-status')).toContainText('地平線下')
})

test('真實太空摘要和地面食象會隨選定經緯度一起更新', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await openEclipse(page, 'mode=real&time=2024-04-08T18%3A42%3A37Z&lat=32.7767&lon=-96.797')
  await page.locator('[data-view="space"]').click()
  await expect(page.locator('#metrics')).toContainText('此地全食')
  await expect(page.locator('#scene-inset-overlay')).toHaveAttribute('data-observer-texture-alignment', 'true')
  await page.locator('#latitude-input').fill('25.033')
  await page.locator('#latitude-input').press('Tab')
  await expect(page).toHaveURL(/lat=25\.0330/)
  await page.locator('#longitude-input').fill('121.5654')
  await page.locator('#longitude-input').press('Tab')
  await expect(page).toHaveURL(/lon=121\.5654/)
  await expect(page.locator('#metrics')).toContainText('此地太陽在地平線下')
  await expect(page.locator('#scene-inset-overlay')).toHaveAttribute('data-observer-texture-alignment', 'true')
  await page.locator('[data-view="observer"]').click()
  await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-visible', 'false')
})

test('真實日食的影錐可見，假設傾角使太空與地面食象同步消失並可重設', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await openEclipse(page, 'mode=real&time=2024-04-08T18%3A42%3A37Z&lat=32.7767&lon=-96.797')
  const preview = page.locator('#observer-eclipse-preview')
  await expect(preview).toHaveAttribute('data-kind', 'total')
  await page.locator('[data-view="space"]').click()
  await expect(page.locator('#scene-inset-overlay')).toHaveAttribute('data-shadow-visible', 'true')
  await expect(page.locator('#metrics')).toContainText('此地全食')
  await page.locator('#parameter-hypotheticalInclination').fill('15')
  await expect(page.locator('#hypothesis-badge')).toBeVisible()
  await expect(page.locator('#metrics')).toContainText('此地無食象')
  await page.locator('[data-view="observer"]').click()
  await expect(preview).toHaveAttribute('data-kind', 'none')
  await page.locator('[data-action="reset-real-inclination"]').click()
  await expect(page.locator('#hypothesis-badge')).toBeHidden()
  await expect(preview).toHaveAttribute('data-kind', 'total')
})

test('手機真實日食能在控制抽屜調整假設傾角', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile')
  await openEclipse(page, 'mode=real&time=2024-04-08T18%3A42%3A37Z&lat=32.7767&lon=-96.797')
  const lab = new LabPage(page)
  await lab.openControls()
  await lab.selectControlTab('模型')
  await page.locator('#parameter-hypotheticalInclination').fill('15')
  await expect(page.locator('#hypothesis-badge')).toBeVisible()
  await lab.closeControls()
  await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-kind', 'none')
})

test('真實月食的食象和所在地月亮升落一致', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await openEclipse(page, 'mode=real&time=2022-11-08T10%3A59%3A07Z&lat=25.033&lon=121.5654')
  const preview = page.locator('#observer-eclipse-preview')
  await expect(preview).toHaveAttribute('data-kind', 'total')
  await expect(preview).toHaveAttribute('data-visible', 'true')
  await expect(page.locator('#observer-eclipse-status')).toContainText('所在地月全食')
})

test('真實日食與月食在各瀏覽器維持所在地食象', async ({ page }) => {
  await openEclipse(page, 'mode=real&time=2024-04-08T18%3A42%3A37Z&lat=32.7767&lon=-96.797')
  await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-kind', 'total')
  await openEclipse(page, 'mode=real&time=2022-11-08T10%3A59%3A07Z&lat=25.033&lon=121.5654')
  await expect(page.locator('#observer-eclipse-preview')).toHaveAttribute('data-kind', 'total')
})

test('教學月食在月球仍位於本影時，地面與太空視角一致', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await openEclipse(page, 'mode=teaching&preset=total-lunar&t=0.505')
  const preview = page.locator('#observer-eclipse-preview')
  await expect(preview).toHaveAttribute('data-kind', 'total')
  await expect(preview).toHaveAttribute('data-visible', 'true')
  await expect(page.locator('#observer-time-label')).not.toContainText('00:00')
  await page.locator('[data-view="space"]').click()
  await expect(page.locator('#metrics')).toContainText('全食')
})

test('教學日食播放時間會帶動地球自轉與觀測時刻', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await openEclipse(page, 'mode=teaching&preset=total-solar&t=0.5')
  const clock = page.locator('#observer-time-label')
  await expect(clock).toContainText('12:00')
  await page.locator('#timeline').fill('0.505')
  await expect(clock).not.toContainText('12:00')
  await expect(page.locator('[data-output="observerSolarHour"]')).not.toHaveText('12:00')
})

test('教學日食月球沿天空移動，觀測時刻可獨立調整', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await openEclipse(page, 'mode=teaching&preset=annular-solar&t=0.5&az=180&alt=65')
  await page.locator('[data-look="Moon"]').click()
  await expect(page.locator('#stage-wrap')).toHaveAttribute('data-observer-turning', 'false')
  const initialAzimuth = Number(new URL(page.url()).searchParams.get('az'))
  await page.locator('#timeline').fill('0.53')
  await page.locator('[data-look="Moon"]').click()
  await expect(page.locator('#stage-wrap')).toHaveAttribute('data-observer-turning', 'false')
  const advancedAzimuth = Number(new URL(page.url()).searchParams.get('az'))
  expect(Math.abs(advancedAzimuth - initialAzimuth)).toBeGreaterThan(1)

  await page.locator('#parameter-observerSolarHour').fill('0')
  await expect(page.locator('[data-output="observerSolarHour"]')).toHaveText('00:00')
  await expect(page.locator('#observer-eclipse-status')).toContainText('地平線下')
})

test('教學太空與地面共用觀測緯度，離開中心線改變食象', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await openEclipse(page, 'mode=teaching&preset=annular-solar&t=0.5')
  const preview = page.locator('#observer-eclipse-preview')
  await expect(preview).toHaveAttribute('data-kind', 'annular')
  await page.locator('#parameter-observerLatitude').fill('10')
  await expect(preview).toHaveAttribute('data-kind', 'partial')
  await page.locator('#parameter-observerLatitude').fill('70')
  await expect(preview).toHaveAttribute('data-kind', 'none')
  await expect(preview).toHaveAttribute('data-visible', 'false')
  await page.locator('[data-view="space"]').click()
  await expect(page.locator('#location-chip')).toContainText('70.0°')
  await expect(page.locator('#metrics')).toContainText('教學')
})
