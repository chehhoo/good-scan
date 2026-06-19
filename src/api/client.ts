import axios from 'axios'
import type { CachedProfile, CachedMeal, CachedRegisterMeal } from '../db/localDb'

const api = axios.create({ baseURL: '/api' })

// Attach JWT if present (set after volunteer login)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Types ──────────────────────────────────────────────────────────────────

export interface PickUpRecord {
  personId: number
  pickUpDate: string | null
  name: string
  locationId: number
}

export interface MealPlan {
  mealId: number
  mealOrdered: number
  mealTaken: number
  mealRemaining: number
  description: string
  locationId: number
  pickUpRecord: PickUpRecord[]
}

export interface ScanRequest {
  uid: string
  mealId: number
  scannedAt: string
}

export interface ScanResponse {
  mealId: number
  mealOrdered: number
  mealTaken: number
  mealRemaining: number
  mealStatus: number   // 0 = success, 1 = quota exceeded
  mealCount: number
  householdId: number
  pickUpRecord: PickUpRecord[]
  mealPlans: MealPlan[]
}

export interface StatusResponse {
  householdId: number
  mealPlans: MealPlan[]
}

export interface Venue {
  id: number
  name: string
}

export interface Meal {
  id: number
  name: string
  date: string
  startTime: string
  endTime: string
  type: number
  location: number
  price: number
}

export interface ActiveEvent {
  id: number
  name: string
  nameEng: string | null
}

export const eventApi = {
  getActive: () => api.get<ActiveEvent>('/register/event-info').then(r => r.data),
}

// ── Sync API (bulk cache population from good-api) ─────────────────────────

export const syncApi = {
  // Fetch all profiles for the current event — for IndexedDB cache
  profiles: () =>
    api.get<CachedProfile[]>('/scan/sync/profiles'),

  // Fetch all meals for the current event
  meals: () =>
    api.get<CachedMeal[]>('/scan/sync/meals'),

  // Fetch all register-meal mappings (household → meal orders)
  registerMeals: () =>
    api.get<CachedRegisterMeal[]>('/scan/sync/register-meals'),

  // Flush a batch of queued scans to good-api
  flushScans: (scans: ScanRequest[]) =>
    api.post<{ accepted: number[] }>('/scan/sync/flush', scans),
}

// ── Scan / lookup API ──────────────────────────────────────────────────────

export const scanApi = {
  scan: (uid: string, mealId: number) =>
    api.post<ScanResponse>('/meal/scan', { id: uid, mealId }),

  statusByUid: (uid: string) =>
    api.get<StatusResponse>(`/meal/status/${uid}`),

  venues: () =>
    api.get<Venue[]>('/meal/venues'),

  mealInfo: (locationId: number) =>
    api.get<{ meals: Meal[] }>(`/meal/info/${locationId}`),

  mealCount: (mealId: number) =>
    api.get<{ mealId: number; count: number }>(`/meal/count/${mealId}`),
}
