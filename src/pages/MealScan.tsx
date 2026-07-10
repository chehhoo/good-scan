import { useState, useCallback, useEffect, useRef } from 'react'
import QrScanner from '../components/QrScanner'
import { db, lookupByUid, queueScan, type CachedMeal, type CachedRegisterMeal } from '../db/localDb'
import { scanApi } from '../api/client'

interface PickupRecord {
  name: string
  scannedAt: string  // ISO timestamp
}

interface MealPlanRow {
  meal: CachedMeal
  rm: CachedRegisterMeal
  ordered: number
  taken: number
  pickupRecords: PickupRecord[]
}

interface ScanResult {
  name: string
  uid: string
  // For the current scanned meal
  mealId: number
  mealOrdered: number
  mealTaken: number    // after this scan
  mealRemaining: number
  status: 'ok' | 'exceeded' | 'error'
  errorMessage?: string
  // Pickup history for this meal (local scanQueue)
  trackers: PickupRecord[]
  // All household meal plans
  mealPlans: MealPlanRow[]
}

export default function MealScan() {
  const [scanning, setScanning] = useState(true)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [meals, setMeals] = useState<CachedMeal[]>([])
  const [selectedMealId, setSelectedMealId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [manualUid, setManualUid] = useState('')
  const manualInputRef = useRef<HTMLInputElement>(null)

  // Load today's meals for the selector
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    db.meals.where('date').equals(today).toArray().then((m) =>
      setMeals(m.sort((a, b) => a.type - b.type))
    )
  }, [])

  const handleScan = useCallback(async (uid: string) => {
    if (loading) return
    setScanning(false)
    setLoading(true)

    try {
      const local = await lookupByUid(uid)

      if (!local) {
        setResult({
          name: uid, uid, mealId: 0, mealOrdered: 0, mealTaken: 0, mealRemaining: 0,
          status: 'error', errorMessage: '没有这个注册记录 UID not found',
          trackers: [], mealPlans: [],
        })
        setLoading(false)
        return
      }

      const { profile, registerMeals, meals: personMeals, takenCounts } = local
      const name = profile.cnName || `${profile.firstName} ${profile.lastName}`

      const mealId = selectedMealId ?? detectCurrentMeal(personMeals)
      if (!mealId) {
        setResult({
          name, uid, mealId: 0, mealOrdered: 0, mealTaken: 0, mealRemaining: 0,
          status: 'error', errorMessage: '无当前餐 No active meal',
          trackers: [], mealPlans: [],
        })
        setLoading(false)
        return
      }

      const rm = registerMeals.find((r) => r.mealId === mealId)
      const ordered = rm?.qty ?? 0
      const taken = takenCounts[mealId] ?? 0

      // Check if no meal order exists
      if (ordered === 0) {
        setResult({
          name, uid, mealId, mealOrdered: 0, mealTaken: taken, mealRemaining: 0,
          status: 'error', errorMessage: '沒有订餐记录 No meal order',
          trackers: [], mealPlans: await buildMealPlans(registerMeals, personMeals, takenCounts, uid, name),
        })
        setLoading(false)
        return
      }

      const isExceeded = taken >= ordered
      const newTaken = isExceeded ? taken : taken + 1

      // Write to local scanQueue (even if exceeded — record the attempt)
      if (!isExceeded) {
        await queueScan(uid, mealId)
      }

      // Fire-and-forget POST to good-api
      if (navigator.onLine && !isExceeded) {
        scanApi.scan(uid, mealId).catch(() => { /* BackgroundSync handles retry */ })
      }

      // Build pickup history from local scanQueue for this uid+meal
      const queueEntries = await db.scanQueue
        .where('[uid+mealId]').equals([uid, mealId])
        .toArray()
      const trackers: PickupRecord[] = queueEntries.map((e) => ({
        name,
        scannedAt: e.scannedAt,
      }))

      setResult({
        name,
        uid,
        mealId,
        mealOrdered: ordered,
        mealTaken: newTaken,
        mealRemaining: Math.max(0, ordered - newTaken),
        status: isExceeded ? 'exceeded' : 'ok',
        trackers,
        mealPlans: await buildMealPlans(registerMeals, personMeals, takenCounts, uid, name),
      })
    } catch (e) {
      setResult({
        name: uid, uid, mealId: 0, mealOrdered: 0, mealTaken: 0, mealRemaining: 0,
        status: 'error', errorMessage: '系統问题 System error: ' + String(e),
        trackers: [], mealPlans: [],
      })
    } finally {
      setLoading(false)
    }
  }, [loading, selectedMealId])

  const submitManualUid = useCallback(() => {
    const uid = manualUid.trim()
    if (!uid) return
    setManualUid('')
    handleScan(uid)
  }, [manualUid, handleScan])

  const reset = () => {
    setResult(null)
    setScanning(true)
    setManualUid('')
    setTimeout(() => manualInputRef.current?.focus(), 100)
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Meal selector */}
      <div className="p-3 border-b border-blue-800">
        <select
          className="w-full bg-blue-900 border border-blue-700 rounded-lg px-3 py-2 text-sm"
          value={selectedMealId ?? ''}
          onChange={(e) => setSelectedMealId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">自动检测 Auto-detect meal</option>
          {meals.map((m) => (
            <option key={m.id} value={m.id}>
              {mealTypeLabel(m.type)} {m.date} {m.startTime.slice(0, 5)}–{m.endTime.slice(0, 5)}
            </option>
          ))}
        </select>
      </div>

      {/* Camera scanner */}
      {scanning && !loading && (
        <div className="flex-1 flex flex-col">
          <QrScanner onScan={handleScan} active={scanning} />
          {/* Manual UID entry */}
          <div className="p-3 border-t border-blue-800 flex gap-2">
            <input
              ref={manualInputRef}
              type="text"
              className="flex-1 bg-blue-900 border border-blue-700 rounded-lg px-3 py-2 text-sm font-mono placeholder-blue-500 focus:outline-none focus:border-blue-400"
              placeholder="手动输入 Person ID"
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitManualUid()}
            />
            <button
              onClick={submitManualUid}
              disabled={!manualUid.trim()}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 active:bg-blue-800 disabled:opacity-40 rounded-lg text-sm font-semibold transition-colors"
            >
              查询 Go
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-48 text-blue-300 text-lg animate-pulse">
          查询中 Loading…
        </div>
      )}

      {/* Scan result */}
      {result && !loading && (
        <div className="flex flex-col">
          {/* Status banner */}
          <div className={`px-4 py-3 text-center text-xl font-bold ${
            result.status === 'ok'
              ? 'bg-green-600'
              : result.status === 'exceeded'
              ? 'bg-yellow-600'
              : 'bg-red-700'
          }`}>
            {result.status === 'ok' && '✓ 成功! 请拿饭盒 MEAL SERVED'}
            {result.status === 'exceeded' && '⚠ 抱歉! 己领了全部的饭盒 QUOTA EXCEEDED'}
            {result.status === 'error' && `✗ 抱歉! ${result.errorMessage}`}
          </div>

          {/* Name */}
          <div className="px-4 pt-3 text-center text-2xl font-bold tracking-wide">
            {result.name}
          </div>

          {/* Three giant numbers + pickup list */}
          <div className="flex px-4 pt-2 gap-4">
            {/* Left: giant counts */}
            <div className="flex flex-col leading-none">
              <span className="font-black text-white" style={{ fontSize: '15vw' }}>
                订了 {result.mealOrdered}
              </span>
              <span className="font-black text-white" style={{ fontSize: '15vw' }}>
                领了 {result.mealTaken}
              </span>
              <span
                className={`font-black ${result.mealRemaining > 0 ? 'text-green-400' : 'text-gray-500'}`}
                style={{ fontSize: '15vw' }}
              >
                剩下 {result.mealRemaining}
              </span>
            </div>

            {/* Right: pickup history */}
            <div className="flex-1 flex flex-col justify-end pb-1 gap-1">
              {result.trackers.map((t, i) => (
                <div key={i} className="text-gray-400 font-bold" style={{ fontSize: '4vw' }}>
                  <span className="text-gray-500 text-xs mr-1">{prettyTime(t.scannedAt)}</span>
                  {t.name} 领了一盒
                </div>
              ))}
            </div>
          </div>

          {/* Meal plans table */}
          {result.mealPlans.length > 0 && (
            <div className="mx-4 mt-4 mb-4 rounded-xl overflow-hidden border border-blue-700">
              <table className="w-full text-sm">
                <thead className="bg-blue-800 text-blue-200 uppercase text-xs tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Location</th>
                    <th className="px-3 py-2 text-left">Meal</th>
                    <th className="px-3 py-2 text-center">订了<br/>Order</th>
                    <th className="px-3 py-2 text-center">领了<br/>Taken</th>
                    <th className="px-3 py-2 text-left">Pickup Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-800">
                  {result.mealPlans.map((row) => (
                    <tr key={row.meal.id} className="bg-blue-900/40">
                      <td className="px-3 py-2">
                        <LocationBadge locationId={row.meal.location} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{mealTypeLabel(row.meal.type)}</div>
                        <div className="text-blue-400 text-xs">{row.meal.date} {row.meal.startTime.slice(0,5)}</div>
                      </td>
                      <td className="px-3 py-2 text-center">{row.ordered} 盒</td>
                      <td className="px-3 py-2 text-center">
                        <span className={row.taken >= row.ordered ? 'text-gray-500' : 'text-white'}>
                          {row.taken} 盒
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <ul className="list-disc list-inside space-y-0.5">
                          {row.pickupRecords.map((pr, i) => (
                            <li key={i} className="text-xs text-gray-400">
                              {pr.name} <span className="text-gray-500">{prettyTime(pr.scannedAt)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Scan next button */}
          <div className="px-4 pb-6 pt-2">
            <button
              onClick={reset}
              className="w-full py-4 bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl text-lg font-bold tracking-wide transition-colors"
            >
              扫描下一位 Scan Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function LocationBadge({ locationId }: { locationId: number }) {
  if (locationId === 1)
    return (
      <span className="px-2 py-0.5 rounded text-black font-semibold text-xs" style={{ background: '#FFD400' }}>
        Westin
      </span>
    )
  if (locationId === 2)
    return (
      <span className="px-2 py-0.5 rounded font-semibold text-xs" style={{ background: '#d2b48c', color: '#000' }}>
        Hilton
      </span>
    )
  return <span className="px-2 py-0.5 rounded bg-gray-600 text-xs">Location {locationId}</span>
}

function mealTypeLabel(type: number) {
  return type === 1 ? '早餐 Breakfast' : type === 2 ? '午餐 Lunch' : '晚餐 Dinner'
}

function prettyTime(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚 just now'
  if (diffMin < 60) return `${diffMin} 分钟前`
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function detectCurrentMeal(meals: CachedMeal[]): number | undefined {
  const now = new Date()
  const hhmm = now.getHours() * 100 + now.getMinutes()
  const today = now.toISOString().slice(0, 10)
  const todayMeals = meals.filter((m) => m.date === today)
  for (const m of todayMeals) {
    const [sh, sm] = m.startTime.split(':').map(Number)
    const [eh, em] = m.endTime.split(':').map(Number)
    if (hhmm >= sh * 100 + sm && hhmm <= eh * 100 + em) return m.id
  }
  return todayMeals[0]?.id
}

async function buildMealPlans(
  registerMeals: import('../db/localDb').CachedRegisterMeal[],
  personMeals: CachedMeal[],
  takenCounts: Record<number, number>,
  uid: string,
  name: string,
): Promise<MealPlanRow[]> {
  const rows: MealPlanRow[] = []
  for (const rm of registerMeals) {
    const meal = personMeals.find((m) => m.id === rm.mealId)
    if (!meal) continue
    const taken = takenCounts[rm.mealId] ?? 0
    const queueEntries = await db.scanQueue
      .where('[uid+mealId]').equals([uid, rm.mealId])
      .toArray()
    const pickupRecords: PickupRecord[] = queueEntries.map((e) => ({
      name,
      scannedAt: e.scannedAt,
    }))
    rows.push({ meal, rm, ordered: rm.qty, taken, pickupRecords })
  }
  return rows.sort((a, b) => new Date(a.meal.date).getTime() - new Date(b.meal.date).getTime() || a.meal.type - b.meal.type)
}
