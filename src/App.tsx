import { useState, useEffect, useRef } from 'react'
import MealScan from './pages/MealScan'
import CheckIn from './pages/CheckIn'
import MealInfo from './pages/MealInfo'
import LoginPage from './pages/LoginPage'
import StatusDot from './components/StatusDot'
import { db, markSynced, markRefused, getPendingScans, getRefusedScans, dismissRefusedScan, type ScanQueueItem } from './db/localDb'
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
  const [refusedScans, setRefusedScans] = useState<ScanQueueItem[]>([])
  const [showRefused, setShowRefused] = useState(false)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cacheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const warmingUp = useRef(false)
  const warmUpInFlight = useRef<Promise<void> | null>(null)
  const lastMissRefreshAt = useRef(0)
  // Manual entry: always on in dev; toggle by tapping version badge 5× in prod
  const [manualEntryEnabled, setManualEntryEnabled] = useState<boolean>(
    import.meta.env.DEV || localStorage.getItem(MANUAL_ENTRY_KEY) === '1'
  )
  const versionTapCount = useRef(0)
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track online/offline status — re-sync cache immediately on reconnect
  useEffect(() => {
    const onOnline = () => { checkReachability(); warmUpCache() }
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

  // Update pending count and refused list
  const refreshPendingCount = async () => {
    const pending = await getPendingScans()
    setPendingCount(pending.length)
    const refused = await getRefusedScans()
    setRefusedScans(refused)
  }

  // Ping the server to confirm actual reachability (not just navigator.onLine)
  async function checkReachability() {
    try {
      await eventApi.getActive()
      setOnline(true)
    } catch {
      setOnline(false)
    }
  }

  // Initial cache warm-up + periodic sync
  useEffect(() => {
    warmUpCache()
    refreshPendingCount()
    const stored = localStorage.getItem('lastCacheSyncAt')
    if (stored) setLastSyncAt(new Date(stored))
    eventApi.getActive().then((event) => {
      setOnline(true)
      setActiveEvent(event)
      // If the active event has changed since login, force re-login with the new code
      const tokenEventId = localStorage.getItem('tokenEventId')
      if (tokenEventId && String(event.id) !== tokenEventId) {
        localStorage.removeItem('token')
        localStorage.removeItem('tokenEventId')
        setToken(null)
      }
    }).catch(() => { setOnline(false) })

    // Flush scan queue every 10s
    syncIntervalRef.current = setInterval(() => {
      if (navigator.onLine) flushQueue()
      refreshPendingCount()
    }, 10_000)

    // Re-sync cache every 5 minutes so data stays fresh
    cacheIntervalRef.current = setInterval(() => {
      if (navigator.onLine) warmUpCache()
    }, 5 * 60_000)

    // Ping server every 30s to keep reachability status accurate
    pingIntervalRef.current = setInterval(checkReachability, 30_000)

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
      if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
    }
  }, [])

  // One cache refresh at a time — concurrent callers share it, so a cache-miss retry
  // really waits for fresh data instead of returning while another refresh runs.
  function warmUpCache(): Promise<void> {
    if (!warmUpInFlight.current) {
      warmUpInFlight.current = doWarmUpCache().finally(() => { warmUpInFlight.current = null })
    }
    return warmUpInFlight.current
  }

  /**
   * A scanned person isn't in the offline cache — e.g. a walk-in registered at the
   * door minutes ago, before the next 5-minute refresh. Refresh once and let the
   * caller retry. Throttled so a foreign/garbled QR scanned repeatedly can't hammer
   * the server with full refreshes.
   */
  async function refreshOnCacheMiss(): Promise<void> {
    if (!navigator.onLine) return
    if (Date.now() - lastMissRefreshAt.current < 20_000) return
    lastMissRefreshAt.current = Date.now()
    await warmUpCache()
  }

  async function doWarmUpCache() {
    if (!navigator.onLine) return
    if (warmingUp.current) return
    warmingUp.current = true
    try {
      const [profiles, meals, registerMeals, voided, serverScans] = await Promise.all([
        syncApi.profiles(),
        syncApi.meals(),
        syncApi.registerMeals(),
        syncApi.voidedScans(),
        syncApi.scans(),
      ])
      await db.transaction('rw', db.profiles, db.meals, db.registerMeals, db.scanQueue, async () => {
        // Full replace — clear first so records from a previous event don't linger
        await db.profiles.clear()
        await db.profiles.bulkAdd(profiles.data)
        await db.meals.clear()
        await db.meals.bulkAdd(meals.data)
        await db.registerMeals.clear()
        await db.registerMeals.bulkAdd(registerMeals.data)
        // Remove locally-cached scans that were voided server-side
        for (const v of voided.data) {
          await db.scanQueue.where('[uid+mealId]').equals([v.uid, v.mealId]).delete()
        }
        // Merge server scan records. Drop synced rows and unsynced rows the server confirms.
        // Match by clientScanId when the server provides it (v3.44+); fall back to uid:mealId
        // for older server scans. Never drop refused rows — they stay until the volunteer dismisses them.
        const serverClientScanIds = new Set(serverScans.data.map((s) => s.clientScanId).filter(Boolean))
        const confirmedKeys = new Set(serverScans.data.filter((s) => !s.clientScanId).map((s) => `${s.uid}:${s.mealId}`))
        const staleIds = await db.scanQueue
          .filter((s) => {
            if (s.refused) return false  // never auto-delete refused rows
            if (s.synced) return true
            if (s.clientScanId && serverClientScanIds.has(s.clientScanId)) return true
            if (!s.clientScanId && confirmedKeys.has(`${s.uid}:${s.mealId}`)) return true
            return false
          })
          .primaryKeys()
        await db.scanQueue.bulkDelete(staleIds as number[])
        await db.scanQueue.bulkAdd(
          serverScans.data.map((s) => ({ uid: s.uid, mealId: s.mealId, scannedAt: s.scannedAt, synced: true as const, clientScanId: s.clientScanId ?? crypto.randomUUID() }))
        )
      })
      const now = new Date()
      setLastSyncAt(now)
      localStorage.setItem('lastCacheSyncAt', now.toISOString())
    } catch (e: unknown) {
      // On 401, JWT has expired — force re-login
      if (e && typeof e === 'object' && 'response' in e && (e as { response?: { status?: number } }).response?.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('tokenEventId')
        setToken(null)
      }
      // Otherwise silently continue — stale cache is still usable
    } finally {
      warmingUp.current = false
    }
  }

  async function flushQueue() {
    const pending = await getPendingScans()
    if (pending.length === 0) return
    try {
      const res = await syncApi.flushScans(
        pending.map((s) => ({ localId: s.id!, uid: s.uid, mealId: s.mealId, scannedAt: s.scannedAt, clientScanId: s.clientScanId }))
      )
      // localId comes back as string from the API
      const accepted = new Set(res.data.accepted.map(String))
      const rejected = res.data.rejected ?? []
      await Promise.all([
        ...pending
          .filter((s) => s.id !== undefined && accepted.has(String(s.id)))
          .map((s) => markSynced(s.id!)),
        ...rejected
          .filter((r) => !isTransientRejection(r.reason))
          .map((r) => {
            const row = pending.find((s) => String(s.id) === String(r.localId))
            return row?.id != null ? markRefused(row.id, r.reason) : Promise.resolve()
          }),
      ])
      setLastSyncAt(new Date())
      await refreshPendingCount()
    } catch {
      // Network error or 5xx — leave everything pending, retry on next interval
    }
  }

  function isTransientRejection(reason: string): boolean {
    return reason.includes('No active event') || reason.includes('503') || reason.includes('Could not save the scan')
  }

  function formatRefusedReason(reason: string): string {
    if (reason.includes('Quota exceeded')) return '已超過此家庭訂餐數量 Over the family\'s order'
    return reason
  }

  if (!token) {
    return <LoginPage onLogin={(t) => { setToken(t); warmUpCache() }} />
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
        <div className="flex items-center gap-2">
          {refusedScans.length > 0 && (
            <button
              onClick={() => setShowRefused(true)}
              className="text-xs font-semibold bg-red-700 text-white px-2 py-1 rounded-lg"
            >
              {refusedScans.length} 筆未被接受
            </button>
          )}
          <StatusDot online={online} pendingCount={pendingCount} lastSyncAt={lastSyncAt} onSync={warmUpCache} />
        </div>
      </header>

      {/* Refused scans modal */}
      {showRefused && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={() => setShowRefused(false)}>
          <div className="w-full max-w-lg bg-blue-950 border border-red-700 rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-red-400 mb-1">未被接受的掃描 Not Accepted</h2>
            <p className="text-xs text-blue-300 mb-3">以下掃描記錄已被伺服器拒絕，不會重新發送。<br />The following scans were permanently refused by the server.</p>
            <div className="flex flex-col gap-2">
              {refusedScans.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-blue-900 rounded-xl px-3 py-2">
                  <div className="text-sm">
                    <div className="font-semibold">{s.uid} · 餐 {s.mealId}</div>
                    <div className="text-xs text-blue-300">{formatRefusedReason(s.refused ?? '')}</div>
                    <div className="text-xs text-blue-400">{new Date(s.scannedAt).toLocaleString()}</div>
                  </div>
                  <button
                    onClick={async () => {
                      if (s.id != null) await dismissRefusedScan(s.id)
                      await refreshPendingCount()
                      if (refusedScans.length <= 1) setShowRefused(false)
                    }}
                    className="ml-3 text-xs bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded-lg shrink-0"
                  >
                    清除 Dismiss
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowRefused(false)} className="mt-4 w-full py-2 text-sm text-blue-300 border border-blue-700 rounded-xl">關閉 Close</button>
          </div>
        </div>
      )}

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
            {t === 'checkin' && '✓ 報到 Check-In'}
            {t === 'info' && '📋 統計 Info'}
          </button>
        ))}
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        {tab === 'meal' && <MealScan manualEntryEnabled={manualEntryEnabled} isSynced={lastSyncAt !== null && Date.now() - lastSyncAt.getTime() <= 30 * 60 * 1000} onScan={setLastScannedUid} onCacheMiss={refreshOnCacheMiss} />}
        {tab === 'checkin' && <CheckIn manualEntryEnabled={manualEntryEnabled} isSynced={lastSyncAt !== null && Date.now() - lastSyncAt.getTime() <= 30 * 60 * 1000} onCacheMiss={refreshOnCacheMiss} />}
        {tab === 'info' && <MealInfo lastScannedUid={lastScannedUid} refreshKey={infoRefreshKey} onSync={warmUpCache} />}
      </main>
    </div>
  )
}
