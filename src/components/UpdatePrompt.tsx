import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Shows a dismissible banner when a new service worker is waiting.
 * Does NOT auto-reload — volunteers may be displaying a QR badge when the
 * update fires, so the reload must be a deliberate user action.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-blue-800 border border-blue-600 px-4 py-3 shadow-xl">
      <span className="text-sm text-blue-100">
        新版本可用 Update available
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
