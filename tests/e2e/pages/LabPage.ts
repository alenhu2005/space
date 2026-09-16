import { expect, type Page } from '@playwright/test'

export class LabPage {
  constructor(readonly page: Page) {}

  async open(search = ''): Promise<void> {
    await this.page.goto(`/${search}`)
    await expect(this.page.getByRole('heading', { name: /天球與星空運動|太陽視運動與四季|月相與月球運動|日食與月食|日月引潮力與潮汐|克卜勒與行星運動/ })).toBeVisible()
  }

  async selectScene(label: string, heading: string): Promise<void> {
    const button = this.page.getByRole('navigation', { name: '教學場景' }).getByRole('button', { name: new RegExp(`${label}$`) })
    if (['天球', '潮汐', '克卜勒'].includes(label) && !(await button.isVisible())) {
      await this.page.locator('#developer-tools summary').click()
    }
    await button.click()
    await expect(this.page.getByRole('heading', { name: heading })).toBeVisible()
  }

  async openControls(): Promise<void> {
    const toggle = this.page.getByRole('button', { name: '調整模型' })
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
    await expect(this.page.getByRole('complementary', { name: '場景控制面板' })).toBeVisible()
  }

  async closeControls(): Promise<void> {
    const toggle = this.page.getByRole('button', { name: '調整模型' })
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') return
    const close = this.page.getByRole('button', { name: '關閉控制面板' })
    if (await close.isVisible()) await close.click()
  }

  async action(name: '向前一步' | '重設場景'): Promise<void> {
    const mobileControls = this.page.getByRole('button', { name: '調整模型' })
    if (await mobileControls.isVisible()) {
      await this.openControls()
      await this.page.getByRole('complementary', { name: '場景控制面板' }).getByRole('button', { name, exact: true }).click()
    } else {
      await this.page.getByRole('contentinfo', { name: '時間控制' }).getByRole('button', { name, exact: true }).click()
    }
  }
}
