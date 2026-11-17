import { useState, useEffect } from 'react'
import { db, type ScanQueueItem, type CachedProfile, type CachedMeal } from '../db/localDb'
import { prettyTime } from '../utils/time'

interface EnrichedScan {
  scan: ScanQueueItem
  profile: CachedProfile | undefined
  meal: CachedMeal | undefined
}

const MEAL_TYPE: Record<number, string> = { 1: '早餐', 2: '午餐', 3: '晚餐' }

function exportCsv(items: EnrichedScan[]) {
  const rows = [['Name', 'UID', 'Meal', 'ScannedAt', 'Status', 'RefusedReason']]
  for (const { scan, profile, meal } of items) {
    const name = profile ? (profile.cnName || `${profile.firstName} ${profile.lastName}`) : scan.uid
    const mealLabel = meal ? `${MEAL_TYPE[meal.type] ?? ''} ${meal.date}` : `#${scan.mealId}`
    const status = scan.refused ? 'refused' : scan.synced ? 'synced' : 'pending'
    rows.push([name, scan.uid, mealLabel, scan.scannedAt, status, scan.refused ?? ''])
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scan-history-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ScanHistory() {
  const [items, setItems] = useState<EnrichedScan[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'synced' | 'refused'>('all')

  const load = async () => {
    setLoading(true)
    try {
      const [scans, profiles, meals] = await Promise.all([
        db.scanQueue.orderBy('scannedAt').reverse().limit(200).toArray(),
        db.profiles.toArray(),
        db.meals.toArray(),
      ])
      const profileByUid = new Map(profiles.map((p) => [p.uid, p]))
      const mealById = new Map(meals.map((m) => [m.id, m]))
      setItems(scans.map((scan) => ({
        scan,
        profile: profileByUid.get(scan.uid),
        meal: mealById.get(scan.mealId),
      })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter((item) => {
    if (filter === 'pending') return !item.scan.synced && !item.scan.refused
    if (filter === 'synced') return item.scan.synced
    if (filter === 'refused') return !!item.scan.refused
    return true
  })

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-blue-300">掃描記錄 Scan History</p>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              onClick={() => exportCsv(items)}
              className="bg-blue-800 hover:bg-blue-700 rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              ↓ CSV
            </button>
          )}
          <button onClick={load} className="bg-blue-700 hover:bg-blue-600 rounded-lg px-3 py-1.5 text-xs font-medium">↻ 刷新</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-blue-900 rounded-xl p-1">
        {(['all', 'pending', 'synced', 'refused'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f ? 'bg-blue-700 text-white' : 'text-blue-400'
            }`}
          >
            {f === 'all' ? '全部' : f === 'pending' ? '待同步' : f === 'synced' ? '已同步' : '被拒'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-blue-300 animate-pulse text-sm">載入中…</div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-blue-400 text-sm py-8">暫無記錄 No records</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => {
            const { scan, profile, meal } = item
            const name = profile ? (profile.cnName || `${profile.firstName} ${profile.lastName}`) : scan.uid
            const mealLabel = meal ? `${MEAL_TYPE[meal.type] ?? '餐'} ${meal.date}` : `餐 #${scan.mealId}`
            const statusColor = scan.refused
              ? 'border-red-700 bg-red-900/20'
              : scan.synced
              ? 'border-green-800 bg-green-900/10'
              : 'border-blue-700 bg-blue-900'
            return (
              <div key={scan.id} className={`rounded-xl px-3 py-2.5 border ${statusColor}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-blue-400">{mealLabel}</p>
                    {scan.refused && <p className="text-xs text-red-400 mt-0.5">{scan.refused}</p>}
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-xs text-blue-400">{prettyTime(scan.scannedAt)}</p>
                    <p className={`text-xs font-medium mt-0.5 ${scan.refused ? 'text-red-400' : scan.synced ? 'text-green-400' : 'text-yellow-400'}`}>
                      {scan.refused ? '被拒' : scan.synced ? '已同步' : '待同步'}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
