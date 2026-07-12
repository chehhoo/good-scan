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
  const profile = await db.profiles.where('uid').equals(uid).first()
  if (!profile) return null

  const registerMeals = await db.registerMeals
    .where('householdId').equals(profile.householdId)
    .toArray()

  const mealIds = registerMeals.map((rm) => rm.mealId)
  const meals = await db.meals.where('id').anyOf(mealIds).toArray()

  // Count taken from local scanQueue (synced + unsynced)
  const takenCounts: Record<number, number> = {}
  for (const mealId of mealIds) {
    takenCounts[mealId] = await db.scanQueue
      .where('[uid+mealId]').equals([uid, mealId])
      .count()
  }

  return { profile, registerMeals, meals, takenCounts }
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
  return db.scanQueue.where('synced').equals(0).toArray()
}

export async function getLastSyncTime(): Promise<Date | null> {
  const latest = await db.scanQueue
    .where('synced').equals(1)
    .last()
  return latest ? new Date(latest.scannedAt) : null
}
