import { test as setup } from '@playwright/test'
import { TEST_TOKEN } from './test-data'

const AUTH_FILE = 'e2e/fixtures/.auth.json'

setup('authenticate as volunteer', async ({ page }) => {
  await page.route('**/api/auth/volunteer', (route) =>
    route.fulfill({ json: { token: TEST_TOKEN } })
  )

  await page.goto('/')
  await page.locator('input[type="text"]').fill('TESTCODE')
  await page.locator('button:has-text("登录")').click()

  // Wait until the app moves past the login screen
  await page.waitForSelector('text=餐食 Meal')

  await page.context().storageState({ path: AUTH_FILE })
})
