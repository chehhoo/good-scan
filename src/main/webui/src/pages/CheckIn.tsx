import { useState, useCallback } from 'react'
import QrScanner from '../components/QrScanner'
import ResultBanner from '../components/ResultBanner'
import { scanApi, type StatusResponse } from '../api/client'

type Result = { data: StatusResponse; name: string; uid: string } | { error: string }

export default function CheckIn() {
  const [scanning, setScanning] = useState(true)
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)

  const handleScan = useCallback(async (uid: string) => {
    if (loading) return
    setScanning(false)
    setLoading(true)
    try {
      const res = await scanApi.statusByUid(uid)
      const data = res.data
      setResult({ data, name: uid, uid })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(e)
      setResult({ error: msg })
    } finally {
      setLoading(false)
    }
  }, [loading])

  const reset = () => {
    setResult(null)
    setScanning(true)
  }

  const mealTypeLabel = (locationId: number) =>
    locationId === 1 ? 'Westin' : locationId === 2 ? 'Hilton' : `Location ${locationId}`

  return (
    <div className="p-4 flex flex-col gap-4">
      <p className="text-blue-300 text-sm text-center">扫描名牌 QR 码查询餐食状态 · Scan badge QR to check meal status</p>

      {scanning && !loading && (
        <QrScanner onScan={handleScan} active={scanning} />
      )}

      {loading && (
        <div className="flex items-center justify-center h-48 text-blue-300 text-lg animate-pulse">
          查询中 Loading…
        </div>
      )}

      {result && !loading && (
        <>
          {'error' in result ? (
            <ResultBanner
              name="未找到 Not Found"
              status="error"
              message={result.error}
              onDismiss={reset}
            />
          ) : (
            <>
              <ResultBanner
                name={`ID: ${result.uid}`}
                status="ok"
                message={`家庭编号 Household #${result.data.householdId}`}
                onDismiss={reset}
              />

              {result.data.mealPlans?.length > 0 && (
                <div className="bg-blue-900 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-xs text-blue-300">餐食套餐 Meal Plans</p>
                  {result.data.mealPlans.map((plan) => (
                    <div key={plan.mealId} className="text-sm border-b border-blue-800 last:border-0 pb-2 last:pb-0">
                      <div className="flex justify-between">
                        <span className="font-medium">{plan.description}</span>
                        <span className="text-blue-400 text-xs">{mealTypeLabel(plan.locationId)}</span>
                      </div>
                      <div className="flex gap-3 text-xs mt-1 text-blue-300">
                        <span>已订 {plan.mealOrdered}</span>
                        <span>已取 {plan.mealTaken}</span>
                        <span className={plan.mealRemaining > 0 ? 'text-green-400' : 'text-gray-500'}>
                          剩余 {plan.mealRemaining}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
