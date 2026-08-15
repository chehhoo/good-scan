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

async function scanU001(page: ReturnType<typeof test['info']> extends never ? never : Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.locator('input[placeholder="手动输入 Person ID"]').fill('U001')
  await page.locator('button:has-text("查询 Go")').click()
  await expect(page.getByText('成功！请拿饭盒')).toBeVisible()
}

test.describe('Meal auto-detection', () => {
  test('3.1 — inside active lunch window → lunch selected', async ({ page }) => {
    await mockCurrentTime(page, '12:30')
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expect(page.getByText('午餐 Lunch')).toBeVisible()
  })

  test('3.2 — 29 min before lunch start (within 30 min early grace) → lunch selected', async ({ page }) => {
    await mockCurrentTime(page, '11:31') // 29 min before 12:00
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expect(page.getByText('午餐 Lunch')).toBeVisible()
  })

  test('3.3 — 55 min after lunch end (within 60 min late grace) → lunch still selected', async ({ page }) => {
    await mockCurrentTime(page, '14:25') // 55 min after 13:30
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expect(page.getByText('午餐 Lunch')).toBeVisible()
  })

  test('3.4 — before any meal window, no grace → next upcoming (lunch) selected', async ({ page }) => {
    await mockCurrentTime(page, '10:00') // before 11:30 grace window
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    await scanU001(page)
    await expect(page.getByText('午餐 Lunch')).toBeVisible()
  })

  test('3.5 — manual dropdown override → selected meal respected, not auto-detected', async ({ page }) => {
    await mockCurrentTime(page, '12:30') // lunch would be auto-detected
    await mockSyncEndpoints(page, OPTS)
    await gotoAndSync(page)

    // Manually select Dinner from the dropdown (selectOption requires string, not regex)
    const dinnerOption = await page.locator('select option', { hasText: '晚餐 Dinner' }).getAttribute('value')
    await page.locator('select').selectOption(dinnerOption!)

    await scanU001(page)
    // Should show Dinner, not the auto-detected Lunch
    await expect(page.getByText('晚餐 Dinner')).toBeVisible()
  })
})
