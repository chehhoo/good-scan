import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'
import { TODAY } from '../fixtures/test-data'

// Navigate to the Info tab (Tab 3)
async function gotoInfoTab(page: Parameters<typeof gotoAndSync>[0]) {
  await gotoAndSync(page)
  await page.getByText('📋 統計 Info').click()
}

test.describe('MealInfo', () => {
  test('5.1 — shows ordered / taken / remaining counts for each meal', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoInfoTab(page)

    // Lunch (mealId=1): U001 ordered 2 + U002 ordered 1 = 3 boxes, taken=0 → remaining 3
    await expect(page.getByText('午餐 Lunch')).toBeVisible()
    await expect(page.getByText('剩餘 3 盒')).toBeVisible()
    await expect(page.getByText('Westin')).toBeVisible()

    // Dinner (mealId=2): U001 ordered 1 box, taken=0 → remaining 1
    await expect(page.getByText('晚餐 Dinner')).toBeVisible()
    await expect(page.getByText('剩餘 1 盒')).toBeVisible()
    await expect(page.getByText('Hilton')).toBeVisible()

    // Header and sub-label
    await expect(page.getByText('活動餐食統計 Event Meal Stats')).toBeVisible()
    await expect(page.getByText('本機統計 · This device only')).toBeVisible()
  })

  test('5.2 — shows FULL badge when taken equals ordered', async ({ page }) => {
    // Dinner (mealId=2): U001 ordered 1 box — seed one synced scan to fill it
    await mockSyncEndpoints(page, {
      scans: [
        { uid: 'U001', mealId: 2, scannedAt: new Date().toISOString(), clientScanId: 'scan-full-1' },
      ],
    })
    await gotoInfoTab(page)

    // Dinner: 1 ordered, 1 taken → 滿 FULL
    await expect(page.getByText('滿 FULL')).toBeVisible()
    await expect(page.getByText('剩餘 0 盒')).toBeVisible()

    // Lunch is unaffected: 3 ordered, 0 taken
    await expect(page.getByText('剩餘 3 盒')).toBeVisible()
  })

  test('5.3 — shows "No meals found" when no meal orders in cache', async ({ page }) => {
    await mockSyncEndpoints(page, { registerMeals: [] })
    await gotoInfoTab(page)

    // With no registerMeals, ordered=0 for all meals → all filtered out
    await expect(page.getByText('暫無餐食 No meals found')).toBeVisible()
    await expect(page.getByText('午餐 Lunch')).not.toBeVisible()
  })

  test('5.4 — shows "No scan yet" before any scan', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoInfoTab(page)

    await expect(page.getByText('尚未掃描 No scan yet')).toBeVisible()
  })

  test('5.5 — shows last scanned person\'s meal orders after a MealScan', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)

    // Scan U001 on the MealScan tab → sets lastScannedUid in App.tsx
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    // Switch to Info tab — last scanned section should show U001's orders
    await page.getByText('📋 統計 Info').click()

    await expect(page.getByText('上次掃描 Last Scanned')).toBeVisible()
    await expect(page.getByText('朱大明', { exact: true })).toBeVisible()
    // U001 has 2 lunches and 1 dinner ordered
    await expect(page.getByText('2 盒').first()).toBeVisible()
    await expect(page.getByText('1 盒').first()).toBeVisible()
  })

  test('5.6 — sync button triggers re-sync and refreshes stats', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoInfoTab(page)

    // Initial state: 3 ordered for lunch
    await expect(page.getByText('剩餘 3 盒')).toBeVisible()

    // Update mock to add a synced scan (lunch is now 1 taken)
    await mockSyncEndpoints(page, {
      scans: [{ uid: 'U002', mealId: 1, scannedAt: new Date().toISOString(), clientScanId: 'scan-resync-1' }],
    })

    await page.getByText('↻ 同步 Sync').click()
    await expect(page.getByText('同步中…')).toBeVisible()

    // After sync: lunch taken=1, remaining=2
    await expect(page.getByText('剩餘 2 盒')).toBeVisible({ timeout: 10_000 })
  })

  test('5.7 — meals grouped by date with formatted date header', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoInfoTab(page)

    // Both meals are on TODAY — there should be one date group header
    // The header is formatted via toLocaleDateString('zh-TW', { month:'long', day:'numeric', weekday:'short' })
    // We just verify there's exactly one date section and both meals appear under it
    await expect(page.getByText('午餐 Lunch')).toBeVisible()
    await expect(page.getByText('晚餐 Dinner')).toBeVisible()

    // Both meals are today, so both appear under the same date header
    const dateHeader = page.locator('.text-xs.font-semibold.text-blue-400.uppercase')
    await expect(dateHeader).toHaveCount(1)
  })
})
