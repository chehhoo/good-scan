/**
 * Meal auto-detection tests — verifies detectCurrentMeal() picks the right meal
 * based on the current time and grace-period rules:
 *   Active window = startTime - 30min  →  endTime + 60min
 *   If nothing active, returns next upcoming meal.
 *
 * TIMED_MEALS:
 *   Meal 1 (Lunch)  12:00–13:30 — active window 11:30–14:30
 *   Meal 2 (Dinner) 18:00–19:30 — active window 17:30–20:30
 */
import { test, expect } from '@playwright/test'
import { mockSyncEndpoints, gotoAndSync, mockCurrentTime } from '../fixtures/mock-api'
import { TIMED_MEALS, TIMED_REGISTER_MEALS } from '../fixtures/test-data'

const OPTS = { meals: TIMED_MEALS, registerMeals: TIMED_REGISTER_MEALS }

type TestPage = Parameters<Parameters<typeof test>[1]>[0]['page']

async function scanU001(page: TestPage) {
  await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
  await page.locator('button:has-text("查询 Go")').click()
  await expect(page.getByText('成功！请拿饭盒')).toBeVisible()
}

// The meal label appears in a <span> with these classes, distinct from the table rows
async function expectMealLabel(page: TestPage, label: string) {
  await expect(
    page.locator('span.uppercase.tracking-widest', { hasText: label })
  ).toBeVisible()
}

test.describe('Meal auto-detection', () => {
  test('3.1 — inside active lunch window → lunch selected', async ({ page }) => {
    await mockCurrentTime(page, '12:30')
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expectMealLabel(page, '午餐 Lunch')
  })

  test('3.2 — 29 min before lunch start (within 30 min early grace) → lunch selected', async ({ page }) => {
    await mockCurrentTime(page, '11:31') // 29 min before 12:00
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expectMealLabel(page, '午餐 Lunch')
  })

  test('3.3 — 55 min after lunch end (within 60 min late grace) → lunch still selected', async ({ page }) => {
    await mockCurrentTime(page, '14:25') // 55 min after 13:30
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expectMealLabel(page, '午餐 Lunch')
  })

  test('3.4 — before any meal window, no grace → next upcoming (lunch) selected', async ({ page }) => {
    await mockCurrentTime(page, '10:00') // before 11:30 grace window
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expectMealLabel(page, '午餐 Lunch')
  })

  test('3.6 — no meal detectable → bottom sheet opens automatically', async ({ page }) => {
    await mockCurrentTime(page, '22:00') // after dinner late grace (20:30) — nothing detectable
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    // Bottom sheet should open without any user interaction
    // Target the sheet header (font-semibold white), not the pill bar placeholder (blue-400)
    await expect(page.locator('span.font-semibold.text-white', { hasText: '选择餐次 Choose meal' })).toBeVisible({ timeout: 5_000 })
    // Both meals shown as options in the sheet
    await expect(page.locator('button', { hasText: '午餐' }).first()).toBeVisible()
    await expect(page.locator('button', { hasText: '晚餐' }).first()).toBeVisible()
  })

  test('3.5 — manual override via bottom sheet → selected meal respected, not auto-detected', async ({ page }) => {
    await mockCurrentTime(page, '12:30') // lunch would be auto-detected
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    // Open the meal bottom sheet and pick Dinner
    await page.getByTestId('meal-bar').click()
    await page.locator('button', { hasText: '晚餐' }).first().click()

    await scanU001(page)
    // Should show Dinner, not the auto-detected Lunch
    await expectMealLabel(page, '晚餐 Dinner')
  })
})
