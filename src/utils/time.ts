export function prettyTime(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1)  return '剛剛 just now'
  if (diffMin < 60) return `${diffMin} 分鐘前`
  const hhmm = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (new Date().toDateString() === d.toDateString()) return `今天 ${hhmm}`
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) + ' ' + hhmm
}
