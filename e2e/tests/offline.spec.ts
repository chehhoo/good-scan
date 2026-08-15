/**
 * Offline operation tests — verifies the app works without network after
 * the initial cache warm-up.
 *
 * page.context().setOffline(true/false) blocks real network connections.
 * page.route() mocks are intercepted at the Playwright layer (above the network)
 * so they remain active even when the context is set to offline.
 */
import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'

test.describe('Offline operation', () => {
  test('4.1 — can scan and see result from IndexedDB while offline', async ({ page, context }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)

    await context.setOffline(true)
    await expect(page.getByText('离线 Offline')).toBeVisible()

    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()
    await expect(page.locator('span.text-2xl.font-extrabold')).toHaveText('朱大明')
  })

  test('4.2 — offline scan is queued locally (StatusDot shows pending count)', async ({ page, context }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)

    await context.setOffline(true)
    await expect(page.getByText('离线 Offline')).toBeVisible()

    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()

    // StatusDot shows pending count — refreshPendingCount fires every 10s
    await expect(page.getByText(/离线 \d+ 待同步/)).toBeVisible({ timeout: 15_000 })
  })

  test('4.3 — queued scans flush automatically when back online', async ({ page, context }) => {
    let flushCalled = false
    await mockSyncEndpoints(page)
    await page.route('**/api/scan/sync/flush', (r) => {
      flushCalled = true
      r.fulfill({ json: { accepted: [1], rejected: [] } })
    })
    await gotoAndSync(page)

    // Scan offline
    await context.setOffline(true)
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()

    // Come back online — flushQueue runs every 10s; wait up to 15s
    await context.setOffline(false)
    await page.waitForFunction(() => (window as any).__flushCalled === true, { timeout: 15_000 }).catch(() => {})

    // Expose the flag via a simple wait on the flush route being called
    await expect
      .poll(() => flushCalled, { timeout: 15_000, intervals: [1000] })
      .toBe(true)
  })

  test('4.4 — voided scan removed from local queue on next sync', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)

    // Scan U001 for meal 1
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()
    // Taken should now be 1
    const takenBefore = await page.locator('.text-2xl.font-bold.tabular-nums').nth(1).textContent()
    expect(takenBefore?.trim()).toBe('1')
    await page.locator('button:has-text("扫描下一位")').click()

    // Re-mock sync to mark that scan as voided (last-registered route takes precedence)
    await page.route('**/api/scan/sync/voided-scans', (r) =>
      r.fulfill({ json: [{ uid: 'U001', mealId: 1 }] })
    )

    // Reload — warmUpCache auto-fires on mount, picks up the voided-scans override
    await page.reload()
    await expect(page.getByText('在线 Online')).toBeVisible({ timeout: 10_000 })

    // Scan U001 again — voided scan should be gone, taken resets to 0
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()
    const takenAfter = await page.locator('.text-2xl.font-bold.tabular-nums').nth(1).textContent()
    expect(takenAfter?.trim()).toBe('0')
  })

  test('4.5 — stale previous-event data cleared on re-sync (clear + bulkAdd, not upsert)', async ({ page }) => {
    // First load: only old profile U999
    const oldProfiles = [
      { id: 99, uid: 'U999', cnName: '旧营员', firstName: 'Old', lastName: 'Attendee', householdId: 99 },
    ]
    await mockSyncEndpoints(page, { meals: [], registerMeals: [] })
    await page.route('**/api/scan/sync/profiles', (r) => r.fulfill({ json: oldProfiles }))
    await gotoAndSync(page)

    // U999 should be findable
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U999')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('旧营员')).toBeVisible()
    await page.locator('button:has-text("扫描下一位")').click()

    // New sync: U999 is gone — only U001 exists now (new event)
    await page.route('**/api/scan/sync/profiles', (r) =>
      r.fulfill({ json: [{ id: 1, uid: 'U001', cnName: '朱大明', firstName: 'David', lastName: 'Zhu', householdId: 1 }] })
    )

    // Reload — warmUpCache auto-fires, picks up the new profiles route
    await page.reload()
    await expect(page.getByText('在线 Online')).toBeVisible({ timeout: 10_000 })

    // U999 should no longer be found — IndexedDB was cleared and replaced
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U999')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('没有这个注册记录 UID not found')).toBeVisible({ timeout: 5_000 })
  })
})
