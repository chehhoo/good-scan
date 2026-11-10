import { test, expect } from '@playwright/test'
import { mockSyncEndpoints } from '../fixtures/mock-api'

test.describe('StatusDot', () => {
  test('shows green (在線 Online) after successful sync', async ({ page }) => {
    await mockSyncEndpoints(page)
    await page.goto('/')
    await expect(page.getByText('在線 Online')).toBeVisible({ timeout: 15_000 })
  })

  test('shows red (緩存過期) when last sync is stale', async ({ page }) => {
    await mockSyncEndpoints(page)
    await page.goto('/')
    await expect(page.getByText('在線 Online')).toBeVisible({ timeout: 15_000 })

    // Abort sync calls on reload so warmUpCache fails and stale state persists.
    // Without this, mocked sync completes in <5s and races the stale assertion.
    await page.route('**/api/scan/sync/**', route => route.abort())
    await page.evaluate(() => {
      const stale = new Date(Date.now() - 31 * 60 * 1000).toISOString()
      localStorage.setItem('lastCacheSyncAt', stale)
    })
    await page.reload()
    await expect(page.getByText('緩存過期 · 點擊同步')).toBeVisible({ timeout: 5_000 })
  })

  test('tapping stale dot triggers re-sync and turns green', async ({ page }) => {
    await mockSyncEndpoints(page)
    await page.goto('/')
    await expect(page.getByText('在線 Online')).toBeVisible({ timeout: 15_000 })

    // Abort sync on reload so stale state is reliably visible before clicking
    await page.route('**/api/scan/sync/**', route => route.abort())
    await page.evaluate(() => {
      const stale = new Date(Date.now() - 31 * 60 * 1000).toISOString()
      localStorage.setItem('lastCacheSyncAt', stale)
    })
    await page.reload()
    await expect(page.getByText('緩存過期 · 點擊同步')).toBeVisible({ timeout: 5_000 })

    // Re-register sync mocks (LIFO — takes priority over abort handler) so re-sync succeeds
    await mockSyncEndpoints(page)
    await page.getByText('緩存過期 · 點擊同步').click({ force: true })
    await expect(page.getByText('在線 Online')).toBeVisible({ timeout: 10_000 })
  })
})
