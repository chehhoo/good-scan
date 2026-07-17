import { useState, useEffect, useRef } from 'react'
import MealScan from './pages/MealScan'
import CheckIn from './pages/CheckIn'
import MealInfo from './pages/MealInfo'
import LoginPage from './pages/LoginPage'
import StatusDot from './components/StatusDot'
import { db, markSynced, getPendingScans } from './db/localDb'
import { syncApi, eventApi, type ActiveEvent } from './api/client'

type Tab = 'meal' | 'checkin' | 'info'

const MANUAL_ENTRY_KEY = 'manualEntryEnabled'

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [tab, setTab] = useState<Tab>('meal')
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null)
  const [lastScannedUid, setLastScannedUid] = useState<string | null>(null)
  const [infoRefreshKey, setInfoRefreshKey] = useState(0)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cacheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Manual entry: always on in dev; toggle by tapping version badge 5× in prod
  const [manualEntryEnabled, setManualEntryEnabled] = useState<boolean>(
    import.meta.env.DEV || localStorage.getItem(MANUAL_ENTRY_KEY) === '1'
  )
  const versionTapCount = useRef(0)
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track online/offline status — re-sync cache immediately on reconnect
  useEffect(() => {
    const onOnline = () => { setOnline(true); warmUpCache() }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const handleVersionTap = () => {
    if (import.meta.env.DEV) return
    versionTapCount.current += 1
    if (versionTapTimer.current) clearTimeout(versionTapTimer.current)
    versionTapTimer.current = setTimeout(() => { versionTapCount.current = 0 }, 3000)
    if (versionTapCount.current >= 5) {
      versionTapCount.current = 0
      setManualEntryEnabled((prev) => {
        const next = !prev
        if (next) localStorage.setItem(MANUAL_ENTRY_KEY, '1')
        else localStorage.removeItem(MANUAL_ENTRY_KEY)
        return next
      })
    }
  }

  // Update pending count
  const refreshPendingCount = async () => {
    const pending = await getPendingScans()
    setPendingCount(pending.length)
  }

  // Initial cache warm-up + periodic sync
  useEffect(() => {
    warmUpCache()
    refreshPendingCount()
    const stored = localStorage.getItem('lastCacheSyncAt')
    if (stored) setLastSyncAt(new Date(stored))
    eventApi.getActive().then(setActiveEvent).catch(() => {})

    // Flush scan queue every 10s
    syncIntervalRef.current = setInterval(() => {
      if (navigator.onLine) flushQueue()
      refreshPendingCount()
    }, 10_000)

    // Re-sync cache every 5 minutes so data stays fresh
    cacheIntervalRef.current = setInterval(() => {
      if (navigator.onLine) warmUpCache()
    }, 5 * 60_000)

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
      if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current)
    }
  }, [])

  async function warmUpCache() {
    if (!navigator.onLine) return
    try {
      const [profiles, meals, registerMeals, voided] = await Promise.all([
        syncApi.profiles(),
        syncApi.meals(),
        syncApi.registerMeals(),
        syncApi.voidedScans(),
      ])
      await db.transaction('rw', db.profiles, db.meals, db.registerMeals, db.scanQueue, async () => {
        await db.profiles.bulkPut(profiles.data)
        await db.meals.bulkPut(meals.data)
        await db.registerMeals.bulkPut(registerMeals.data)
        // Remove locally-cached scans that were voided server-side
        for (const v of voided.data) {
          await db.scanQueue.where('[uid+mealId]').equals([v.uid, v.mealId]).delete()
        }
      })
      const now = new Date()
      setLastSyncAt(now)
      localStorage.setItem('lastCacheSyncAt', now.toISOString())
    } catch {
      // Silently continue — stale cache is still usable
    }
  }

  async function flushQueue() {
    const pending = await getPendingScans()
    if (pending.length === 0) return
    try {
      const res = await syncApi.flushScans(
        pending.map((s) => ({ localId: s.id!, uid: s.uid, mealId: s.mealId, scannedAt: s.scannedAt }))
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

  if (!token) {
    return <LoginPage onLogin={setToken} />
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
              {' '}
              <span
              className={`text-[10px] font-normal select-none ${manualEntryEnabled && !import.meta.env.DEV ? 'text-yellow-400' : 'text-blue-400'}`}
              onClick={handleVersionTap}
            >v{__APP_VERSION__}</span>
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
            onClick={() => { setTab(t); if (t === 'info') setInfoRefreshKey((k) => k + 1) }}
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
        {tab === 'meal' && <MealScan manualEntryEnabled={manualEntryEnabled} onScan={setLastScannedUid} />}
        {tab === 'checkin' && <CheckIn manualEntryEnabled={manualEntryEnabled} />}
        {tab === 'info' && <MealInfo lastScannedUid={lastScannedUid} refreshKey={infoRefreshKey} onSync={warmUpCache} />}
      </main>
    </div>
  )
}
