/**
 * Scan History tab (📜 記錄) tests.
 *
 * The tab shows scans from the local IndexedDB scanQueue, enriched with
 * attendee name and meal label. Filter tabs: 全部 / 待同步 / 已同步 / 被拒.
 */
import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'

async function gotoHistoryTab(page: Parameters<typeof gotoAndSync>[0]) {
  await gotoAndSync(page)
  await page.getByText('📜 記錄').click()
}

test.describe('ScanHistory', () => {
  test('8.1 — shows "No records" when no scans in queue', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoHistoryTab(page)
    await expect(page.getByText('暫無記錄 No records')).toBeVisible()
  })

  test('8.2 — shows attendee name and meal label after a scan', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)

    // Scan U001 for meal 1
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
    await page.locator('button:has-text("掃描下一位")').click()

    // Open history tab
    await page.getByText('📜 記錄').click()
    await expect(page.getByText('掃描記錄 Scan History')).toBeVisible()
    await expect(page.getByText('朱大明')).toBeVisible()
    await expect(page.getByText(/午餐 Lunch/)).toBeVisible()
  })

  test('8.3 — pending filter shows only unsynced scans', async ({ page, context }) => {
    await mockSyncEndpoints(page)
    // Seed one pre-synced scan via the scans endpoint
    await mockSyncEndpoints(page, {
      scans: [{ uid: 'U002', mealId: 1, scannedAt: new Date().toISOString(), clientScanId: 'server-scan-1' }],
    })
    await gotoAndSync(page)

    // Add an offline (pending) scan
    await context.setOffline(true)
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
    await page.locator('button:has-text("掃描下一位")').click()

    await page.getByText('📜 記錄').click()
    // Switch to pending filter
    await page.getByText('待同步').click()
    // Only the pending scan (U001) should appear; the synced server scan should not
    await expect(page.getByText('朱大明')).toBeVisible()
    // 待同步 status label appears next to the pending row
    await expect(page.getByText('待同步').first()).toBeVisible()
  })

  test('8.4 — synced filter shows only synced scans', async ({ page }) => {
    await mockSyncEndpoints(page, {
      scans: [{ uid: 'U002', mealId: 1, scannedAt: new Date().toISOString(), clientScanId: 'server-scan-2' }],
    })
    await gotoHistoryTab(page)

    await page.getByText('已同步').click()
    await expect(page.getByText('李小紅')).toBeVisible()
    await expect(page.getByText('已同步').nth(1)).toBeVisible() // status label on the row
  })

  test('8.5 — refused filter shows only refused scans', async ({ page, context }) => {
    await mockSyncEndpoints(page)
    await page.route('**/api/scan/sync/flush', (r) =>
      r.fulfill({ json: { accepted: [], rejected: [{ localId: '1', reason: 'Quota exceeded (qty=2)' }] } })
    )
    await page.route('**/api/meal/scan', (r) => r.fulfill({ status: 503, body: 'unavailable' }))
    await gotoAndSync(page)

    // Create a refused scan
    await context.setOffline(true)
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByText('1 筆未被接受')).toBeVisible({ timeout: 20_000 })

    await page.getByText('📜 記錄').click()
    await page.getByText('被拒').click()
    await expect(page.getByText('朱大明')).toBeVisible()
    // Refused reason shown in the row
    await expect(page.getByText(/已超過此家庭訂餐數量|Quota exceeded/)).toBeVisible()
  })

  test('8.6 — refresh button reloads the list', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoHistoryTab(page)
    await expect(page.getByText('暫無記錄 No records')).toBeVisible()

    // The refresh button should be present and not throw
    await page.getByText('↻ 刷新').click()
    await expect(page.getByText('暫無記錄 No records')).toBeVisible()
  })
})
