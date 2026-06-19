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

export interface ScanRequest {
  uid: string
  mealId: number
  scannedAt: string
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
  profiles: () =>
    api.get<CachedProfile[]>('/scan/sync/profiles'),

  meals: () =>
    api.get<CachedMeal[]>('/scan/sync/meals'),

  registerMeals: () =>
    api.get<CachedRegisterMeal[]>('/scan/sync/register-meals'),

  flushScans: (scans: ScanRequest[]) =>
    api.post<{ accepted: number[] }>('/scan/sync/flush', scans),
}

// ── Scan / lookup API ──────────────────────────────────────────────────────

export const scanApi = {
  scan: (uid: string, mealId: number) =>
    api.post<void>('/meal/scan', { id: uid, mealId }),

  venues: () =>
    api.get<Venue[]>('/meal/venues'),

  mealInfo: (locationId: number) =>
    api.get<{ meals: Meal[] }>(`/meal/info/${locationId}`),

  mealCount: (mealId: number) =>
    api.get<{ mealId: number; count: number }>(`/meal/count/${mealId}`),
}
