import { useState, useEffect } from 'react'
import { db, lookupByUid, type CachedMeal, type CachedRegisterMeal } from '../db/localDb'

interface MealStat {
  meal: CachedMeal
  ordered: number
  taken: number
}

interface PersonResult {
  name: string
  uid: string
  registerMeals: CachedRegisterMeal[]
  meals: CachedMeal[]
  takenCounts: Record<number, number>
  pickupRecords: Record<number, string[]>
  lastScanAt: string | null
}

interface Props {
  lastScannedUid: string | null
  refreshKey: number
  onSync: () => Promise<void>
}

const VENUE_LABELS: Record<number, { label: string; bg: string; text: string }> = {
  1: { label: 'Westin',  bg: '#FFD400', text: '#3a2e00' },
  2: { label: 'Hilton',  bg: '#d2b48c', text: '#3a2000' },
}

export default function MealInfo({ lastScannedUid, refreshKey, onSync }: Props) {
  const [mealStats, setMealStats] = useState<MealStat[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const [personResult, setPersonResult] = useState<PersonResult | null>(null)
  const [personLoading, setPersonLoading] = useState(false)
  const [personError, setPersonError] = useState<string | null>(null)

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const allMeals = await db.meals.orderBy('date').toArray()
      const allRegisterMeals = await db.registerMeals.toArray()

      const orderedByMeal: Record<number, number> = {}
      for (const rm of allRegisterMeals) {
        orderedByMeal[rm.mealId] = (orderedByMeal[rm.mealId] ?? 0) + (rm.qty ?? 1)
      }

      const stats = await Promise.all(
        allMeals.map(async (m) => {
          const taken = await db.scanQueue.where('mealId').equals(m.id).count()
          return { meal: m, ordered: orderedByMeal[m.id] ?? 0, taken }
        })
      )
      setMealStats(
        stats
          .filter((s) => s.ordered > 0)
          .sort((a, b) => a.meal.date.localeCompare(b.meal.date) || a.meal.type - b.meal.type)
      )
      setLastRefresh(new Date())
    } finally {
      setStatsLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await onSync()
      await loadStats()
    } finally {
      setSyncing(false)
    }
  }

  const loadPerson = async (uid: string) => {
    setPersonLoading(true)
    setPersonError(null)
    setPersonResult(null)
    try {
      const local = await lookupByUid(uid)
      if (!local) {
        setPersonError('没有找到此人 Person not found')
        return
      }
      const { profile, registerMeals, meals: personMeals, takenCounts } = local
      const name = profile.cnName || `${profile.firstName} ${profile.lastName}`
      const pickupRecords: Record<number, string[]> = {}
      let lastScanAt: string | null = null
      for (const rm of registerMeals) {
        const entries = await db.scanQueue
          .where('[uid+mealId]').equals([uid, rm.mealId])
          .toArray()
        pickupRecords[rm.mealId] = entries.map((e) => e.scannedAt)
        for (const e of entries) {
          if (!lastScanAt || e.scannedAt > lastScanAt) lastScanAt = e.scannedAt
        }
      }
      setPersonResult({ name, uid, registerMeals, meals: personMeals, takenCounts, pickupRecords, lastScanAt })
    } catch {
      setPersonError('查询失败 Lookup failed')
    } finally {
      setPersonLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [refreshKey])

  useEffect(() => {
    if (lastScannedUid) loadPerson(lastScannedUid)
    else { setPersonResult(null); setPersonError(null) }
  }, [lastScannedUid, refreshKey])

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-blue-300">活动餐食统计 Event Meal Stats</p>
        <button
          onClick={handleSync}
          disabled={syncing || statsLoading}
          className="bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 flex items-center gap-1"
        >
          {syncing ? '同步中…' : '↻ 同步 Sync'}
        </button>
      </div>

      {lastRefresh && (
        <div className="-mt-2 flex items-center justify-between">
          <p className="text-xs text-blue-500">本机统计 · This device only</p>
          <p className="text-xs text-blue-400">更新于 {lastRefresh.toLocaleTimeString('zh-CN')}</p>
        </div>
      )}

      {statsLoading ? (
        <div className="flex items-center justify-center h-32 text-blue-300 animate-pulse text-sm">
          加载中 Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {mealStats.length === 0 && (
            <p className="text-center text-blue-400 text-sm py-6">暂无餐食 No meals found</p>
          )}
          {groupStatsByDate(mealStats).map(({ date, stats }) => (
            <div key={date}>
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">
                {formatDate(date)}
              </p>
              <div className="flex flex-col gap-2">
                {stats.map(({ meal, ordered, taken }) => {
                  const remaining = ordered - taken
                  const pct = ordered > 0 ? Math.min(100, Math.round((taken / ordered) * 100)) : 0
                  const isFull = remaining <= 0
                  const venue = VENUE_LABELS[meal.location]
                  return (
                    <div key={meal.id} className="bg-blue-900 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold">{mealTypeLabel(meal.type)}</p>
                          <p className="text-xs text-blue-400 mt-0.5">
                            {meal.startTime?.slice(0, 5)}–{meal.endTime?.slice(0, 5)}
                          </p>
                          {venue && (
                            <span
                              className="inline-block text-xs font-medium mt-1 px-2 py-0.5 rounded"
                              style={{ background: venue.bg, color: venue.text }}
                            >
                              {venue.label}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xl font-bold">
                            <span className={isFull ? 'text-yellow-400' : 'text-green-400'}>{taken}</span>
                            <span className="text-blue-500 text-sm"> / {ordered}</span>
                          </p>
                          <p className="text-xs text-blue-400">已取 / 订了</p>
                        </div>
                      </div>

                      {/* Remaining + progress */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border ${
                              isFull
                                ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700'
                                : 'bg-blue-950 text-blue-300 border-blue-700'
                            }`}
                          >
                            剩余 {remaining} 盒
                          </span>
                          {isFull && (
                            <span className="text-xs font-semibold text-yellow-400 bg-yellow-900/40 px-1.5 py-0.5 rounded">
                              满 FULL
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-blue-500">{pct}%</span>
                      </div>
                      <div className="w-full bg-blue-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Last scanned person */}
      <div className="border-t border-blue-800 pt-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-blue-300">上次扫描 Last Scanned</p>

        {!lastScannedUid && (
          <p className="text-center text-blue-500 text-sm py-4">尚未扫描 No scan yet</p>
        )}
        {personLoading && (
          <p className="text-center text-blue-300 animate-pulse text-sm">查询中 Loading…</p>
        )}
        {personError && (
          <p className="text-center text-red-400 text-sm">{personError}</p>
        )}
        {personResult && (
          <div className="bg-blue-900 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-blue-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-lg">{personResult.name}</span>
                <span className="ml-2 text-xs text-blue-400 font-normal">#{personResult.uid}</span>
              </div>
              {personResult.lastScanAt && (
                <span className="text-xs text-green-400 shrink-0 ml-2">
                  {prettyTime(personResult.lastScanAt)}
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-blue-800/60 text-blue-300 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">餐食 Meal</th>
                  <th className="px-3 py-2 text-center">订了</th>
                  <th className="px-3 py-2 text-center">领了</th>
                  <th className="px-3 py-2 text-left">记录</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800">
                {personResult.registerMeals.map((rm) => {
                  const meal = personResult.meals.find((m) => m.id === rm.mealId)
                  if (!meal) return null
                  const taken = personResult.takenCounts[rm.mealId] ?? 0
                  const records = personResult.pickupRecords[rm.mealId] ?? []
                  return (
                    <tr key={rm.id} className="bg-blue-900/40">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{mealTypeLabel(meal.type)}</div>
                        <div className="text-blue-400 text-xs">{meal.date} {meal.startTime.slice(0, 5)}</div>
                      </td>
                      <td className="px-3 py-2 text-center">{rm.qty} 盒</td>
                      <td className="px-3 py-2 text-center">
                        <span className={taken >= rm.qty ? 'text-gray-500' : 'text-green-400'}>
                          {taken} 盒
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">
                        {records.length === 0 ? '—' : records.map((iso, i) => (
                          <div key={i}>{prettyTime(iso)}</div>
                        ))}
                      </td>
                    </tr>
                  )
                })}
                {personResult.registerMeals.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-blue-400">
                      无订餐记录 No meal orders
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function groupStatsByDate(stats: MealStat[]): { date: string; stats: MealStat[] }[] {
  const map = new Map<string, MealStat[]>()
  for (const s of stats) {
    if (!map.has(s.meal.date)) map.set(s.meal.date, [])
    map.get(s.meal.date)!.push(s)
  }
  return Array.from(map.entries()).map(([date, stats]) => ({ date, stats }))
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

function mealTypeLabel(type: number) {
  return type === 1 ? '早餐 Breakfast' : type === 2 ? '午餐 Lunch' : '晚餐 Dinner'
}

function prettyTime(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1)  return '刚刚 just now'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const hhmm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const today = new Date().toDateString() === d.toDateString()
  if (today) return `今天 ${hhmm}`
  const md = d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  return `${md} ${hhmm}`
}
