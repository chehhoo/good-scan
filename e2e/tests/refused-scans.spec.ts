/**
 * Refused scan badge and modal tests.
 *
 * The server permanently refuses a scan when quota is exceeded.
 * The volunteer sees a red badge "N 筆未被接受" in the header.
 * Tapping it opens a modal listing the refused scans with a Dismiss button.
 */
import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'

test.describe('Refused scans', () => {
  test('7.1 — refused scan badge appears after server permanently rejects a scan', async ({ page, context }) => {
    await mockSyncEndpoints(page)
    await page.route('**/api/scan/sync/flush', (r) =>
      r.fulfill({ json: { accepted: [], rejected: [{ localId: '1', reason: 'Quota exceeded (qty=2)' }] } })
    )
    await page.route('**/api/meal/scan', (r) => r.fulfill({ status: 503, body: 'unavailable' }))
    await gotoAndSync(page)

    // Scan offline so it queues
    await context.setOffline(true)
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    // Come back online — flush fires, server refuses it
    await context.setOffline(false)
    await expect(page.getByText('1 筆未被接受')).toBeVisible({ timeout: 20_000 })

    // Refused scan must NOT appear in pending count
    await expect(page.getByText(/離線 \d+ 待同步/)).not.toBeVisible()
  })

  test('7.2 — tapping the refused badge opens the modal with scan details', async ({ page, context }) => {
    await mockSyncEndpoints(page)
    await page.route('**/api/scan/sync/flush', (r) =>
      r.fulfill({ json: { accepted: [], rejected: [{ localId: '1', reason: 'Quota exceeded (qty=2)' }] } })
    )
    await page.route('**/api/meal/scan', (r) => r.fulfill({ status: 503, body: 'unavailable' }))
    await gotoAndSync(page)

    await context.setOffline(true)
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByText('1 筆未被接受')).toBeVisible({ timeout: 20_000 })

    // Open the modal
    await page.getByText('1 筆未被接受').click()
    await expect(page.getByText('未被接受的掃描 Not Accepted')).toBeVisible()
    // Shows the rejection reason
    await expect(page.getByText(/已超過此家庭訂餐數量|Over the family/)).toBeVisible()
    // Shows a dismiss button
    await expect(page.getByText('清除 Dismiss')).toBeVisible()
  })

  test('7.3 — dismissing a refused scan removes it from the modal and clears the badge', async ({ page, context }) => {
    await mockSyncEndpoints(page)
    await page.route('**/api/scan/sync/flush', (r) =>
      r.fulfill({ json: { accepted: [], rejected: [{ localId: '1', reason: 'Quota exceeded (qty=2)' }] } })
    )
    await page.route('**/api/meal/scan', (r) => r.fulfill({ status: 503, body: 'unavailable' }))
    await gotoAndSync(page)

    await context.setOffline(true)
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByText('1 筆未被接受')).toBeVisible({ timeout: 20_000 })

    // Open modal and dismiss
    await page.getByText('1 筆未被接受').click()
    await page.getByText('清除 Dismiss').click()

    // Modal closes and badge disappears
    await expect(page.getByText('未被接受的掃描 Not Accepted')).not.toBeVisible()
    await expect(page.getByText('1 筆未被接受')).not.toBeVisible()
  })

  test('7.4 — transient rejection (No active event) keeps the scan pending, no badge', async ({ page, context }) => {
    test.setTimeout(55_000)
    let flushCount = 0
    await mockSyncEndpoints(page)
    await page.route('**/api/scan/sync/flush', (r) => {
      flushCount++
      r.fulfill({ json: { accepted: [], rejected: [{ localId: '1', reason: 'No active event' }] } })
    })
    await page.route('**/api/meal/scan', (r) => r.fulfill({ status: 503, body: 'unavailable' }))
    await gotoAndSync(page)

    await context.setOffline(true)
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
    await context.setOffline(false)

    // Wait for at least one flush, then verify no refused badge
    await expect.poll(() => flushCount >= 1, { timeout: 25_000, intervals: [1000] }).toBe(true)
    await expect(page.getByText('1 筆未被接受')).not.toBeVisible()
    // And it retries (pending, not permanently gone)
    await expect.poll(() => flushCount >= 2, { timeout: 15_000, intervals: [1000] }).toBe(true)
  })
})
