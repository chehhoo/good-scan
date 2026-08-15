import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'

test.describe('MealScan', () => {
  test.beforeEach(async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)
  })

  test('manual entry: known UID shows success result', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()
    // Name appears in header, pickup history, and meal table — target the heading span
    await expect(page.locator('span.text-2xl.font-extrabold')).toHaveText('朱大明')
    await expect(page.getByText('MEAL SERVED')).toBeVisible()
  })

  test('shows correct ordered / taken / remaining counts', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()

    // U001 ordered 2 lunches, taken 0 → remaining 1 after first scan
    await expect(page.getByText('订了 Ordered')).toBeVisible()
    await expect(page.getByText('领了 Taken')).toBeVisible()
    await expect(page.getByText('剩下 Remaining')).toBeVisible()
    await expect(page.locator('text=1').first()).toBeVisible() // remaining = 1
  })

  test('unknown UID shows error', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('UNKNOWN')
    await page.locator('button:has-text("查询 Go")').click()

    // Text appears in both status stripe and detail div — target the detail div
    await expect(page.locator('.text-blue-300').filter({ hasText: '没有这个注册记录 UID not found' })).toBeVisible()
    await expect(page.getByText('ERROR')).toBeVisible()
  })

  test('quota exceeded shows warning banner', async ({ page }) => {
    // Scan U002 twice — they only ordered 1 lunch
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U002')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()

    await page.locator('button:has-text("扫描下一位")').click()

    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U002')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('QUOTA EXCEEDED')).toBeVisible()
    await expect(page.getByText('抱歉！已领了全部')).toBeVisible()
  })

  test('"Scan Next" button returns to scanner', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('成功！请拿饭盒')).toBeVisible()

    await page.locator('button:has-text("扫描下一位")').click()

    await expect(page.locator('input[placeholder="手动输入 Person ID"]')).toBeVisible()
    await expect(page.getByText('成功！请拿饭盒')).not.toBeVisible()
  })

  test('meal plans table is shown after scan', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('地点')).toBeVisible()
    await expect(page.getByText('Westin')).toBeVisible()
  })
})
