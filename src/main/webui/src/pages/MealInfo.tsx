import { useState, useEffect } from 'react'
import { scanApi, type Meal, type Venue } from '../api/client'

interface MealWithCount extends Meal {
  count: number
}

export default function MealInfo() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<number>(1)
  const [meals, setMeals] = useState<MealWithCount[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = async (venueId: number) => {
    setLoading(true)
    try {
      const infoRes = await scanApi.mealInfo(venueId)
      const mealList = infoRes.data.meals
      const withCounts = await Promise.all(
        mealList.map(async (m) => {
          const countRes = await scanApi.mealCount(m.id)
          return { ...m, count: countRes.data.count }
        })
      )
      setMeals(withCounts)
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    scanApi.venues().then((r) => setVenues(r.data))
  }, [])

  useEffect(() => {
    load(selectedVenue)
  }, [selectedVenue])

  const mealTypeLabel = (type: number) => {
    switch (type) {
      case 1: return '早餐 Breakfast'
      case 2: return '午餐 Lunch'
      case 3: return '晚餐 Dinner'
      default: return 'Other'
    }
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex gap-2 items-center">
        <select
          className="flex-1 bg-blue-900 border border-blue-700 rounded-lg px-3 py-2 text-sm"
          value={selectedVenue}
          onChange={(e) => setSelectedVenue(Number(e.target.value))}
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          onClick={() => load(selectedVenue)}
          disabled={loading}
          className="bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          刷新 Refresh
        </button>
      </div>

      {lastRefresh && (
        <p className="text-xs text-blue-400 text-center">
          更新于 Updated: {lastRefresh.toLocaleTimeString('zh-CN')}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-blue-300 animate-pulse">
          加载中 Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {meals.length === 0 && (
            <p className="text-center text-blue-400 text-sm py-8">暂无餐食 No meals found</p>
          )}
          {meals.map((meal) => (
            <div key={meal.id} className="bg-blue-900 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{meal.name}</p>
                  <p className="text-xs text-blue-300 mt-0.5">{mealTypeLabel(meal.type)} · {meal.date}</p>
                  <p className="text-xs text-blue-400">
                    {meal.startTime?.slice(0, 5)} – {meal.endTime?.slice(0, 5)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-400">{meal.count}</p>
                  <p className="text-xs text-blue-400">已取 served</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
