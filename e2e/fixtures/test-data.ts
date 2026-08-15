/**
 * Shared test fixtures — returned by mocked sync endpoints so warmUpCache
 * populates IndexedDB exactly as it does in production.
 *
 * Meal windows are 00:00–23:59 so detectCurrentMeal() always returns meal 1
 * regardless of when the test runs.
 */

export const TODAY = new Date().toISOString().slice(0, 10)

export const TEST_TOKEN = 'test-jwt-volunteer'

export const PROFILES = [
  { id: 1, uid: 'U001', cnName: '朱大明', firstName: 'David', lastName: 'Zhu', householdId: 1 },
  { id: 2, uid: 'U002', cnName: '李小红', firstName: 'Hong', lastName: 'Li',  householdId: 2 },
]

export const MEALS = [
  { id: 1, date: TODAY, type: 2, location: 1, startTime: '00:00:00', endTime: '23:59:00' }, // Lunch, Westin, always active
  { id: 2, date: TODAY, type: 3, location: 2, startTime: '00:00:00', endTime: '23:59:00' }, // Dinner, Hilton, always active
]

export const REGISTER_MEALS = [
  { id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 2 }, // U001 ordered 2 lunches
  { id: 2, householdId: 1, mealId: 2, registerId: 1, qty: 1 }, // U001 ordered 1 dinner
  { id: 3, householdId: 2, mealId: 1, registerId: 2, qty: 1 }, // U002 ordered 1 lunch
]

export const EMPTY_SYNC = { voided: [], scans: [] }

/**
 * Meals with concrete time windows for auto-detection tests.
 * Grace periods: 30 min early, 60 min late.
 *   Lunch active window:  11:30 → 14:30
 *   Dinner active window: 17:30 → 20:30
 */
export const TIMED_MEALS = [
  { id: 1, date: TODAY, type: 2, location: 1, startTime: '12:00:00', endTime: '13:30:00' }, // Lunch, Westin
  { id: 2, date: TODAY, type: 3, location: 2, startTime: '18:00:00', endTime: '19:30:00' }, // Dinner, Hilton
]

export const TIMED_REGISTER_MEALS = [
  { id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 1 }, // U001 ordered lunch
  { id: 2, householdId: 1, mealId: 2, registerId: 1, qty: 1 }, // U001 ordered dinner
]
