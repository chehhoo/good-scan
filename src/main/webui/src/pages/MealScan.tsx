import { useState, useCallback, useEffect } from 'react'
import QrScanner from '../components/QrScanner'
import ResultBanner from '../components/ResultBanner'
import { scanApi, type ScanResponse, type Venue, type Meal } from '../api/client'

type Result = { data: ScanResponse; name: string } | { error: string }

export default function MealScan() {
  const [scanning, setScanning] = useState(true)
  const [result, setResult] = useState<Result | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [selectedVenue, setSelectedVenue] = useState<number>(1)
  const [selectedMeal, setSelectedMeal] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    scanApi.venues().then((r) => setVenues(r.data))
  }, [])

  useEffect(() => {
    scanApi.mealInfo(selectedVenue).then((r) => {
      setMeals(r.data.meals)
      setSelectedMeal(undefined)
    })
  }, [selectedVenue])

  const handleScan = useCallback(async (uid: string) => {
    if (loading) return
    setScanning(false)
    setLoading(true)
    try {
      const res = await scanApi.scan(uid, selectedMeal)
      const data = res.data
      const record = data.pickUpRecord?.[data.pickUpRecord.length - 1]
      const name = record?.name ?? uid
      setResult({ data, name })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(e)
      setResult({ error: msg })
    } finally {
      setLoading(false)
    }
  }, [loading, selectedMeal])

  const reset = () => {
    setResult(null)
    setScanning(true)
  }

  const mealLabel = (m: Meal) => {
    const type = m.type === 1 ? '早餐' : m.type === 2 ? '午餐' : '晚餐'
    return `${type} ${m.date} ${m.startTime.slice(0, 5)}`
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Venue + Meal selectors */}
      <div className="flex gap-2">
        <select
          className="flex-1 bg-blue-900 border border-blue-700 rounded-lg px-3 py-2 text-sm"
          value={selectedVenue}
          onChange={(e) => setSelectedVenue(Number(e.target.value))}
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          className="flex-1 bg-blue-900 border border-blue-700 rounded-lg px-3 py-2 text-sm"
          value={selectedMeal ?? ''}
          onChange={(e) => setSelectedMeal(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">自动检测 Auto</option>
          {meals.map((m) => (
            <option key={m.id} value={m.id}>{mealLabel(m)}</option>
          ))}
        </select>
      </div>

      {/* Scanner */}
      {scanning && !loading && (
        <QrScanner onScan={handleScan} active={scanning} />
      )}

      {loading && (
        <div className="flex items-center justify-center h-48 text-blue-300 text-lg animate-pulse">
          查询中 Loading…
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <>
          {'error' in result ? (
            <ResultBanner
              name="错误 Error"
              status="error"
              message={result.error}
              onDismiss={reset}
            />
          ) : (
            <ResultBanner
              name={result.name}
              status={result.data.mealStatus === 0 ? 'ok' : 'exceeded'}
              message={
                result.data.mealStatus === 0
                  ? '✓ 领取成功 MEAL SERVED'
                  : '⚠ 已超出份数 QUOTA EXCEEDED'
              }
              mealOrdered={result.data.mealOrdered}
              mealTaken={result.data.mealTaken}
              onDismiss={reset}
            />
          )}

          {/* Pickup history */}
          {'data' in result && result.data.pickUpRecord?.length > 0 && (
            <div className="bg-blue-900 rounded-xl p-3">
              <p className="text-xs text-blue-300 mb-2">本桌领取记录 Pickup records</p>
              {result.data.pickUpRecord.map((r, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-blue-800 last:border-0">
                  <span>{r.name}</span>
                  <span className="text-blue-400 text-xs">
                    {r.pickUpDate ? new Date(r.pickUpDate).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
