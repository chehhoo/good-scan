import { defineConfig, devices } from '@playwright/test'

/**
 * E2E tests run against the Vite dev server with all API calls mocked via
 * page.route(). No real good-api is needed.
 *
 *   npx playwright test          # headless
 *   npx playwright test --ui     # interactive UI mode
 *   npx playwright test --headed # headed browser
 *
 * Tests that touch IndexedDB rely on the app's own warmUpCache flow —
 * mock the five sync endpoints to return test data and let the app populate
 * its own IndexedDB, exactly as it does in production.
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'setup',
      testDir: './e2e/fixtures',
      testMatch: 'auth.setup.ts',
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/fixtures/.auth.json' },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
