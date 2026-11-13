import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'

test.describe('MealScan', () => {
  test.beforeEach(async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)
  })

  test('manual entry: known UID shows success result', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()

    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
    // Name appears in header, pickup history, and meal table — target the heading span
    await expect(page.locator('span.text-2xl.font-extrabold')).toHaveText('朱大明')
    await expect(page.getByText('MEAL SERVED')).toBeVisible()
  })

  test('shows correct ordered / taken / remaining counts', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()

    // U001 ordered 2 lunches, taken 0 → remaining 1 after first scan
    await expect(page.getByText('訂了 Ordered')).toBeVisible()
    await expect(page.getByText('領了 Taken')).toBeVisible()
    await expect(page.getByText('剩下 Remaining')).toBeVisible()
    await expect(page.locator('text=1').first()).toBeVisible() // remaining = 1
  })

  test('unknown UID shows error', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('UNKNOWN')
    await page.locator('button:has-text("查詢 Go")').click()

    // Text appears in both status stripe and detail div — target the detail div
    await expect(page.locator('.text-blue-300').filter({ hasText: '沒有這個註冊記錄 UID not found' })).toBeVisible()
    await expect(page.getByText('ERROR')).toBeVisible()
  })

  test('quota exceeded shows warning banner', async ({ page }) => {
    // Scan U002 twice — they only ordered 1 lunch
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U002')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    await page.locator('button:has-text("掃描下一位")').click()

    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U002')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('QUOTA EXCEEDED')).toBeVisible()
    await expect(page.getByText('抱歉！已領了全部')).toBeVisible()
  })

  test('"Scan Next" button returns to scanner', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    await page.locator('button:has-text("掃描下一位")').click()

    await expect(page.locator('input[placeholder="手動輸入 Person ID"]')).toBeVisible()
    await expect(page.getByText('成功！請拿飯盒')).not.toBeVisible()
  })

  test('meal plans table is shown after scan', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()

    // Meal plans are behind a collapsible accordion — expand it first
    await page.locator('button:has-text("餐食 Meal Plans")').click()
    await expect(page.getByText('地點')).toBeVisible()
    // Scope to the table — MealPillBar also shows a Westin badge now
    await expect(page.getByRole('table').getByText('Westin')).toBeVisible()
  })

  test('undo timer ticks down after successful scan', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    // Undo button should appear with countdown starting at 10
    const undoButton = page.locator('button:has-text("撤銷 Undo")')
    await expect(undoButton).toBeVisible()
    await expect(undoButton).toContainText('10s')

    // Wait a second and check countdown decreased
    await page.waitForTimeout(1100)
    await expect(undoButton).toContainText('9s')
  })

  test('"Scan Next" during undo window cancels timer and commits scan', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    // Undo button appears
    const undoButton = page.locator('button:has-text("撤銷 Undo")')
    await expect(undoButton).toBeVisible()
    await expect(undoButton).toContainText('10s')

    // Immediately press Scan Next before timer expires
    await page.locator('button:has-text("掃描下一位")').click()

    // Result disappears, undo button gone, camera returns
    await expect(page.getByText('成功！請拿飯盒')).not.toBeVisible()
    await expect(undoButton).not.toBeVisible()
    await expect(page.locator('input[placeholder="手動輸入 Person ID"]')).toBeVisible()
  })

  test('undo timer expires naturally and commits scan', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    const undoButton = page.locator('button:has-text("撤銷 Undo")')
    await expect(undoButton).toBeVisible()

    // Wait for timer to expire (10 seconds + buffer)
    await page.waitForTimeout(11_000)

    // Undo button should disappear after timer expires
    await expect(undoButton).not.toBeVisible()
    // Result should still be visible (only the undo button leaves)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()
  })

  test('rapid "Scan Next" presses don\'t cause issues', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    // One click is all that's needed — reset() removes the result screen immediately,
    // so a second click would just time out waiting for a button that's already gone.
    await page.locator('button:has-text("掃描下一位")').click()

    // Should return to scanner cleanly (no errors)
    await expect(page.locator('input[placeholder="手動輸入 Person ID"]')).toBeVisible()
    await expect(page.getByText('成功！請拿飯盒')).not.toBeVisible()
  })

  test('tapping undo button cancels the scan', async ({ page }) => {
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible()

    // Tap the undo button
    await page.locator('button:has-text("撤銷 Undo")').click()

    // Result disappears, back to scanner
    await expect(page.getByText('成功！請拿飯盒')).not.toBeVisible()
    await expect(page.locator('input[placeholder="手動輸入 Person ID"]')).toBeVisible()
  })
})

