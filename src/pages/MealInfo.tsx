import { useState, useEffect } from 'react'
import { db, type CachedMeal, lookupByUid } from '../db/localDb'

interface MealStat {
  meal: CachedMeal
  ordered: number
  taken: number
}

interface Props {
  refreshKey: number
  onSync: () => Promise<void>
}

const VENUE_LABELS: Record<number, { label: string; bg: string; text: string }> = {
  1: { label: 'Westin',  bg: '#FFD400', text: '#3a2e00' },
  2: { label: 'Hilton',  bg: '#d2b48c', text: '#3a2000' },
}

type LookupResult = Awaited<ReturnType<typeof lookupByUid>>

export default function MealInfo({ refreshKey, onSync }: Props) {
  const [mealStats, setMealStats] = useState<MealStat[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<LookupResult | 'not-found' | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const allMeals = await db.meals.orderBy('date').toArray()
      const allRegisterMeals = await db.registerMeals.toArray()

      const orderedByMeal: Record<number, number> = {}
      for (const rm of allRegisterMeals) {
        orderedByMeal[rm.mealId] = (orderedByMeal[rm.mealId] ?? 0) + (rm.qty ?? 1)
      }

      // Fetch all scans once, filter synced in JS — avoids N+1 per-meal queries.
      const allScans = await db.scanQueue.toArray()
      const syncedScans = allScans.filter((s) => s.synced === true)
      const takenByMeal: Record<number, number> = {}
      for (const s of syncedScans) {
        takenByMeal[s.mealId] = (takenByMeal[s.mealId] ?? 0) + 1
      }
      const stats = allMeals.map((m) => ({
        meal: m,
        ordered: orderedByMeal[m.id] ?? 0,
        taken: takenByMeal[m.id] ?? 0,
      }))
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

  const handleSearch = async (query: string) => {
    const q = query.trim()
    if (!q) { setSearchResult(null); return }
    setSearchLoading(true)
    try {
      const result = await lookupByUid(q)
      setSearchResult(result ?? 'not-found')
    } finally {
      setSearchLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [refreshKey])

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-blue-300">活動餐食統計 Event Meal Stats</p>
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
          <p className="text-xs text-blue-500">本機統計 · This device only</p>
          <p className="text-xs text-blue-400">更新於 {lastRefresh.toLocaleTimeString('zh-TW')}</p>
        </div>
      )}

      {/* Person lookup */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-blue-300">查詢會員 Person Lookup</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
            placeholder="輸入 UID 或 ID…"
            className="flex-1 bg-blue-900 border border-blue-700 rounded-xl px-3 py-2 text-sm placeholder:text-blue-500 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={() => handleSearch(searchQuery)}
            disabled={searchLoading}
            className="bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {searchLoading ? '…' : '查'}
          </button>
          {searchResult && (
            <button
              onClick={() => { setSearchResult(null); setSearchQuery('') }}
              className="text-blue-400 px-2 text-sm"
            >✕</button>
          )}
        </div>

        {searchResult === 'not-found' && (
          <p className="text-sm text-red-400">找不到此人 Not found</p>
        )}

        {searchResult && searchResult !== 'not-found' && (() => {
          const { profile, meals, registerMeals, takenCounts } = searchResult
          const name = profile.cnName || `${profile.firstName} ${profile.lastName}`
          const rmByMeal = new Map(registerMeals.map((r) => [r.mealId, r.qty ?? 1]))
          return (
            <div className="bg-blue-900 rounded-xl p-4 flex flex-col gap-3">
              <p className="font-semibold text-white">{name}</p>
              {meals.length === 0 ? (
                <p className="text-sm text-blue-400">無餐食訂單 No meal orders</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {meals.map((meal) => {
                    const ordered = rmByMeal.get(meal.id) ?? 0
                    const taken = takenCounts[meal.id] ?? 0
                    const remaining = ordered - taken
                    const isFull = remaining <= 0
                    const venue = VENUE_LABELS[meal.location]
                    return (
                      <div key={meal.id} className="flex items-center justify-between bg-blue-950 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{mealTypeLabel(meal.type)}</p>
                          <p className="text-xs text-blue-400">{meal.date} {meal.startTime?.slice(0,5)}</p>
                          {venue && (
                            <span className="inline-block text-xs px-1.5 py-0.5 rounded mt-0.5" style={{ background: venue.bg, color: venue.text }}>{venue.label}</span>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <p className={`text-lg font-bold ${isFull ? 'text-yellow-400' : 'text-green-400'}`}>{taken}<span className="text-blue-500 text-sm">/{ordered}</span></p>
                          <p className="text-xs text-blue-400">領了/訂了</p>
                          {isFull && <p className="text-xs font-semibold text-yellow-400">滿 FULL</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {statsLoading ? (
        <div className="flex items-center justify-center h-32 text-blue-300 animate-pulse text-sm">
          載入中 Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {mealStats.length === 0 && (
            <p className="text-center text-blue-400 text-sm py-6">暫無餐食 No meals found</p>
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
                          <p className="text-xs text-blue-400">已取 / 訂了</p>
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
                            剩餘 {remaining} 盒
                          </span>
                          {isFull && (
                            <span className="text-xs font-semibold text-yellow-400 bg-yellow-900/40 px-1.5 py-0.5 rounded">
                              滿 FULL
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
  return new Date(iso + 'T00:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })
}

function mealTypeLabel(type: number) {
  return type === 1 ? '早餐 Breakfast' : type === 2 ? '午餐 Lunch' : '晚餐 Dinner'
}

