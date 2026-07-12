import { useState, useCallback, useRef } from 'react'
import QrScanner from '../components/QrScanner'
import { db, lookupByUid } from '../db/localDb'
import { syncApi } from '../api/client'

interface CheckInResult {
  uid: string
  name: string
  alreadyCheckedIn: boolean
  checkinTime: string   // ISO string
}

export default function CheckIn({ manualEntryEnabled }: { manualEntryEnabled: boolean }) {
  const [scanning, setScanning] = useState(true)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [manualUid, setManualUid] = useState('')
  const [listening, setListening] = useState(false)
  const manualInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const handleScan = useCallback(async (uid: string) => {
    if (loading) return
    setScanning(false)
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Check local cache first for name
      const local = await lookupByUid(uid)
      if (!local) {
        setError('未找到此人 Person not found — 请先同步 Please sync first')
        setLoading(false)
        return
      }
      const { profile } = local
      const name = profile.cnName || `${profile.firstName} ${profile.lastName}`

      // Always call API — it's the source of truth for check-in status
      const res = await syncApi.checkIn(uid)
      if (!res.data.success) {
        setError(res.data.error ?? '报到失败 Check-in failed')
        setLoading(false)
        return
      }

      // Update local cache
      await db.profiles.update(profile.id, { checkinTime: res.data.checkinTime })

      setResult({
        uid,
        name: res.data.name || name,
        alreadyCheckedIn: res.data.alreadyCheckedIn,
        checkinTime: res.data.checkinTime,
      })
    } catch (e) {
      setError('系统错误 System error: ' + String(e))
    } finally {
      setLoading(false)
    }
  }, [loading])

  const submitManualUid = useCallback(() => {
    const uid = manualUid.trim()
    if (!uid) return
    setManualUid('')
    handleScan(uid)
  }, [manualUid, handleScan])

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('此浏览器不支持语音识别 Voice recognition not supported')
      return
    }
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null }
    const rec = new SpeechRecognition()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    recognitionRef.current = rec
    setListening(true)
    rec.onresult = (e) => {
      const numeric = e.results[0][0].transcript.replace(/\D/g, '')
      setListening(false)
      if (numeric) handleScan(numeric)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
  }

  const reset = () => {
    setResult(null)
    setError(null)
    setScanning(true)
    setManualUid('')
    setTimeout(() => manualInputRef.current?.focus(), 100)
  }

  return (
    <div className="min-h-full flex flex-col">
      {scanning && !loading && (
        <div className="flex flex-col flex-1">
          <QrScanner onScan={handleScan} active={scanning} />
          {manualEntryEnabled && (
            <div className="p-3 border-t border-blue-800 flex gap-2">
              <input
                ref={manualInputRef}
                type="text"
                className="flex-1 bg-blue-900 border border-blue-700 rounded-lg px-3 py-2 text-sm font-mono placeholder-blue-500 focus:outline-none focus:border-blue-400"
                placeholder="手动输入 Person ID"
                value={manualUid}
                onChange={(e) => setManualUid(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitManualUid()}
              />
              <button
                onClick={submitManualUid}
                disabled={!manualUid.trim()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded-lg text-sm font-semibold transition-colors"
              >
                查询 Go
              </button>
              <button
                onClick={startVoice}
                disabled={listening}
                className={`px-3 py-2 rounded-lg text-lg transition-colors ${listening ? 'bg-red-600 animate-pulse' : 'bg-blue-700 hover:bg-blue-600'}`}
              >
                🎤
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-48 text-blue-300 text-lg animate-pulse">
          报到中 Checking in…
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col gap-4 p-4">
          <div className="bg-red-700 rounded-xl px-4 py-5 text-center">
            <p className="text-xl font-bold">✗ 报到失败 Check-In Failed</p>
            <p className="text-sm mt-1 text-red-200">{error}</p>
          </div>
          <button onClick={reset} className="w-full py-4 bg-blue-700 hover:bg-blue-600 rounded-xl text-lg font-bold">
            重试 Try Again
          </button>
        </div>
      )}

      {result && !loading && (
        <div className="flex flex-col gap-4 p-4">
          {/* Status banner */}
          <div className={`rounded-xl px-4 py-6 text-center ${result.alreadyCheckedIn ? 'bg-yellow-600' : 'bg-green-600'}`}>
            <p className="text-3xl font-black mb-1">
              {result.alreadyCheckedIn ? '⚠ 已报到' : '✓ 报到成功!'}
            </p>
            <p className="text-sm">
              {result.alreadyCheckedIn ? 'Already checked in' : 'Check-In Successful'}
            </p>
          </div>

          {/* Name + timestamp */}
          <div className="bg-blue-900 rounded-xl px-4 py-5 text-center flex flex-col gap-3">
            <p className="text-4xl font-black tracking-wide">{result.name}</p>
            <div className="flex flex-col items-center gap-0.5">
              <p className="text-blue-400 text-xs uppercase tracking-widest">报到时间 Check-In Time</p>
              <p className="text-white text-2xl font-bold tabular-nums">
                {formatCheckinTime(result.checkinTime)}
              </p>
              <p className="text-blue-400 text-xs">{formatCheckinDate(result.checkinTime)}</p>
            </div>
          </div>

          {/* Scan next */}
          <button onClick={reset} className="w-full py-4 bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl text-lg font-bold transition-colors">
            扫描下一位 Scan Next
          </button>
        </div>
      )}
    </div>
  )
}

function parseCheckinTime(iso: string): Date {
  // Server returns LocalDateTime without timezone (e.g. "2026-07-12T05:11:22") — treat as UTC
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z')
}

function formatCheckinTime(iso: string): string {
  return parseCheckinTime(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatCheckinDate(iso: string): string {
  return parseCheckinTime(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}
