import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

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

// ── API calls ──────────────────────────────────────────────────────────────

export const scanApi = {
  scan: (uid: string, mealId?: number) =>
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
