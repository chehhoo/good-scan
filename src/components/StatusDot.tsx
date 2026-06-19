interface StatusDotProps {
  online: boolean
  pendingCount: number
  lastSyncAt: Date | null
}

export default function StatusDot({ online, pendingCount, lastSyncAt }: StatusDotProps) {
  const stale = lastSyncAt
    ? Date.now() - lastSyncAt.getTime() > 30 * 60 * 1000
    : true

  let color: string
  let label: string

  if (!online) {
    color = 'bg-yellow-400'
    label = pendingCount > 0 ? `离线 ${pendingCount} 待同步` : '离线 Offline'
  } else if (stale) {
    color = 'bg-red-500'
    label = '缓存过期 Cache stale'
  } else {
    color = 'bg-green-400'
    label = '在线 Online'
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-white/70">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}
