import { useState, useEffect } from 'react'
import { authApi } from '../api/client'

interface Props {
  onLogin: (token: string) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-submit if ?code= is in the URL (QR code / magic link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlCode = params.get('code')
    if (urlCode) {
      setCode(urlCode)
      submit(urlCode)
    }
  }, [])

  async function submit(value?: string) {
    const accessCode = (value ?? code).trim()
    if (!accessCode) return
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.volunteerLogin(accessCode)
      localStorage.setItem('token', res.data.token)
      // Remove ?code= from URL so refreshing doesn't re-submit
      window.history.replaceState({}, '', window.location.pathname)
      onLogin(res.data.token)
    } catch {
      setError('密码不对 Invalid access code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-blue-950 text-white px-8 gap-8">
      <div className="flex flex-col items-center gap-2">
        <img src="/logo.svg" alt="Good Vessel" className="w-16 h-16 rounded-2xl" />
        <span className="text-xs text-blue-300 tracking-widest uppercase">Good Vessel · 好器皿</span>
        <h1 className="text-2xl font-bold">志愿者登录 Volunteer Login</h1>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          placeholder="输入活动码 Enter access code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full px-4 py-4 text-xl text-center rounded-xl bg-blue-900 border border-blue-700 placeholder-blue-500 focus:outline-none focus:border-blue-400 tracking-widest"
          disabled={loading}
          autoFocus
        />

        {error && (
          <p className="text-center text-red-400 text-sm">{error}</p>
        )}

        <button
          onClick={() => submit()}
          disabled={loading || !code.trim()}
          className="w-full py-4 text-lg font-bold rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '验证中…' : '登录 Login'}
        </button>
      </div>

      <p className="text-blue-400 text-xs text-center">
        联系活动负责人获取活动码
        <br />
        Contact event admin for the access code
      </p>
    </div>
  )
}
