import { useState } from 'react'
import MealScan from './pages/MealScan'
import CheckIn from './pages/CheckIn'
import MealInfo from './pages/MealInfo'

type Tab = 'meal' | 'checkin' | 'info'

export default function App() {
  const [tab, setTab] = useState<Tab>('meal')

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
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
