/**
 * Unit tests for lookupByUid and quota enforcement logic.
 *
 * Uses fake-indexeddb to run Dexie entirely in Node — no browser needed.
 * Each test rebuilds the database from scratch via beforeEach so tests
 * are fully isolated from one another.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { lookupByUid, queueScan, markSynced, db } from './localDb'

// Re-open the DB fresh for every test
beforeEach(async () => {
  await db.delete()
  await db.open()
})

// ── Fixtures ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

const PROFILE_ALICE = { id: 1, uid: 'U001', cnName: '朱大明', firstName: 'Alice', lastName: 'Zhu', householdId: 1 }
const PROFILE_BOB   = { id: 2, uid: 'U002', cnName: '朱小明', firstName: 'Bob',   lastName: 'Zhu', householdId: 1 } // same household
const PROFILE_CAROL = { id: 3, uid: 'U003', cnName: '李小紅', firstName: 'Carol', lastName: 'Li',  householdId: 2 }

const MEAL_LUNCH  = { id: 1, uid: 'm1', name: 'Lunch',  date: TODAY, startTime: '12:00:00', endTime: '13:30:00', type: 2, location: 1, price: 0 }
const MEAL_DINNER = { id: 2, uid: 'm2', name: 'Dinner', date: TODAY, startTime: '18:00:00', endTime: '19:30:00', type: 3, location: 2, price: 0 }

async function seed({
  profiles = [PROFILE_ALICE],
  meals = [MEAL_LUNCH],
  registerMeals = [] as { id: number; householdId: number; mealId: number; registerId: number; qty: number }[],
} = {}) {
  await db.profiles.bulkAdd(profiles)
  await db.meals.bulkAdd(meals)
  await db.registerMeals.bulkAdd(registerMeals)
}

// ── lookupByUid ──────────────────────────────────────────────────────────────

describe('lookupByUid', () => {
  it('returns null for an unknown UID', async () => {
    await seed()
    expect(await lookupByUid('UNKNOWN')).toBeNull()
  })

  it('resolves a numeric string ID to a profile', async () => {
    await seed()
    const result = await lookupByUid('1') // numeric id of PROFILE_ALICE
    expect(result?.profile.uid).toBe('U001')
  })

  it('returns empty meals and zero counts when no meal orders exist', async () => {
    await seed({ registerMeals: [] })
    const result = await lookupByUid('U001')
    expect(result).not.toBeNull()
    expect(result!.meals).toHaveLength(0)
    expect(result!.registerMeals).toHaveLength(0)
  })

  it('returns correct ordered count for a single-person household', async () => {
    await seed({
      registerMeals: [{ id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 2 }],
    })
    const result = await lookupByUid('U001')
    expect(result!.registerMeals[0].qty).toBe(2)
    expect(result!.takenCounts[1]).toBe(0) // nothing scanned yet
  })

  it('counts taken meals from scanQueue for the scanned person', async () => {
    await seed({
      registerMeals: [{ id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 2 }],
    })
    await db.scanQueue.add({ uid: 'U001', mealId: 1, scannedAt: new Date().toISOString(), synced: true, clientScanId: 'c1' })
    const result = await lookupByUid('U001')
    expect(result!.takenCounts[1]).toBe(1)
  })

  it('counts taken meals across all household members (not just the scanned person)', async () => {
    // Both Alice and Bob are in household 1; quota is 2 lunches shared
    await seed({
      profiles: [PROFILE_ALICE, PROFILE_BOB],
      registerMeals: [{ id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 2 }],
    })
    // Bob already picked up 1 lunch
    await db.scanQueue.add({ uid: 'U002', mealId: 1, scannedAt: new Date().toISOString(), synced: true, clientScanId: 'c2' })
    // Now Alice scans — lookup should show taken=1 (Bob's), not 0
    const result = await lookupByUid('U001')
    expect(result!.takenCounts[1]).toBe(1)
  })

  it('quota: single-box household correctly shows remaining=0 after one pickup', async () => {
    await seed({
      registerMeals: [{ id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 1 }],
    })
    await db.scanQueue.add({ uid: 'U001', mealId: 1, scannedAt: new Date().toISOString(), synced: true, clientScanId: 'c3' })
    const result = await lookupByUid('U001')
    const ordered = result!.registerMeals[0].qty
    const taken   = result!.takenCounts[1]
    expect(ordered - taken).toBe(0) // quota exhausted
  })

  it('quota: family of two with one box each — cross-household scan tally', async () => {
    // Household 1 has 2 members (Alice + Bob), each ordered 1 dinner independently
    await seed({
      profiles: [PROFILE_ALICE, PROFILE_BOB],
      meals: [MEAL_DINNER],
      registerMeals: [
        { id: 1, householdId: 1, mealId: 2, registerId: 1, qty: 2 }, // 2 dinners for household
      ],
    })
    // Alice picks up her dinner
    await db.scanQueue.add({ uid: 'U001', mealId: 2, scannedAt: new Date().toISOString(), synced: true, clientScanId: 'c4' })
    // Bob scans — should see taken=1, remaining=1
    const result = await lookupByUid('U002')
    expect(result!.takenCounts[2]).toBe(1)
    const rm = result!.registerMeals.find((r) => r.mealId === 2)!
    expect(rm.qty - result!.takenCounts[2]).toBe(1)
  })

  it('refused scans are excluded from taken count', async () => {
    await seed({
      registerMeals: [{ id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 1 }],
    })
    // A refused scan must NOT reduce remaining quota
    await db.scanQueue.add({ uid: 'U001', mealId: 1, scannedAt: new Date().toISOString(), synced: false, clientScanId: 'c5', refused: 'Quota exceeded' })
    const result = await lookupByUid('U001')
    expect(result!.takenCounts[1]).toBe(0) // refused doesn't count
  })

  it('unsynced (pending) scan IS counted in taken (optimistic local display)', async () => {
    await seed({
      registerMeals: [{ id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 2 }],
    })
    // Scan queued but not yet flushed to server
    await db.scanQueue.add({ uid: 'U001', mealId: 1, scannedAt: new Date().toISOString(), synced: false, clientScanId: 'c6' })
    const result = await lookupByUid('U001')
    expect(result!.takenCounts[1]).toBe(1)
  })

  it('returns pickup records with correct name and timestamp', async () => {
    await seed({
      registerMeals: [{ id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 2 }],
    })
    const ts = new Date().toISOString()
    await db.scanQueue.add({ uid: 'U001', mealId: 1, scannedAt: ts, synced: true, clientScanId: 'c7' })
    const result = await lookupByUid('U001')
    const pickups = result!.pickupsByMeal[1]
    expect(pickups).toHaveLength(1)
    expect(pickups[0].name).toBe('朱大明')
    expect(pickups[0].scannedAt).toBe(ts)
  })

  it('isolates different households — carol cannot see alice scans', async () => {
    await seed({
      profiles: [PROFILE_ALICE, PROFILE_CAROL],
      registerMeals: [
        { id: 1, householdId: 1, mealId: 1, registerId: 1, qty: 1 },
        { id: 2, householdId: 2, mealId: 1, registerId: 2, qty: 1 },
      ],
    })
    // Alice scans
    await db.scanQueue.add({ uid: 'U001', mealId: 1, scannedAt: new Date().toISOString(), synced: true, clientScanId: 'c8' })
    // Carol's lookup should show taken=0 (her household hasn't scanned)
    const result = await lookupByUid('U003')
    expect(result!.takenCounts[1]).toBe(0)
  })
})

// ── queueScan / markSynced ───────────────────────────────────────────────────

describe('queueScan', () => {
  it('writes a row with synced=false and a clientScanId', async () => {
    const { id, clientScanId } = await queueScan('U001', 1)
    const row = await db.scanQueue.get(id)
    expect(row?.synced).toBe(false)
    expect(row?.clientScanId).toMatch(/^[0-9a-f-]{36}$/)
    expect(clientScanId).toBe(row?.clientScanId)
  })

  it('markSynced flips synced to true', async () => {
    const { id } = await queueScan('U001', 1)
    await markSynced(id)
    const row = await db.scanQueue.get(id)
    expect(row?.synced).toBe(true)
  })

  it('two rapid scans for same uid+meal produce distinct clientScanIds', async () => {
    const a = await queueScan('U001', 1)
    const b = await queueScan('U001', 1)
    expect(a.clientScanId).not.toBe(b.clientScanId)
  })
})
