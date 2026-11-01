import { test as setup } from '@playwright/test'
import { mockSyncEndpoints } from './mock-api'

const AUTH_FILE = 'e2e/fixtures/.auth.json'

setup('authenticate as volunteer', async ({ page }) => {
  await mockSyncEndpoints(page)

  await page.goto('/')
  await page.locator('input[type="text"]').fill('TESTCODE')
  await page.locator('button:has-text("登入")').click()

  // Wait for full sync to confirm login succeeded and warmUpCache ran
  await page.waitForSelector('text=在線 Online', { timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
})
