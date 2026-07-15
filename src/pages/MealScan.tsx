import { useState, useCallback, useEffect, useRef } from 'react'
import QrScanner from '../components/QrScanner'
import { db, lookupByUid, queueScan, type CachedMeal, type CachedRegisterMeal } from '../db/localDb'
import { scanApi } from '../api/client'

interface PickupRecord {
  name: string
  scannedAt: string
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
  mealId: number
  mealLabel: string
  mealOrdered: number
  mealTaken: number
  mealRemaining: number
  status: 'ok' | 'exceeded' | 'error'
  errorMessage?: string
  trackers: PickupRecord[]
  mealPlans: MealPlanRow[]
}

export default function MealScan({ manualEntryEnabled, onScan }: { manualEntryEnabled: boolean; onScan?: (uid: string) => void }) {
  const [scanning, setScanning] = useState(true)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [meals, setMeals] = useState<CachedMeal[]>([])
  const [selectedMealId, setSelectedMealId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [manualUid, setManualUid] = useState('')
  const manualInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)

  useEffect(() => {
    db.meals.orderBy('date').toArray().then((m) =>
      setMeals(m.sort((a, b) => a.date.localeCompare(b.date) || a.type - b.type))
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
          name: uid, uid, mealId: 0, mealLabel: '', mealOrdered: 0, mealTaken: 0, mealRemaining: 0,
          status: 'error', errorMessage: '没有这个注册记录 UID not found',
          trackers: [], mealPlans: [],
        })
        setLoading(false)
        return
      }

      const { profile, registerMeals, meals: personMeals, takenCounts } = local
      const name = profile.cnName || `${profile.firstName} ${profile.lastName}`
      onScan?.(uid)

      const allMeals = await db.meals.toArray()
      const mealId = selectedMealId ?? detectCurrentMeal(allMeals)
      if (!mealId) {
        setResult({
          name, uid, mealId: 0, mealLabel: '', mealOrdered: 0, mealTaken: 0, mealRemaining: 0,
          status: 'error', errorMessage: '无当前餐 No active meal',
          trackers: [], mealPlans: [],
        })
        setLoading(false)
        return
      }

      const meal = allMeals.find((m) => m.id === mealId)
      const mealLabel = meal ? mealTypeLabel(meal.type) : ''
      const rm = registerMeals.find((r) => r.mealId === mealId)
      const ordered = rm?.qty ?? 0
      const taken = takenCounts[mealId] ?? 0

      if (ordered === 0) {
        setResult({
          name, uid, mealId, mealLabel, mealOrdered: 0, mealTaken: taken, mealRemaining: 0,
          status: 'error', errorMessage: '沒有订餐记录 No meal order',
          trackers: [], mealPlans: await buildMealPlans(registerMeals, personMeals, takenCounts, uid, name),
        })
        setLoading(false)
        return
      }

      const isExceeded = taken >= ordered
      const newTaken = isExceeded ? taken : taken + 1

      if (!isExceeded) {
        await queueScan(uid, mealId)
      }

      if (navigator.onLine && !isExceeded) {
        scanApi.scan(uid, mealId).catch(() => {})
      }

      const queueEntries = await db.scanQueue
        .where('[uid+mealId]').equals([uid, mealId])
        .toArray()
      const trackers: PickupRecord[] = queueEntries.map((e) => ({ name, scannedAt: e.scannedAt }))

      const updatedTakenCounts = { ...takenCounts, [mealId]: newTaken }

      setResult({
        name, uid, mealId, mealLabel,
        mealOrdered: ordered,
        mealTaken: newTaken,
        mealRemaining: Math.max(0, ordered - newTaken),
        status: isExceeded ? 'exceeded' : 'ok',
        trackers,
        mealPlans: await buildMealPlans(registerMeals, personMeals, updatedTakenCounts, uid, name),
      })
    } catch (e) {
      setResult({
        name: uid, uid, mealId: 0, mealLabel: '', mealOrdered: 0, mealTaken: 0, mealRemaining: 0,
        status: 'error', errorMessage: '系統问题 System error: ' + String(e),
        trackers: [], mealPlans: [],
      })
    } finally {
      setLoading(false)
    }
  }, [loading, selectedMealId])

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('此浏览器不支持语音识别 Voice recognition not supported')
      return
    }
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null }
    const rec = new SpeechRecognition()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    recognitionRef.current = rec
    setListening(true)
    rec.onresult = (e) => {
      const numeric = e.results[0][0].transcript.replace(/\D/g, '')
      setListening(false)
      if (numeric) handleScan(numeric)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
  }

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

  const statusConfig = result ? {
    ok:       { bg: 'bg-green-900',  border: 'border-green-700',  icon: '✓', iconBg: 'bg-green-500',   text: 'text-green-300',   zh: '成功！请拿饭盒',   en: 'MEAL SERVED' },
    exceeded: { bg: 'bg-amber-950',  border: 'border-amber-700',  icon: '⚠', iconBg: 'bg-amber-500',   text: 'text-amber-300',   zh: '抱歉！已领了全部', en: 'QUOTA EXCEEDED' },
    error:    { bg: 'bg-red-950',    border: 'border-red-800',    icon: '✗', iconBg: 'bg-red-600',     text: 'text-red-300',     zh: result.errorMessage ?? '错误', en: 'ERROR' },
  }[result.status] : null

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
          {groupByDate(meals).map(({ date, meals: dayMeals }) => (
            <optgroup key={date} label={formatDate(date)}>
              {dayMeals.map((m) => (
                <option key={m.id} value={m.id}>
                  {mealTypeLabel(m.type)} {m.startTime.slice(0, 5)}–{m.endTime.slice(0, 5)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Camera scanner */}
      {scanning && !loading && (
        <div className="flex-1 flex flex-col">
          <QrScanner onScan={handleScan} active={scanning} />
          {manualEntryEnabled && (
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
              <button
                onClick={startVoice}
                disabled={listening}
                title="语音输入 Voice input"
                className={`px-3 py-2 rounded-lg text-lg transition-colors ${listening ? 'bg-red-600 animate-pulse' : 'bg-blue-700 hover:bg-blue-600 active:bg-blue-800'}`}
              >
                🎤
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-48 text-blue-300 text-lg animate-pulse">
          查询中 Loading…
        </div>
      )}

      {/* ── Scan result ─────────────────────────────────────────────── */}
      {result && !loading && statusConfig && (
        <div className="flex flex-col gap-0">

          {/* Status stripe */}
          <div className={`flex items-center gap-3 px-4 py-3 ${statusConfig.bg} border-b ${statusConfig.border}`}>
            <span className={`w-7 h-7 rounded-full ${statusConfig.iconBg} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}>
              {statusConfig.icon}
            </span>
            <div className="flex flex-col leading-tight">
              <span className={`font-bold text-base ${statusConfig.text}`}>{statusConfig.zh}</span>
              <span className="text-xs opacity-60 tracking-widest font-semibold">{statusConfig.en}</span>
            </div>
          </div>

          {/* Name + meal context */}
          <div className="px-4 py-3 border-b border-blue-800 flex items-baseline gap-3">
            <span className="text-2xl font-extrabold tracking-tight leading-none">{result.name}</span>
            {result.mealLabel && (
              <span className="text-xs text-blue-400 uppercase tracking-widest font-semibold whitespace-nowrap">{result.mealLabel}</span>
            )}
          </div>

          {/* Counts: hero remaining + supporting ordered/taken */}
          {result.status !== 'error' && (
            <div className="flex border-b border-blue-800">
              {/* Hero: Remaining */}
              <div className="flex-1 px-4 py-4 flex flex-col gap-1">
                <span className="text-xs text-blue-400 uppercase tracking-widest font-semibold">剩下 Remaining</span>
                <span
                  className={`font-black leading-none tabular-nums ${result.mealRemaining > 0 ? 'text-green-400' : 'text-blue-600'}`}
                  style={{ fontSize: 'clamp(3.5rem, 18vw, 6rem)' }}
                >
                  {result.mealRemaining}
                </span>
              </div>

              {/* Divider */}
              <div className="w-px bg-blue-800 my-3" />

              {/* Supporting: Ordered + Taken */}
              <div className="flex flex-col justify-center px-5 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-blue-400 uppercase tracking-widest font-semibold">订了 Ordered</span>
                  <span className="text-2xl font-bold tabular-nums">{result.mealOrdered}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-blue-400 uppercase tracking-widest font-semibold">领了 Taken</span>
                  <span className="text-2xl font-bold tabular-nums">{result.mealTaken}</span>
                </div>
              </div>
            </div>
          )}

          {/* Error detail */}
          {result.status === 'error' && (
            <div className="px-4 py-5 text-sm text-blue-300 leading-relaxed border-b border-blue-800">
              {result.errorMessage}
            </div>
          )}

          {/* Pickup history */}
          {result.trackers.length > 0 && (
            <div className="px-4 py-3 border-b border-blue-800 flex flex-col gap-2">
              <span className="text-xs text-blue-400 uppercase tracking-widest font-semibold">领取记录 Pickup History</span>
              {result.trackers.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${result.status === 'ok' ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <span className="text-white font-medium">{t.name} 领了一盒</span>
                  <span className="ml-auto text-blue-500 text-xs tabular-nums">{prettyTime(t.scannedAt)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Meal plans table */}
          {result.mealPlans.length > 0 && (
            <div className="overflow-x-auto border-b border-blue-800">
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="bg-blue-950 text-blue-400 text-xs uppercase tracking-widest">
                    <th className="px-3 py-2 text-left font-semibold">地点</th>
                    <th className="px-3 py-2 text-left font-semibold">餐食</th>
                    <th className="px-3 py-2 text-center font-semibold">订</th>
                    <th className="px-3 py-2 text-center font-semibold">领</th>
                    <th className="px-3 py-2 text-left font-semibold">记录</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-900">
                  {result.mealPlans.map((row) => (
                    <tr
                      key={row.meal.id}
                      className={row.meal.id === result.mealId ? 'bg-blue-900/50' : 'bg-blue-950/30'}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <LocationBadge locationId={row.meal.location} />
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="font-semibold text-sm">{mealTypeLabel(row.meal.type)}</div>
                        <div className="text-blue-400 text-xs mt-0.5">{row.meal.date.slice(5)} · {row.meal.startTime.slice(0, 5)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center align-middle">{row.ordered}</td>
                      <td className={`px-3 py-2.5 text-center align-middle font-semibold ${row.taken >= row.ordered ? 'text-blue-600' : 'text-green-400'}`}>
                        {row.taken}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        {row.pickupRecords.map((pr, i) => (
                          <div key={i} className="text-xs text-blue-400 flex gap-1 items-center">
                            <span className="opacity-50">·</span>
                            <span>{pr.name}</span>
                            <span className="text-blue-600">{prettyTime(pr.scannedAt)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Scan next */}
          <div className="px-4 py-4">
            <button
              onClick={reset}
              className="w-full py-4 bg-blue-800 hover:bg-blue-700 active:bg-blue-900 rounded-xl text-base font-bold tracking-wide transition-colors flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
              </svg>
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
    return <span className="px-2 py-0.5 rounded text-black font-bold text-xs" style={{ background: '#FFD400' }}>Westin</span>
  if (locationId === 2)
    return <span className="px-2 py-0.5 rounded font-bold text-xs" style={{ background: '#d2b48c', color: '#000' }}>Hilton</span>
  return <span className="px-2 py-0.5 rounded bg-blue-800 text-blue-300 text-xs">Loc {locationId}</span>
}

function mealTypeLabel(type: number) {
  return type === 1 ? '早餐 Breakfast' : type === 2 ? '午餐 Lunch' : '晚餐 Dinner'
}

function prettyTime(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1)  return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const hhmm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (new Date().toDateString() === d.toDateString()) return `今天 ${hhmm}`
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' + hhmm
}

function groupByDate(meals: CachedMeal[]): { date: string; meals: CachedMeal[] }[] {
  const map = new Map<string, CachedMeal[]>()
  for (const m of meals) {
    if (!map.has(m.date)) map.set(m.date, [])
    map.get(m.date)!.push(m)
  }
  return Array.from(map.entries()).map(([date, meals]) => ({ date, meals }))
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

/**
 * Auto-detects the current meal from the full meals cache.
 * - 30 min early grace before startTime (volunteers set up early)
 * - 60 min late grace after endTime (stragglers)
 * - If no meal is active right now, returns the next upcoming meal
 */
function detectCurrentMeal(meals: CachedMeal[]): number | undefined {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const todayMeals = meals
    .filter((m) => m.date === todayStr)
    .sort((a, b) => a.type - b.type)

  const EARLY_GRACE = 30  // minutes before startTime
  const LATE_GRACE  = 60  // minutes after endTime

  // Active window: startTime - 30min  →  endTime + 60min
  const active = todayMeals.find((m) => {
    const [sh, sm] = m.startTime.split(':').map(Number)
    const [eh, em] = m.endTime.split(':').map(Number)
    const start = sh * 60 + sm - EARLY_GRACE
    const end   = eh * 60 + em + LATE_GRACE
    return nowMin >= start && nowMin <= end
  })
  if (active) return active.id

  // No active meal — return next upcoming
  const upcoming = todayMeals.find((m) => {
    const [sh, sm] = m.startTime.split(':').map(Number)
    return sh * 60 + sm - EARLY_GRACE > nowMin
  })
  return upcoming?.id
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
    const pickupRecords: PickupRecord[] = queueEntries.map((e) => ({ name, scannedAt: e.scannedAt }))
    rows.push({ meal, rm, ordered: rm.qty, taken, pickupRecords })
  }
  return rows.sort((a, b) => a.meal.date.localeCompare(b.meal.date) || a.meal.type - b.meal.type)
}
