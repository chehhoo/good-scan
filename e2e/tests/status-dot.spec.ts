import { test, expect } from '@playwright/test'
import { mockSyncEndpoints } from '../fixtures/mock-api'

test.describe('StatusDot', () => {
  test('shows green (在线 Online) after successful sync', async ({ page }) => {
    await mockSyncEndpoints(page)
    await page.goto('/')
    await expect(page.getByText('在线 Online')).toBeVisible({ timeout: 15_000 })
  })

  test('shows red (缓存过期) when last sync is stale', async ({ page }) => {
    await mockSyncEndpoints(page)
    await page.goto('/')
    await expect(page.getByText('在线 Online')).toBeVisible({ timeout: 15_000 })

    // Set lastCacheSyncAt to 31 minutes ago to force stale state
    await page.evaluate(() => {
      const stale = new Date(Date.now() - 31 * 60 * 1000).toISOString()
      localStorage.setItem('lastCacheSyncAt', stale)
    })
    await page.reload()
    await expect(page.getByText('缓存过期 · 点击同步')).toBeVisible({ timeout: 5_000 })
  })

  test('tapping stale dot triggers re-sync and turns green', async ({ page }) => {
    await mockSyncEndpoints(page)
    await page.goto('/')
    await expect(page.getByText('在线 Online')).toBeVisible({ timeout: 15_000 })

    await page.evaluate(() => {
      const stale = new Date(Date.now() - 31 * 60 * 1000).toISOString()
      localStorage.setItem('lastCacheSyncAt', stale)
    })
    await page.reload()
    await expect(page.getByText('缓存过期 · 点击同步')).toBeVisible()

    // Button is disabled while syncing; use force:true to click it in its enabled stale state
    await page.getByText('缓存过期 · 点击同步').click({ force: true })
    await expect(page.getByText('在线 Online')).toBeVisible({ timeout: 10_000 })
  })
})
