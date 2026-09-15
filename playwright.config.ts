import { defineConfig, devices } from '@playwright/test'

const requestedPort = Number(process.env.LAB_TEST_PORT ?? 4173)
const port = Number.isInteger(requestedPort) && requestedPort > 1024 && requestedPort < 65536 ? requestedPort : 4173
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.CI ? 'github' : 'list',
  snapshotPathTemplate: '{testDir}/snapshots/{platform}/{arg}-{projectName}{ext}',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Taipei'
  },
  webServer: {
    command: `npm run dev -- --strictPort --port ${port}`,
    url: baseURL,
    reuseExistingServer: false
  },
  projects: [
    { name: 'desktop', testIgnore: '**/visual.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', testIgnore: '**/visual.spec.ts', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } },
    { name: 'mobile', testIgnore: '**/visual.spec.ts', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'firefox', testIgnore: '**/visual.spec.ts', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', testIgnore: '**/visual.spec.ts', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    ...[
      ['visual-desktop', 1440, 900],
      ['visual-tablet', 834, 1194],
      ['visual-mobile', 390, 844]
    ].map(([name, width, height]) => ({
      name: String(name),
      testMatch: '**/visual.spec.ts',
      use: {
        browserName: 'chromium' as const,
        viewport: { width: Number(width), height: Number(height) },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce' as const
      }
    }))
  ]
})
