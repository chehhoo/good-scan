import { useState, useEffect } from 'react'

const INSTALLED_KEY = 'gs_pwa_installed'

// iOS device detection — covers iPadOS 13+ which reports MacIntel
function isIosDevice(): boolean {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  // iPadOS 13+ desktop-mode UA: platform=MacIntel with touch points
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  return false
}

// iOS but NOT in Safari — user needs to switch to Safari to install
function isIosNonSafari(): boolean {
  if (!isIosDevice()) return false
  const ua = navigator.userAgent
  return /CriOS|FxiOS|EdgiOS|FBAN|FBAV|Line\/|Instagram|Snapchat/i.test(ua)
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export type InstallState =
  | 'installed'       // already installed as PWA
  | 'ios-safari'      // iOS Safari — show manual Add to Home Screen prompt
  | 'ios-other'       // iOS non-Safari — tell user to open in Safari
  | 'prompt-ready'    // browser fired beforeinstallprompt — can show native prompt
  | 'not-applicable'  // desktop or unsupported — nothing to show

interface UsePwaInstallResult {
  installState: InstallState
  promptInstall: (() => Promise<void>) | null
}

export function usePwaInstall(): UsePwaInstallResult {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [installState, setInstallState] = useState<InstallState>(() => {
    if (isInStandaloneMode()) return 'installed'
    try { if (localStorage.getItem(INSTALLED_KEY) === '1') return 'installed' } catch { /* ignore */ }
    if (isIosNonSafari()) return 'ios-other'
    if (isIosDevice()) return 'ios-safari'
    return 'not-applicable'
  })

  useEffect(() => {
    // Persist confirmed-installed flag
    const onInstalled = () => {
      try { localStorage.setItem(INSTALLED_KEY, '1') } catch { /* ignore */ }
      setInstallState('installed')
    }
    window.addEventListener('appinstalled', onInstalled)

    // Capture Chrome/Edge install prompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setInstallState((prev) =>
        prev === 'installed' ? 'installed' : 'prompt-ready'
      )
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    return () => {
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    }
  }, [])

  const promptInstall = deferredPrompt
    ? async () => {
        const prompt = deferredPrompt as BeforeInstallPromptEvent
        prompt.prompt()
        const { outcome } = await prompt.userChoice
        if (outcome === 'accepted') {
          try { localStorage.setItem(INSTALLED_KEY, '1') } catch { /* ignore */ }
          setInstallState('installed')
        }
        setDeferredPrompt(null)
      }
    : null

  return { installState, promptInstall }
}

// BeforeInstallPromptEvent is not in standard lib types
interface BeforeInstallPromptEvent extends Event {
  prompt(): void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
