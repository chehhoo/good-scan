import { useState } from 'react'
import { usePwaInstall } from '../hooks/usePwaInstall'

/**
 * Shows an install prompt at the bottom of the login screen.
 *
 * - prompt-ready  → "Add to Home Screen" button (Chrome/Edge native prompt)
 * - ios-safari    → manual Add to Home Screen instructions
 * - ios-other     → "please open in Safari" message
 * - installed     → green confirmed badge (dismissible)
 * - not-applicable→ renders nothing
 */
export default function InstallBanner() {
  const { installState, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  if (installState === 'installed') {
    return (
      <div className="flex items-center justify-between gap-3 w-full max-w-xs px-4 py-3 rounded-xl bg-green-900/60 border border-green-700 text-green-300 text-sm">
        <span>✓ 已安裝 Installed</span>
        <button onClick={() => setDismissed(true)} className="text-green-600 text-xs">關閉</button>
      </div>
    )
  }

  if (installState === 'ios-other') {
    return (
      <div className="flex flex-col gap-2 w-full max-w-xs px-4 py-3 rounded-xl bg-yellow-900/50 border border-yellow-700 text-yellow-200 text-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold">請用 Safari 開啟</span>
          <button onClick={() => setDismissed(true)} className="text-yellow-600 text-xs shrink-0">關閉</button>
        </div>
        <p className="text-xs text-yellow-300 leading-relaxed">
          iOS 裝置需在 Safari 中安裝 PWA。
          請複製網址，在 Safari 中開啟後點擊「加入主畫面」。
          <br />
          <span className="text-yellow-400">Open this page in Safari to install it on your home screen.</span>
        </p>
      </div>
    )
  }

  if (installState === 'ios-safari') {
    return (
      <div className="flex flex-col gap-2 w-full max-w-xs px-4 py-3 rounded-xl bg-blue-900/60 border border-blue-700 text-blue-200 text-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold">安裝到主畫面 Add to Home Screen</span>
          <button onClick={() => setDismissed(true)} className="text-blue-500 text-xs shrink-0">稍後</button>
        </div>
        <p className="text-xs text-blue-300 leading-relaxed">
          點擊底部的分享按鈕 <span className="font-bold">⎦</span>，然後選擇「加入主畫面」。
          <br />
          <span className="text-blue-400">Tap the share icon below, then "Add to Home Screen".</span>
        </p>
      </div>
    )
  }

  if (installState === 'prompt-ready' && promptInstall) {
    return (
      <div className="flex items-center justify-between gap-3 w-full max-w-xs px-4 py-3 rounded-xl bg-blue-900/60 border border-blue-700 text-sm">
        <span className="text-blue-200">安裝到主畫面 Add to Home Screen</span>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setDismissed(true)} className="text-blue-500 text-xs">稍後</button>
          <button
            onClick={promptInstall}
            className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg"
          >
            安裝 Install
          </button>
        </div>
      </div>
    )
  }

  return null
}
