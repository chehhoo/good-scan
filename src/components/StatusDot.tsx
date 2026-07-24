import { useState } from 'react'

interface StatusDotProps {
  online: boolean
  pendingCount: number
  lastSyncAt: Date | null
  onSync: () => Promise<void>
}

export default function StatusDot({ online, pendingCount, lastSyncAt, onSync }: StatusDotProps) {
  const [syncing, setSyncing] = useState(false)

  const stale = lastSyncAt
    ? Date.now() - lastSyncAt.getTime() > 30 * 60 * 1000
    : true

  let color: string
  let label: string

  if (!online) {
    color = 'bg-yellow-400'
    label = pendingCount > 0 ? `离线 ${pendingCount} 待同步` : '离线 Offline'
  } else if (stale) {
    color = syncing ? 'bg-yellow-400 animate-pulse' : 'bg-red-500'
    label = syncing ? '同步中…' : '缓存过期 · 点击同步'
  } else {
    color = 'bg-green-400'
    label = '在线 Online'
  }

  const tappable = online && stale && !syncing

  const handleTap = async () => {
    if (!tappable) return
    setSyncing(true)
    try {
      await onSync()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      onClick={handleTap}
      disabled={!tappable}
      className={`flex items-center gap-1.5 text-xs text-white/70 rounded-full px-2 py-1 -mr-2 transition-colors ${
        tappable ? 'active:bg-blue-800 cursor-pointer' : 'cursor-default'
      }`}
    >
      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />
      <span>{label}</span>
    </button>
  )
}
