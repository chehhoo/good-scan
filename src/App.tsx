import { useState, useEffect, useRef } from 'react'
import MealScan from './pages/MealScan'
import CheckIn from './pages/CheckIn'
import MealInfo from './pages/MealInfo'
import StatusDot from './components/StatusDot'
import { db, markSynced, getPendingScans, getLastSyncTime } from './db/localDb'
import { syncApi, eventApi, type ActiveEvent } from './api/client'

type Tab = 'meal' | 'checkin' | 'info'

export default function App() {
  const [tab, setTab] = useState<Tab>('meal')
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track online/offline status
  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Update pending count
  const refreshPendingCount = async () => {
    const pending = await getPendingScans()
    setPendingCount(pending.length)
  }

  // Initial cache warm-up + periodic sync
  useEffect(() => {
    warmUpCache()
    refreshPendingCount()
    getLastSyncTime().then(setLastSyncAt)
    eventApi.getActive().then(setActiveEvent).catch(() => {})

    syncIntervalRef.current = setInterval(() => {
      if (navigator.onLine) flushQueue()
      refreshPendingCount()
    }, 10_000)

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [])

  async function warmUpCache() {
    if (!navigator.onLine) return
    try {
      const [profiles, meals, registerMeals] = await Promise.all([
        syncApi.profiles(),
        syncApi.meals(),
        syncApi.registerMeals(),
      ])
      await db.transaction('rw', db.profiles, db.meals, db.registerMeals, async () => {
        await db.profiles.bulkPut(profiles.data)
        await db.meals.bulkPut(meals.data)
        await db.registerMeals.bulkPut(registerMeals.data)
      })
      setLastSyncAt(new Date())
    } catch {
      // Silently continue — stale cache is still usable
    }
  }

  async function flushQueue() {
    const pending = await getPendingScans()
    if (pending.length === 0) return
    try {
      const res = await syncApi.flushScans(
        pending.map((s) => ({ uid: s.uid, mealId: s.mealId, scannedAt: s.scannedAt }))
      )
      const accepted = res.data.accepted
      await Promise.all(
        pending
          .filter((s) => s.id !== undefined && accepted.includes(s.id!))
          .map((s) => markSynced(s.id!))
      )
      setLastSyncAt(new Date())
      await refreshPendingCount()
    } catch {
      // Will retry on next interval
    }
  }

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-blue-950 text-white">
      {/* Header with status dot */}
      <header className="flex items-center justify-between px-4 py-2 bg-blue-950 border-b border-blue-800 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Good Vessel" className="w-8 h-8 rounded-xl shrink-0" />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] text-blue-300 font-medium tracking-widest uppercase">Good Vessel · 好器皿</span>
            <span className="text-sm font-bold tracking-wide">
              {activeEvent ? `${activeEvent.name}${activeEvent.nameEng ? ` ${activeEvent.nameEng}` : ''}` : 'Scan'}
            </span>
          </div>
        </div>
        <StatusDot online={online} pendingCount={pendingCount} lastSyncAt={lastSyncAt} />
      </header>

      {/* Top tab bar */}
      <nav className="flex bg-blue-900 border-b border-blue-700 shrink-0">
        {(['meal', 'checkin', 'info'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold tracking-wide transition-colors ${
              tab === t
                ? 'text-white border-b-2 border-white'
                : 'text-blue-300 hover:text-blue-100'
            }`}
          >
            {t === 'meal' && '🍽 餐食 Meal'}
            {t === 'checkin' && '✓ 报到 Check-In'}
            {t === 'info' && '📋 统计 Info'}
          </button>
        ))}
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        {tab === 'meal' && <MealScan />}
        {tab === 'checkin' && <CheckIn />}
        {tab === 'info' && <MealInfo />}
      </main>
    </div>
  )
}
