import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'
import { PROFILES, REGISTER_MEALS } from '../fixtures/test-data'

/**
 * A family registered at the door minutes ago isn't in the device's offline cache
 * until the next 5-minute refresh. Scanning them must refresh and find them,
 * not answer "UID not found".
 */
test.describe('Walk-in not yet in the offline cache', () => {
  const WALK_IN = { id: 3, uid: 'U003', cnName: '王小明', firstName: 'Ming', lastName: 'Wang', householdId: 3 }

  test.beforeEach(async ({ page }) => {
    await mockSyncEndpoints(page)

    // First sync (on load) doesn't know the walk-in; any later sync does.
    let profileSyncs = 0
    await page.route('**/api/scan/sync/profiles', (r) =>
      r.fulfill({ json: ++profileSyncs === 1 ? PROFILES : [...PROFILES, WALK_IN] })
    )
    let mealSyncs = 0
    await page.route('**/api/scan/sync/register-meals', (r) =>
      r.fulfill({ json: ++mealSyncs === 1
        ? REGISTER_MEALS
        : [...REGISTER_MEALS, { id: 4, householdId: 3, mealId: 1, registerId: 3, qty: 1 }] })
    )

    await gotoAndSync(page)
  })

  test('meal scan refreshes the cache and serves the walk-in', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U003')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()
    await expect(page.locator('span.text-2xl.font-extrabold')).toHaveText('王小明')
  })

  test('a code nobody registered still shows UID not found', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('NOBODY')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.locator('.text-blue-300').filter({ hasText: '没有这个注册记录 UID not found' })).toBeVisible()
  })
})
