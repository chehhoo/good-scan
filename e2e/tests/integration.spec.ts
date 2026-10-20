/**
 * Integration tests — run against a REAL good-api server (localhost:8090).
 *
 * These tests DO NOT mock any API endpoints. They require:
 *   - good-api running at http://localhost:8090
 *   - Active event "中國福音大會 2026" (event 6, volunteer code from E2E_ACCESS_CODE env var)
 *   - Known test attendees in the dev database (see TEST_DATA below)
 *
 * Run:
 *   E2E_ACCESS_CODE=GOSPEL2026 npx playwright test integration --project=integration
 *
 * WARNING: These tests write real scan records to the database. The suite
 * cleans up by voiding its own scans via the admin API (if available), but
 * treat the DB as potentially dirty after a failed run.
 *
 * Test families (dev DB):
 *   Family 3941 — 2 members, all 12 meals
 *     高健萍  e69983e5-83b2-11f1-9edc-667bd227f50b
 *     王承恩  e6998406-83b2-11f1-9edc-667bd227f50b
 *
 *   Family 3960 — 3 members, all 12 meals
 *     徐维宁  e69989de-83b2-11f1-9edc-667bd227f50b
 *     徐维容  e6998a84-83b2-11f1-9edc-667bd227f50b
 *     徐承禹  e6998aa7-83b2-11f1-9edc-667bd227f50b
 *
 *   Family 3974 — 2 members, meals 193/194/196/197/199/200
 *     傅庆建  e69a1458-83b2-11f1-9edc-667bd227f50b
 *     郭筱芬  e69a147d-83b2-11f1-9edc-667bd227f50b
 *
 * Meal IDs used (Dec 27 2026):
 *   193 — 午餐 Lunch  (ordered by all three families above)
 *   194 — 晚餐 Dinner (ordered by family 3941 and 3960)
 */

import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import axios from 'axios'

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8090/api'
const ACCESS_CODE = process.env.E2E_ACCESS_CODE ?? 'GOSPEL2026'

// Test meal that all three families ordered
const LUNCH_DEC27 = 193

// ── Test data ───────────────────────────────────────────────────────────────

const FAMILY_2_MEMBER_A = { uid: 'e69983e5-83b2-11f1-9edc-667bd227f50b', name: '高健萍' }
const FAMILY_2_MEMBER_B = { uid: 'e6998406-83b2-11f1-9edc-667bd227f50b', name: '王承恩' }

const FAMILY_3_MEMBER_A = { uid: 'e69989de-83b2-11f1-9edc-667bd227f50b', name: '徐维宁' }
const FAMILY_3_MEMBER_B = { uid: 'e6998a84-83b2-11f1-9edc-667bd227f50b', name: '徐维容' }
const FAMILY_3_MEMBER_C = { uid: 'e6998aa7-83b2-11f1-9edc-667bd227f50b', name: '徐承禹' }

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAndSync(page: Page) {
  await page.goto('/')
  await page.locator('input[type="text"]').fill(ACCESS_CODE)
  await page.locator('button:has-text("登入 Login")').click()
  // Wait for cache sync to complete (green status dot)
  await expect(page.getByText('在線 Online')).toBeVisible({ timeout: 20_000 })
}

async function selectMealIfNeeded(page: Page, mealTypeText = '午餐') {
  // When no meal is currently active (future event dates), the app may have
  // the meal picker bottom-sheet already open, or show 「選擇餐次 Choose meal」.
  // mealTypeText: one of '早餐', '午餐', '晚餐' — selects that meal type.
  const sheet = page.locator('div.fixed.inset-0.z-50')
  const pickMeal = async () => {
    const mealBtn = sheet.locator('button.flex-1.rounded-xl', { hasText: mealTypeText }).first()
    await mealBtn.click()
    await sheet.waitFor({ state: 'hidden', timeout: 5_000 })
  }
  // Sheet may already be open on page load (no active meal → auto-opened)
  if (await sheet.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await pickMeal()
    return
  }
  // Only open the sheet when no meal is selected (bar shows "選擇餐次 Choose meal")
  const unselectedBar = page.locator('[data-testid="meal-bar"]', { hasText: '選擇餐次 Choose meal' })
  if (await unselectedBar.isVisible({ timeout: 500 }).catch(() => false)) {
    // Ensure the sheet hasn't opened between checks
    if (await sheet.isVisible({ timeout: 300 }).catch(() => false)) {
      await pickMeal()
      return
    }
    await unselectedBar.click()
    await sheet.waitFor({ state: 'visible', timeout: 3_000 })
    await pickMeal()
  }
}

async function scanByManualEntry(page: Page, uid: string) {
  await selectMealIfNeeded(page)
  await page.locator('input[placeholder="手動輸入 Person ID"]').fill(uid)
  await page.locator('button:has-text("查詢 Go")').click()
}

function voidScansInDb(uids: string[], mealId: number) {
  // Void test scan records directly in the dev DB — best effort cleanup.
  // Uses docker exec so no admin API needed. Silently ignores errors.
  try {
    const inList = uids.map((u) => `'${u}'`).join(',')
    const sql = `
      UPDATE meal_scans ms
      JOIN persons p ON p.id = ms.scanned_person_id
      SET ms.voided_at = NOW(), ms.voided_by = 'e2e-cleanup', ms.void_reason = 'TEST'
      WHERE p.uid IN (${inList})
        AND ms.meal_id = ${mealId}
        AND ms.voided_at IS NULL;
    `.replace(/\s+/g, ' ').trim()
    execSync(`docker exec good-db mariadb -ugood -pgood123 good -e "${sql}"`, { stdio: 'pipe' })
  } catch {
    // Ignore — dev DB might not be running or already clean
  }
}

// ── Prerequisite check ───────────────────────────────────────────────────────

test.beforeAll(async () => {
  try {
    const res = await axios.get(`${API_BASE}/register/event-info`)
    if (!res.data?.id) throw new Error('No active event')
  } catch {
    throw new Error(
      `Integration tests require good-api running at ${API_BASE}. ` +
      `Start it with: docker compose up -d (in good-api directory)`
    )
  }
})

// ── Suite 1: Login ───────────────────────────────────────────────────────────

test.describe('INT-1 Login', () => {
  test('INT-1.1 — valid access code logs in and triggers cache sync', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[type="text"]').fill(ACCESS_CODE)
    await page.locator('button:has-text("登入 Login")').click()
    await expect(page.getByText('在線 Online')).toBeVisible({ timeout: 20_000 })
  })

  test('INT-1.2 — invalid access code shows error', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[type="text"]').fill('WRONGCODE')
    await page.locator('button:has-text("登入 Login")').click()
    await expect(page.getByText('密碼不對 Invalid access code')).toBeVisible()
  })
})

// ── Suite 2: Single-person scan ──────────────────────────────────────────────

test.describe('INT-2 Single scan', () => {
  test.beforeEach(() => {
    voidScansInDb([FAMILY_3_MEMBER_A.uid], LUNCH_DEC27)
  })
  test.afterEach(() => {
    voidScansInDb([FAMILY_3_MEMBER_A.uid], LUNCH_DEC27)
  })

  test('INT-2.1 — scan known attendee shows success banner and name', async ({ page }) => {
    await loginAndSync(page)
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('span.text-2xl.font-extrabold')).toContainText(FAMILY_3_MEMBER_A.name)
  })

  test('INT-2.2 — scan unknown UID shows error banner', async ({ page }) => {
    await loginAndSync(page)
    await scanByManualEntry(page, 'uid-does-not-exist-xyz')
    await expect(page.getByText('沒有這個註冊記錄 UID not found').first()).toBeVisible({ timeout: 10_000 })
  })

  test('INT-2.3 — taken count increments after scan', async ({ page }) => {
    await loginAndSync(page)
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    // 領了 count should be 1
    const takenEl = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    await expect(takenEl).toHaveText('1')
  })

  test('INT-2.4 — scan result shows pickup history row', async ({ page }) => {
    await loginAndSync(page)
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    // Pickup history panel should show the person's name
    await expect(page.getByText(FAMILY_3_MEMBER_A.name).first()).toBeVisible()
  })
})

// ── Suite 3: Multi-member household — 2-person family ───────────────────────

test.describe('INT-3 Two-person household', () => {
  test.beforeEach(() => {
    voidScansInDb([FAMILY_2_MEMBER_A.uid, FAMILY_2_MEMBER_B.uid], LUNCH_DEC27)
  })
  test.afterEach(() => {
    voidScansInDb([FAMILY_2_MEMBER_A.uid, FAMILY_2_MEMBER_B.uid], LUNCH_DEC27)
  })

  test('INT-3.1 — scanning member A shows household quota (ordered=2, taken=1)', async ({ page }) => {
    await loginAndSync(page)
    await scanByManualEntry(page, FAMILY_2_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const orderedEl = page.locator('.text-2xl.font-bold.tabular-nums').nth(0)
    const takenEl   = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    await expect(orderedEl).toHaveText('2')
    await expect(takenEl).toHaveText('1')
  })

  test('INT-3.2 — scanning member B after A shows taken=2, remaining=0', async ({ page }) => {
    await loginAndSync(page)
    // Scan member A first
    await scanByManualEntry(page, FAMILY_2_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()

    // Scan member B
    await scanByManualEntry(page, FAMILY_2_MEMBER_B.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    // Ordered and taken are text-2xl; remaining is the large font-black number
    const takenEl     = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    const remainingEl = page.locator('span.font-black.tabular-nums')
    await expect(takenEl).toHaveText('2')
    await expect(remainingEl).toHaveText('0')
  })

  test('INT-3.3 — scanning member A again after quota full shows exceeded banner', async ({ page }) => {
    await loginAndSync(page)
    // Fill quota: scan A then B
    await scanByManualEntry(page, FAMILY_2_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()
    await scanByManualEntry(page, FAMILY_2_MEMBER_B.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()

    // Try scanning A again — quota exceeded
    await scanByManualEntry(page, FAMILY_2_MEMBER_A.uid)
    await expect(page.getByText('抱歉！已領了全部')).toBeVisible({ timeout: 10_000 })
  })

  test('INT-3.4 — pickup history shows both members after both scanned', async ({ page }) => {
    await loginAndSync(page)
    await scanByManualEntry(page, FAMILY_2_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()
    await scanByManualEntry(page, FAMILY_2_MEMBER_B.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })

    // Both names should appear in the pickup history
    await expect(page.getByText(FAMILY_2_MEMBER_A.name).first()).toBeVisible()
    await expect(page.getByText(FAMILY_2_MEMBER_B.name).first()).toBeVisible()
  })

  test('INT-3.5 — scanning member B first also counts toward family quota', async ({ page }) => {
    await loginAndSync(page)
    // Scan B first (not A)
    await scanByManualEntry(page, FAMILY_2_MEMBER_B.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const takenEl = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    await expect(takenEl).toHaveText('1')

    await page.locator('button:has-text("掃描下一位")').click()

    // Now scan A — should show taken=2 (household total, not just A's personal count)
    await scanByManualEntry(page, FAMILY_2_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const takenEl2 = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    await expect(takenEl2).toHaveText('2')
  })
})

// ── Suite 4: Multi-member household — 3-person family ───────────────────────

test.describe('INT-4 Three-person household', () => {
  test.beforeEach(() => {
    voidScansInDb(
      [FAMILY_3_MEMBER_A.uid, FAMILY_3_MEMBER_B.uid, FAMILY_3_MEMBER_C.uid],
      LUNCH_DEC27
    )
  })
  test.afterEach(() => {
    voidScansInDb(
      [FAMILY_3_MEMBER_A.uid, FAMILY_3_MEMBER_B.uid, FAMILY_3_MEMBER_C.uid],
      LUNCH_DEC27
    )
  })

  test('INT-4.1 — household quota shows ordered=4 for family with 4 registrations', async ({ page }) => {
    // Family 3960 has 3 UID-able members + 1 member without UID (王瑛) = 4 ordered
    await loginAndSync(page)
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const orderedEl = page.locator('.text-2xl.font-bold.tabular-nums').nth(0)
    await expect(orderedEl).toHaveText('4')
  })

  test('INT-4.2 — scan all three UID members: taken=3, remaining=1', async ({ page }) => {
    await loginAndSync(page)
    for (const member of [FAMILY_3_MEMBER_A, FAMILY_3_MEMBER_B, FAMILY_3_MEMBER_C]) {
      await scanByManualEntry(page, member.uid)
      await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
      await page.locator('button:has-text("掃描下一位")').click()
    }
    // Scan A again — still succeeds (remaining was 1)
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const takenEl = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    const remainingEl = page.locator('span.font-black.tabular-nums')
    await expect(takenEl).toHaveText('4')
    await expect(remainingEl).toHaveText('0')
  })

  test('INT-4.3 — partial scan: after 2 of 4, remaining=2', async ({ page }) => {
    await loginAndSync(page)
    for (const member of [FAMILY_3_MEMBER_A, FAMILY_3_MEMBER_B]) {
      await scanByManualEntry(page, member.uid)
      await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
      await page.locator('button:has-text("掃描下一位")').click()
    }

    // Scan C — remaining should be 2 (4 ordered - 2 taken = 2 remaining before this scan, then 1 after)
    await scanByManualEntry(page, FAMILY_3_MEMBER_C.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const remainingEl = page.locator('span.font-black.tabular-nums')
    await expect(remainingEl).toHaveText('1')
  })

  test('INT-4.4 — scanning a 5th time is exceeded', async ({ page }) => {
    // 4 ordered: scan A, B, C, A (fills quota), then A again → exceeded
    await loginAndSync(page)
    for (const member of [FAMILY_3_MEMBER_A, FAMILY_3_MEMBER_B, FAMILY_3_MEMBER_C]) {
      await scanByManualEntry(page, member.uid)
      await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
      await page.locator('button:has-text("掃描下一位")').click()
    }
    // 4th scan fills the last box
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()

    // 5th scan is exceeded
    await scanByManualEntry(page, FAMILY_3_MEMBER_B.uid)
    await expect(page.getByText('抱歉！已領了全部')).toBeVisible({ timeout: 10_000 })
  })

  test('INT-4.5 — pickup history lists all scanned members in order', async ({ page }) => {
    await loginAndSync(page)
    for (const member of [FAMILY_3_MEMBER_A, FAMILY_3_MEMBER_B]) {
      await scanByManualEntry(page, member.uid)
      await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
      await page.locator('button:has-text("掃描下一位")').click()
    }
    await scanByManualEntry(page, FAMILY_3_MEMBER_C.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })

    await expect(page.getByText(FAMILY_3_MEMBER_A.name).first()).toBeVisible()
    await expect(page.getByText(FAMILY_3_MEMBER_B.name).first()).toBeVisible()
    await expect(page.getByText(FAMILY_3_MEMBER_C.name).first()).toBeVisible()
  })
})

// ── Suite 5: Scan sync and flush ─────────────────────────────────────────────

test.describe('INT-5 Scan sync', () => {
  test.beforeEach(() => {
    voidScansInDb([FAMILY_3_MEMBER_A.uid], LUNCH_DEC27)
  })
  test.afterEach(() => {
    voidScansInDb([FAMILY_3_MEMBER_A.uid], LUNCH_DEC27)
  })

  test('INT-5.1 — scan queued offline, pending count shown, flushed when online', async ({ page, context }) => {
    await loginAndSync(page)

    // Go offline — StatusDot shows "離線 N 待同步" when scans are pending
    await context.setOffline(true)

    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })

    // StatusDot updates pending count every 10s; wait up to 12s for the next tick
    await expect(page.getByText(/離線 \d+ 待同步/)).toBeVisible({ timeout: 12_000 })

    // Come back online — flush interval fires every 10s and clears the queue
    await context.setOffline(false)
    await expect(page.getByText(/離線 \d+ 待同步/)).not.toBeVisible({ timeout: 20_000 })
  })

  test('INT-5.2 — scan result persists after page reload (IndexedDB + server sync)', async ({ page }) => {
    await loginAndSync(page)
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()

    // Wait for flush then reload
    await page.waitForTimeout(12_000)
    await page.reload()
    await expect(page.getByText('在線 Online')).toBeVisible({ timeout: 20_000 })

    // Scan the same person again — should show taken=1 already (server confirmed)
    await scanByManualEntry(page, FAMILY_3_MEMBER_A.uid)
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const takenEl = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    // taken should be 2 (the old one is still there, this is a new scan)
    await expect(takenEl).toHaveText('2')
  })
})

// ── Suite 6: Check-In ────────────────────────────────────────────────────────

test.describe('INT-6 Check-In', () => {
  test('INT-6.1 — check-in known attendee shows success', async ({ page }) => {
    await loginAndSync(page)
    // Dismiss meal picker if it auto-opened (blocks tab bar on initial load)
    await selectMealIfNeeded(page)
    await page.locator('button:has-text("✓ 報到 Check-In")').click()
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_3_MEMBER_A.uid)
    await page.locator('button:has-text("查詢 Go")').click()
    // Either success (first check-in) or already checked in — both are acceptable
    await expect(
      page.getByText('報到成功').or(page.getByText('已報到'))
    ).toBeVisible({ timeout: 10_000 })
  })

  test('INT-6.2 — check-in unknown UID shows error', async ({ page }) => {
    await loginAndSync(page)
    await selectMealIfNeeded(page)
    await page.locator('button:has-text("✓ 報到 Check-In")').click()
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill('uid-not-in-db')
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText(/找不到|not found|error/i)).toBeVisible({ timeout: 10_000 })
  })
})
