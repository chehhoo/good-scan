import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'

const CHECKIN_RESPONSE = {
  success: true,
  name: '朱大明',
  alreadyCheckedIn: false,
  checkinTime: new Date().toISOString().replace('Z', ''),
}

test.describe('CheckIn', () => {
  test.beforeEach(async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)
    await page.getByText('✓ 报到 Check-In').click()
  })

  test('successful check-in shows green banner and name', async ({ page }) => {
    await page.route('**/api/scan/sync/checkin', (r) =>
      r.fulfill({ json: CHECKIN_RESPONSE })
    )

    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('✓ 报到成功!')).toBeVisible()
    await expect(page.getByText('朱大明')).toBeVisible()
    await expect(page.getByText('报到时间 Check-In Time')).toBeVisible()
  })

  test('already checked in shows yellow warning banner', async ({ page }) => {
    await page.route('**/api/scan/sync/checkin', (r) =>
      r.fulfill({ json: { ...CHECKIN_RESPONSE, alreadyCheckedIn: true } })
    )

    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('⚠ 已报到')).toBeVisible()
    await expect(page.getByText('Already checked in')).toBeVisible()
  })

  test('unknown UID shows error (not in local cache)', async ({ page }) => {
    await page.locator('input[placeholder="手动输入 Person ID"]').fill('GHOST')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('✗ 报到失败 Check-In Failed')).toBeVisible()
    await expect(page.getByText('未找到此人 Person not found')).toBeVisible()
  })

  test('network error shows failure banner', async ({ page }) => {
    await page.route('**/api/scan/sync/checkin', (r) =>
      r.fulfill({ status: 500, json: { error: 'Server error' } })
    )

    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()

    await expect(page.getByText('✗ 报到失败 Check-In Failed')).toBeVisible()
  })

  test('"Scan Next" returns to scanner', async ({ page }) => {
    await page.route('**/api/scan/sync/checkin', (r) =>
      r.fulfill({ json: CHECKIN_RESPONSE })
    )

    await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
    await page.locator('button:has-text("查询 Go")').click()
    await expect(page.getByText('✓ 报到成功!')).toBeVisible()

    await page.locator('button:has-text("扫描下一位")').click()

    await expect(page.locator('input[placeholder="手动输入 Person ID"]')).toBeVisible()
    await expect(page.getByText('✓ 报到成功!')).not.toBeVisible()
  })
})
