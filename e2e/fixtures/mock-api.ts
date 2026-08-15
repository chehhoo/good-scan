import type { Page } from '@playwright/test'
import { PROFILES, MEALS, REGISTER_MEALS, TEST_TOKEN } from './test-data'

/**
 * Freeze the browser's clock to a specific HH:MM on today's date.
 * Uses Playwright's native clock API (page.clock.setFixedTime) which intercepts
 * Date, performance.now, setTimeout, etc. at the CDP level — more reliable than
 * window.Date replacement via addInitScript.
 * Must be called BEFORE page.goto().
 */
export async function mockCurrentTime(page: Page, hhMm: string) {
  const [h, m] = hhMm.split(':').map(Number)
  const fakeTs = new Date()
  fakeTs.setHours(h, m, 0, 0)
  // setFixedTime works without clock.install() and doesn't freeze timers
  await page.clock.setFixedTime(fakeTs)
}

/**
 * Mocks all five sync endpoints so warmUpCache() populates IndexedDB with
 * test data. Call this before page.goto('/') in any test that needs DB data.
 * Pass custom meals/registerMeals to override the defaults (e.g. for auto-detection tests).
 */
export async function mockSyncEndpoints(
  page: Page,
  overrides: { meals?: unknown[]; registerMeals?: unknown[] } = {}
) {
  await page.route('**/api/auth/volunteer', (r) =>
    r.fulfill({ json: { token: TEST_TOKEN } })
  )
  await page.route('**/api/register/event-info', (r) =>
    r.fulfill({ json: { name: 'E2E 测试营', nameEng: 'E2E Test Camp' } })
  )
  await page.route('**/api/scan/sync/profiles', (r) =>
    r.fulfill({ json: PROFILES })
  )
  await page.route('**/api/scan/sync/meals', (r) =>
    r.fulfill({ json: overrides.meals ?? MEALS })
  )
  await page.route('**/api/scan/sync/register-meals', (r) =>
    r.fulfill({ json: overrides.registerMeals ?? REGISTER_MEALS })
  )
  await page.route('**/api/scan/sync/voided-scans', (r) =>
    r.fulfill({ json: [] })
  )
  await page.route('**/api/scan/sync/scans', (r) =>
    r.fulfill({ json: [] })
  )
}

/**
 * Navigates to the app and waits for warmUpCache to complete (status dot
 * turns green, indicating a successful sync).
 */
export async function gotoAndSync(page: Page) {
  await page.goto('/')
  await page.waitForSelector('text=在线 Online', { timeout: 15_000 })
}
