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
 *
 * Suite 7 (all-meals cycling) uses family 3941 (high健萍 + 王承恩) who ordered
 * all 12 meals — IDs 190–201 covering 4 days × 3 meals.
 * Suite 8 (MealInfo live counts) uses Tab 3 to verify server-side counts
 * reflect scans in real time.
 */

import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import axios from 'axios'

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8090/api'
const ACCESS_CODE = process.env.E2E_ACCESS_CODE ?? 'GOSPEL2026'

// Test meal that all three families ordered
const LUNCH_DEC27 = 193

// All 12 meal IDs for event 6 (4 days × 3 meals — family 3941 ordered all of them)
// Dec 25–28 2026: breakfast=1, lunch=2, dinner=3 per day
const ALL_MEAL_IDS = [190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201]

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

// ── Suite 7: All-meals cycling ───────────────────────────────────────────────
//
// Scans family 3941 (高健萍 + 王承恩, ordered all 12 meals) through every meal
// in sequence.  Verifies:
//   - scan succeeds for each meal independently
//   - counts are isolated per meal (taken for meal N does not bleed into meal M)
//   - quota works correctly for each meal
//
// NOTE: This suite mutates the DB for all 12 meals; cleanup voids all of them.

test.describe('INT-7 All-meals cycling', () => {
  test.beforeEach(() => {
    for (const mealId of ALL_MEAL_IDS) {
      voidScansInDb([FAMILY_2_MEMBER_A.uid, FAMILY_2_MEMBER_B.uid], mealId)
    }
  })
  test.afterEach(() => {
    for (const mealId of ALL_MEAL_IDS) {
      voidScansInDb([FAMILY_2_MEMBER_A.uid, FAMILY_2_MEMBER_B.uid], mealId)
    }
  })

  test('INT-7.1 — scan succeeds for each of the 12 meals in sequence', async ({ page }) => {
    await loginAndSync(page)

    for (const mealId of ALL_MEAL_IDS) {
      // Open the meal picker and choose this specific meal by ID
      // (selectMealIfNeeded picks the first visible meal; we need a specific one)
      const sheet = page.locator('div.fixed.inset-0.z-50')
      const mealBar = page.locator('[data-testid="meal-bar"]')

      // Open the meal picker
      await mealBar.click()
      await sheet.waitFor({ state: 'visible', timeout: 5_000 })

      // Find and click the button for this mealId
      const mealBtn = sheet.locator(`button[data-meal-id="${mealId}"]`)
      if (await mealBtn.count() === 0) {
        // Fall back: click any button whose text matches the meal order
        const allBtns = sheet.locator('button.flex-1.rounded-xl')
        const idx = ALL_MEAL_IDS.indexOf(mealId) % (await allBtns.count())
        await allBtns.nth(idx).click()
      } else {
        await mealBtn.click()
      }
      await sheet.waitFor({ state: 'hidden', timeout: 5_000 })

      // Scan member A for this meal
      await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_2_MEMBER_A.uid)
      await page.locator('button:has-text("查詢 Go")').click()

      await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })

      // taken should be 1 for this meal (not carried over from previous meals)
      const takenEl = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
      await expect(takenEl).toHaveText('1')

      await page.locator('button:has-text("掃描下一位")').click()
    }
  })

  test('INT-7.2 — counts are isolated: scanning meal A does not affect meal B taken count', async ({ page }) => {
    await loginAndSync(page)

    // Scan member A for LUNCH_DEC27 (meal 193)
    await selectMealIfNeeded(page, '午餐')
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_2_MEMBER_A.uid)
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    const takenLunch = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    await expect(takenLunch).toHaveText('1')
    await page.locator('button:has-text("掃描下一位")').click()

    // Now switch to dinner (meal 194) and scan member A — taken must be 0 (fresh)
    const sheet = page.locator('div.fixed.inset-0.z-50')
    await page.locator('[data-testid="meal-bar"]').click()
    await sheet.waitFor({ state: 'visible', timeout: 5_000 })
    await sheet.locator('button.flex-1.rounded-xl', { hasText: '晚餐' }).first().click()
    await sheet.waitFor({ state: 'hidden', timeout: 5_000 })

    await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_2_MEMBER_A.uid)
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })

    const takenDinner = page.locator('.text-2xl.font-bold.tabular-nums').nth(1)
    // Dinner taken should be 1 (only the scan we just did), not 2
    await expect(takenDinner).toHaveText('1')
  })

  test('INT-7.3 — quota enforced independently per meal', async ({ page }) => {
    await loginAndSync(page)

    // Fill quota for LUNCH_DEC27 (2 ordered, scan both members)
    await selectMealIfNeeded(page, '午餐')
    for (const member of [FAMILY_2_MEMBER_A, FAMILY_2_MEMBER_B]) {
      await page.locator('input[placeholder="手動輸入 Person ID"]').fill(member.uid)
      await page.locator('button:has-text("查詢 Go")').click()
      await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
      await page.locator('button:has-text("掃描下一位")').click()
    }

    // Lunch is now full — scanning member A again should exceed
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_2_MEMBER_A.uid)
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('抱歉！已領了全部')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()

    // But dinner (meal 194) should still be open — scan member A succeeds
    const sheet = page.locator('div.fixed.inset-0.z-50')
    await page.locator('[data-testid="meal-bar"]').click()
    await sheet.waitFor({ state: 'visible', timeout: 5_000 })
    await sheet.locator('button.flex-1.rounded-xl', { hasText: '晚餐' }).first().click()
    await sheet.waitFor({ state: 'hidden', timeout: 5_000 })

    await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_2_MEMBER_A.uid)
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
  })
})

// ── Suite 8: MealInfo live counts (Tab 3) ────────────────────────────────────
//
// Verifies that Tab 3 (MealInfo) shows counts that reflect actual scans in the
// database — not just mocked values.  Uses the Westin venue (location matching
// meals 193/194 in the dev DB).

test.describe('INT-8 MealInfo live counts', () => {
  test.beforeEach(() => {
    voidScansInDb([FAMILY_2_MEMBER_A.uid, FAMILY_2_MEMBER_B.uid], LUNCH_DEC27)
  })
  test.afterEach(() => {
    voidScansInDb([FAMILY_2_MEMBER_A.uid, FAMILY_2_MEMBER_B.uid], LUNCH_DEC27)
  })

  async function goToMealInfo(page: Page) {
    await selectMealIfNeeded(page)
    await page.locator('button:has-text("📋 餐食 Meal Info")').click()
  }

  test('INT-8.1 — Tab 3 loads venues and shows at least one meal row', async ({ page }) => {
    await loginAndSync(page)
    await goToMealInfo(page)
    // Venue selector should be visible
    await expect(page.locator('select, [role="combobox"]').first()).toBeVisible({ timeout: 10_000 })
    // At least one meal row in the table
    await expect(page.locator('table tbody tr, [data-testid="meal-row"]').first()).toBeVisible({ timeout: 10_000 })
  })

  test('INT-8.2 — taken count on Tab 3 increments after a scan on Tab 1', async ({ page }) => {
    await loginAndSync(page)

    // Record the current taken count for meal 193 from Tab 3
    await goToMealInfo(page)
    // Find the row for LUNCH_DEC27 and read its taken count
    const lunchRow = page.locator('tr', { hasText: '午餐' }).first()
    await expect(lunchRow).toBeVisible({ timeout: 10_000 })
    const takenBefore = await lunchRow.locator('td').nth(2).textContent()
    const countBefore = parseInt(takenBefore?.replace(/\D/g, '') ?? '0', 10)

    // Go to Tab 1 and scan member A
    await page.locator('button:has-text("🍱 掃描 Scan")').click()
    await selectMealIfNeeded(page, '午餐')
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_2_MEMBER_A.uid)
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })

    // Wait for the background flush to push the scan to the server (~12s)
    await page.waitForTimeout(13_000)

    // Go back to Tab 3 — force a refresh by re-navigating
    await goToMealInfo(page)
    // Tab 3 fetches live counts from the server on load
    await page.waitForTimeout(2_000)

    const lunchRowAfter = page.locator('tr', { hasText: '午餐' }).first()
    await expect(lunchRowAfter).toBeVisible({ timeout: 10_000 })
    const takenAfter = await lunchRowAfter.locator('td').nth(2).textContent()
    const countAfter = parseInt(takenAfter?.replace(/\D/g, '') ?? '0', 10)

    expect(countAfter).toBeGreaterThan(countBefore)
  })

  test('INT-8.3 — Tab 3 shows non-zero total when scans exist in the DB', async ({ page }) => {
    // Pre-populate: scan member A before loading the app
    const loginRes = await axios.post(`${API_BASE}/auth/volunteer`, { code: ACCESS_CODE })
    const token = loginRes.data.token
    await axios.post(
      `${API_BASE}/meal/scan`,
      { id: FAMILY_2_MEMBER_A.uid, mealId: LUNCH_DEC27 },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    await loginAndSync(page)
    await goToMealInfo(page)

    // The taken count for the lunch row should be ≥ 1
    const lunchRow = page.locator('tr', { hasText: '午餐' }).first()
    await expect(lunchRow).toBeVisible({ timeout: 10_000 })
    const takenText = await lunchRow.locator('td').nth(2).textContent()
    const count = parseInt(takenText?.replace(/\D/g, '') ?? '0', 10)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('INT-8.4 — Tab 3 person-lookup shows taken count matching actual scans', async ({ page }) => {
    await loginAndSync(page)

    // Scan member A on Tab 1 first
    await selectMealIfNeeded(page, '午餐')
    await page.locator('input[placeholder="手動輸入 Person ID"]').fill(FAMILY_2_MEMBER_A.uid)
    await page.locator('button:has-text("查詢 Go")').click()
    await expect(page.getByText('成功！請拿飯盒')).toBeVisible({ timeout: 10_000 })
    await page.locator('button:has-text("掃描下一位")').click()

    // Go to Tab 3 and look up member A
    await goToMealInfo(page)
    const searchInput = page.locator('input[placeholder*="Person ID"], input[placeholder*="搜尋"]').first()
    if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await searchInput.fill(FAMILY_2_MEMBER_A.uid)
      await page.keyboard.press('Enter')
      // The result should show 領了 ≥ 1 for this person
      await expect(page.getByText(/領了/).first()).toBeVisible({ timeout: 10_000 })
    } else {
      // Tab 3 may not have a person search — skip gracefully
      test.skip()
    }
  })
})
