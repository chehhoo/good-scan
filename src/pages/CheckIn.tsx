import { useState, useCallback } from 'react'
import QrScanner from '../components/QrScanner'
import ResultBanner from '../components/ResultBanner'
import { lookupByUid, type CachedMeal } from '../db/localDb'

interface CheckInResult {
  name: string
  householdId: number
  meals: Array<{
    meal: CachedMeal
    ordered: number
    taken: number
  }>
}

export default function CheckIn() {
  const [scanning, setScanning] = useState(true)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleScan = useCallback(async (uid: string) => {
    if (loading) return
    setScanning(false)
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const local = await lookupByUid(uid)

      if (!local) {
        setError('未找到 UID not found — 请先同步 Please sync first')
        setLoading(false)
        return
      }

      const { profile, registerMeals, meals, takenCounts } = local
      const name = profile.cnName || `${profile.firstName} ${profile.lastName}`

      const mealRows = registerMeals.map((rm) => ({
        meal: meals.find((m) => m.id === rm.mealId)!,
        ordered: rm.qty,
        taken: takenCounts[rm.mealId] ?? 0,
      })).filter((r) => r.meal)

      setResult({ name, householdId: profile.householdId, meals: mealRows })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [loading])

  const reset = () => {
    setResult(null)
    setError(null)
    setScanning(true)
  }

  const mealTypeLabel = (type: number) =>
    type === 1 ? '早餐 Breakfast' : type === 2 ? '午餐 Lunch' : '晚餐 Dinner'

  return (
    <div className="p-4 flex flex-col gap-4">
      <p className="text-blue-300 text-sm text-center">
        扫描名牌 QR 码查询餐食状态 · Scan badge QR to check meal status
      </p>

      {scanning && !loading && (
        <QrScanner onScan={handleScan} active={scanning} />
      )}

      {loading && (
        <div className="flex items-center justify-center h-48 text-blue-300 text-lg animate-pulse">
          查询中 Loading…
        </div>
      )}

      {error && !loading && (
        <ResultBanner name="未找到 Not Found" status="error" message={error} onDismiss={reset} />
      )}

      {result && !loading && (
        <>
          <ResultBanner
            name={result.name}
            status="ok"
            message={`家庭编号 Household #${result.householdId}`}
            onDismiss={reset}
          />

          {result.meals.length > 0 && (
            <div className="bg-blue-900 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs text-blue-300">餐食状态 Meal Status</p>
              {result.meals.map((row) => (
                <div key={row.meal.id} className="text-sm border-b border-blue-800 last:border-0 pb-2 last:pb-0">
                  <div className="flex justify-between">
                    <span className="font-medium">{mealTypeLabel(row.meal.type)}</span>
                    <span className="text-blue-400 text-xs">{row.meal.date}</span>
                  </div>
                  <div className="flex gap-3 text-xs mt-1">
                    <span className="text-blue-300">已订 {row.ordered}</span>
                    <span className="text-blue-300">已取 {row.taken}</span>
                    <span className={row.taken < row.ordered ? 'text-green-400' : 'text-gray-500'}>
                      {row.taken < row.ordered ? `剩余 ${row.ordered - row.taken}` : '已全取 All taken'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
