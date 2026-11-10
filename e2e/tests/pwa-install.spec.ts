import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync } from '../fixtures/mock-api'

// InstallBanner tests all run on the LoginPage (unauthenticated)
test.use({ storageState: { cookies: [], origins: [] } })

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.5993.69 Mobile/15E148 Safari/604.1'

/** Override navigator.userAgent before React initialises (must be called before goto) */
async function spoofUserAgent(page: Parameters<typeof gotoAndSync>[0], ua: string) {
  await page.addInitScript((userAgent) => {
    Object.defineProperty(navigator, 'userAgent', { get: () => userAgent, configurable: true })
  }, ua)
}

test.describe('InstallBanner', () => {
  test('PWA-1 — desktop Chrome: no install banner shown (not-applicable)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('義工登入 Volunteer Login')).toBeVisible()

    // None of the install UI variants should appear on a plain desktop browser
    await expect(page.getByText('安裝到主畫面 Add to Home Screen')).not.toBeVisible()
    await expect(page.getByText('請用 Safari 開啟')).not.toBeVisible()
    await expect(page.getByText('✓ 已安裝 Installed')).not.toBeVisible()
    await expect(page.getByRole('button', { name: '安裝 Install' })).not.toBeVisible()
  })

  test('PWA-2 — gs_pwa_installed flag: shows "✓ 已安裝 Installed" badge', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gs_pwa_installed', '1')
    })
    await page.goto('/')
    await expect(page.getByText('✓ 已安裝 Installed')).toBeVisible()
  })

  test('PWA-3 — dismiss "✓ 已安裝" badge hides the banner', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gs_pwa_installed', '1')
    })
    await page.goto('/')
    await expect(page.getByText('✓ 已安裝 Installed')).toBeVisible()

    await page.getByRole('button', { name: '關閉' }).click()
    await expect(page.getByText('✓ 已安裝 Installed')).not.toBeVisible()
  })

  test('PWA-4 — iOS Safari UA: shows Add to Home Screen instructions', async ({ page }) => {
    await spoofUserAgent(page, IOS_SAFARI_UA)
    await page.goto('/')

    await expect(page.getByText('安裝到主畫面 Add to Home Screen')).toBeVisible()
    // Instructions mention the share icon
    await expect(page.getByText(/分享按鈕/)).toBeVisible()
  })

  test('PWA-4b — dismiss iOS Safari banner hides it', async ({ page }) => {
    await spoofUserAgent(page, IOS_SAFARI_UA)
    await page.goto('/')
    await expect(page.getByText('安裝到主畫面 Add to Home Screen')).toBeVisible()

    await page.getByRole('button', { name: '稍後' }).click()
    await expect(page.getByText('安裝到主畫面 Add to Home Screen')).not.toBeVisible()
  })

  test('PWA-5 — iOS Chrome UA (CriOS): shows "請用 Safari 開啟" warning', async ({ page }) => {
    await spoofUserAgent(page, IOS_CHROME_UA)
    await page.goto('/')

    await expect(page.getByText('請用 Safari 開啟')).toBeVisible()
    await expect(page.getByText(/iOS 裝置需在 Safari 中安裝/)).toBeVisible()
  })

  test('PWA-5b — dismiss "請用 Safari" banner hides it', async ({ page }) => {
    await spoofUserAgent(page, IOS_CHROME_UA)
    await page.goto('/')
    await expect(page.getByText('請用 Safari 開啟')).toBeVisible()

    await page.getByRole('button', { name: '關閉' }).click()
    await expect(page.getByText('請用 Safari 開啟')).not.toBeVisible()
  })

  test('PWA-6 — beforeinstallprompt event: shows native "安裝 Install" button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('義工登入 Volunteer Login')).toBeVisible()

    // Fire the browser install prompt event (useEffect is registered by now)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      ;(event as unknown as Record<string, unknown>).prompt = () => Promise.resolve()
      ;(event as unknown as Record<string, unknown>).userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })

    await expect(page.getByRole('button', { name: '安裝 Install' })).toBeVisible()
    await expect(page.getByText('安裝到主畫面 Add to Home Screen')).toBeVisible()
  })

  test('PWA-7 — appinstalled event: transitions banner to "✓ 已安裝 Installed"', async ({ page }) => {
    // Start with beforeinstallprompt so the install button is visible
    await page.goto('/')
    await expect(page.getByText('義工登入 Volunteer Login')).toBeVisible()

    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      ;(event as unknown as Record<string, unknown>).prompt = () => Promise.resolve()
      ;(event as unknown as Record<string, unknown>).userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })
    await expect(page.getByRole('button', { name: '安裝 Install' })).toBeVisible()

    // Now fire appinstalled — banner should flip to the installed confirmation
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await expect(page.getByText('✓ 已安裝 Installed')).toBeVisible()
    await expect(page.getByRole('button', { name: '安裝 Install' })).not.toBeVisible()
  })
})

test.describe('UpdatePrompt', () => {
  // This describe overrides to the authenticated storageState
  test.use({ storageState: 'e2e/fixtures/.auth.json' })

  test('PWA-8 — no update banner shown when no SW is waiting (dev mode)', async ({ page }) => {
    await mockSyncEndpoints(page)
    await gotoAndSync(page)

    // virtual:pwa-register/react returns needRefresh=false in dev mode — banner must be absent
    await expect(page.getByText('新版本可用 Update available')).not.toBeVisible()
  })
})
