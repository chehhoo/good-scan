import Dexie, { type Table } from 'dexie'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CachedProfile {
  id: number
  uid: string
  householdId: number
  cnName: string
  firstName: string
  lastName: string
  rpId?: number
  checkinTime?: string | null  // ISO string if checked in, null if not
}

export interface CachedMeal {
  id: number
  uid: string
  name: string
  date: string
  startTime: string
  endTime: string
  type: number     // 1=Breakfast 2=Lunch 3=Dinner
  location: number // 1=Westin 2=Hilton
  price: number
}

export interface CachedRegisterMeal {
  id: number
  registerId: number
  householdId: number
  mealId: number
  qty: number
}

export interface ScanQueueItem {
  id?: number           // auto-increment
  uid: string           // scanned badge UID
  mealId: number
  scannedAt: string     // ISO timestamp
  synced: boolean       // false = pending flush to good-api
  syncError?: string    // last error if sync failed
}

// ── Database ───────────────────────────────────────────────────────────────

class GoodScanDb extends Dexie {
  profiles!: Table<CachedProfile>
  meals!: Table<CachedMeal>
  registerMeals!: Table<CachedRegisterMeal>
  scanQueue!: Table<ScanQueueItem>

  constructor() {
    super('good-scan')
    this.version(1).stores({
      profiles:      'id, uid, householdId',
      meals:         'id, uid, date, location',
      registerMeals: 'id, householdId, mealId, registerId',
      scanQueue:     '++id, uid, mealId, [uid+mealId], synced, scannedAt',
    })
  }
}

export const db = new GoodScanDb()

// ── Helpers ────────────────────────────────────────────────────────────────

export async function lookupByUid(uid: string) {
  let profile = await db.profiles.where('uid').equals(uid).first()
  // Fallback: uid may be a numeric person ID entered manually
  if (!profile) {
    const numId = Number(uid)
    if (Number.isInteger(numId) && numId > 0) {
      profile = await db.profiles.get(numId) ?? undefined
    }
  }
  if (!profile) return null

  const registerMeals = await db.registerMeals
    .where('householdId').equals(profile.householdId)
    .toArray()

  const mealIds = registerMeals.map((rm) => rm.mealId)
  const meals = await db.meals.where('id').anyOf(mealIds).toArray()

  // Meal entitlement (qty) is household-level, so pickups must be tallied across
  // every member of the household, not just the scanned uid — otherwise each
  // family member's own scan history looks empty and the shared quota (e.g. 2
  // dinners for a 2-person household) is never actually enforced: everyone would
  // independently see "0 of my own scans yet" and be allowed to take a box.
  const householdProfiles = await db.profiles.where('householdId').equals(profile.householdId).toArray()
  const nameByUid = new Map(householdProfiles.map((p) => [p.uid, p.cnName || `${p.firstName} ${p.lastName}`]))
  const householdUids = new Set(householdProfiles.map((p) => p.uid))

  const takenCounts: Record<number, number> = {}
  const pickupsByMeal: Record<number, { uid: string; name: string; scannedAt: string }[]> = {}
  for (const mealId of mealIds) {
    const entries = await db.scanQueue.where('mealId').equals(mealId).toArray()
    const householdEntries = entries.filter((e) => householdUids.has(e.uid))
    takenCounts[mealId] = householdEntries.length
    pickupsByMeal[mealId] = householdEntries.map((e) => ({
      uid: e.uid,
      name: nameByUid.get(e.uid) ?? e.uid,
      scannedAt: e.scannedAt,
    }))
  }

  return { profile, registerMeals, meals, takenCounts, pickupsByMeal }
}

export async function queueScan(uid: string, mealId: number): Promise<number> {
  return db.scanQueue.add({
    uid,
    mealId,
    scannedAt: new Date().toISOString(),
    synced: false,
  })
}

export async function markSynced(id: number) {
  return db.scanQueue.update(id, { synced: true })
}

export async function getPendingScans(): Promise<ScanQueueItem[]> {
  return db.scanQueue.filter((s) => s.synced === false).toArray()
}

export async function getLastSyncTime(): Promise<Date | null> {
  const all = await db.scanQueue.filter((s) => s.synced === true).toArray()
  if (all.length === 0) return null
  const latest = all.reduce((a, b) => (a.scannedAt > b.scannedAt ? a : b))
  return new Date(latest.scannedAt)
}
