import { test, expect, type Page } from '@playwright/test'
import { TEST_TOKEN } from '../fixtures/test-data'
import { mockSyncEndpoints } from '../fixtures/mock-api'

// These tests need a clean (unauthenticated) context
test.use({ storageState: { cookies: [], origins: [] } })

// Mock all API endpoints so a running local good-api doesn't interfere
async function mockAll(page: Page) {
  await page.route('**/api/auth/volunteer', (r) =>
    r.fulfill({ json: { token: TEST_TOKEN, eventId: 1, eventName: 'E2E Test Camp' } })
  )
  await mockSyncEndpoints(page)  // includes event-info, all sync endpoints
}

test.describe('Login page', () => {
  test('shows branding and access code input', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Good Vessel · 好器皿')).toBeVisible()
    await expect(page.getByText('志愿者登录 Volunteer Login')).toBeVisible()
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /登录/ })).toBeVisible()
  })

  test('valid access code logs in and shows app', async ({ page }) => {
    await mockAll(page)
    await page.goto('/')

    await page.locator('input[type="text"]').fill('GOSPEL2026')
    await page.getByRole('button', { name: /登录/ }).click()

    await page.waitForSelector('text=餐食 Meal', { timeout: 10_000 })
  })

  test('invalid access code shows error', async ({ page }) => {
    await page.route('**/api/auth/volunteer', (r) =>
      r.fulfill({ status: 401, json: { error: 'Invalid code' } })
    )
    await page.goto('/')

    await page.locator('input[type="text"]').fill('WRONGCODE')
    await page.getByRole('button', { name: /登录/ }).click()

    await expect(page.getByText('密码不对 Invalid access code')).toBeVisible()
  })

  test('enter key submits the form', async ({ page }) => {
    await mockAll(page)
    await page.goto('/')

    await page.locator('input[type="text"]').fill('GOSPEL2026')
    await page.locator('input[type="text"]').press('Enter')

    await page.waitForSelector('text=餐食 Meal', { timeout: 10_000 })
  })

  test('?code= in URL auto-submits', async ({ page }) => {
    await mockAll(page)
    await page.goto('/?code=GOSPEL2026')

    await page.waitForSelector('text=餐食 Meal', { timeout: 10_000 })
  })

  test('empty input keeps login button disabled', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /登录/ })).toBeDisabled()
  })
})
