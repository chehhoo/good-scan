import { test, expect } from '@playwright/test'
import { TEST_TOKEN } from '../fixtures/test-data'

// These tests need a clean (unauthenticated) context
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login page', () => {
  test('shows branding and access code input', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Good Vessel · 好器皿')).toBeVisible()
    await expect(page.getByText('志愿者登录 Volunteer Login')).toBeVisible()
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /登录/ })).toBeVisible()
  })

  test('valid access code logs in and shows app', async ({ page }) => {
    await page.route('**/api/auth/volunteer', (r) =>
      r.fulfill({ json: { token: TEST_TOKEN } })
    )
    await page.goto('/')

    await page.locator('input[type="text"]').fill('GOSPEL2026')
    await page.getByRole('button', { name: /登录/ }).click()

    // Tab bar appears as soon as token is set — sync failures are silently ignored
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
    await page.route('**/api/auth/volunteer', (r) =>
      r.fulfill({ json: { token: TEST_TOKEN } })
    )
    await page.goto('/')

    await page.locator('input[type="text"]').fill('GOSPEL2026')
    await page.locator('input[type="text"]').press('Enter')

    await page.waitForSelector('text=餐食 Meal', { timeout: 10_000 })
  })

  test('?code= in URL auto-submits', async ({ page }) => {
    await page.route('**/api/auth/volunteer', (r) =>
      r.fulfill({ json: { token: TEST_TOKEN } })
    )
    await page.goto('/?code=GOSPEL2026')

    await page.waitForSelector('text=餐食 Meal', { timeout: 10_000 })
  })

  test('empty input keeps login button disabled', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /登录/ })).toBeDisabled()
  })
})
