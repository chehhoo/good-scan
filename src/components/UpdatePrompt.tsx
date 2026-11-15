import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface Props {
  isScanning: boolean
}

/**
 * Shows a dismissible banner when a new service worker is waiting.
 * Auto-reloads after 30s when the app is idle (no active QR scan result shown).
 * While a scan result is displayed, holds off so the volunteer can read it.
 */
export default function UpdatePrompt({ isScanning }: Props) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!needRefresh) return
    if (isScanning) {
      // Cancel any pending auto-reload while a scan result is shown
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      return
    }
    // Schedule auto-reload after 30s of idle
    timerRef.current = setTimeout(() => updateServiceWorker(true), 30_000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [needRefresh, isScanning])

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-blue-800 border border-blue-600 px-4 py-3 shadow-xl">
      <span className="text-sm text-blue-100">
        新版本可用 · 30秒後自動更新 Update available
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setNeedRefresh(false)}
          className="text-xs text-blue-400 px-2 py-1"
        >
          稍後 Later
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl"
        >
          重載 Reload
        </button>
      </div>
    </div>
  )
}
