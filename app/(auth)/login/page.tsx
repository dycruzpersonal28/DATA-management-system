'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react'

const inputCls = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:border-transparent transition-all'
const focusTeal = 'focus:ring-[#5DCAA5]'

// ── PIN pad for PIN login mode ────────────────────────────────────────────────
function PinPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
  const MAX = 6

  const press = (k: string) => {
    if (k === '⌫') { onChange(value.slice(0, -1)); return }
    if (k === '') return
    if (value.length < MAX) onChange(value + k)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Dots */}
      <div className="flex gap-2.5">
        {Array.from({ length: MAX }).map((_, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full border-2 transition-all duration-150"
            style={i < value.length
              ? { background: '#257cd7ed', borderColor: '#257cd7ed', transform: 'scale(1.15)' }
              : { background: 'transparent', borderColor: '#d1d5db' }
            }
          />
        ))}
      </div>
      {/* Keys */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => press(k)}
            disabled={k === ''}
            className={`w-16 h-12 rounded-xl text-base font-semibold transition-all duration-100 select-none
              ${k === ''
                ? 'invisible'
                : k === '⌫'
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95'
                : 'bg-white border border-gray-200 text-gray-900 active:scale-95 shadow-sm'
              }`}
            style={k !== '' && k !== '⌫' ? {} : {}}
            onMouseEnter={e => { if (k !== '' && k !== '⌫') (e.currentTarget as HTMLButtonElement).style.borderColor = '#5DCAA5' }}
            onMouseLeave={e => { if (k !== '' && k !== '⌫') (e.currentTarget as HTMLButtonElement).style.borderColor = '' }}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const logoUrl = '/Capture.jpg'

  // mode: 'password' | 'pin'
  const [mode, setMode]               = useState<'password' | 'pin'>('password')

  // Password login state
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // PIN login state
  const [pinEmail, setPinEmail]       = useState('')
  const [pin, setPin]                 = useState('')

  const [loading, setLoading]         = useState(false)

  // ── Password login ────────────────────────────────────────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error('Invalid email or password')
      setLoading(false)
    } else {
      router.refresh()
      router.push('/dashboard')
    }
  }

  // ── PIN login ─────────────────────────────────────────────────────────────
  async function handlePinSubmit() {
    if (pin.length < 4) { toast.error('Enter your PIN'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/pin-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: pinEmail || undefined, pin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invalid PIN')
      // Server sets the session cookie — just redirect
      router.refresh()
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Invalid PIN')
      setPin('')
      setLoading(false)
    }
  }

  // Auto-submit when 6 digits entered
  const handlePinChange = (v: string) => {
    setPin(v)
    if (v.length === 6) {
      setTimeout(() => handlePinSubmitWithValue(v), 120)
    }
  }

  async function handlePinSubmitWithValue(pinValue: string) {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/pin-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: pinEmail || undefined, pin: pinValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invalid PIN')
      router.refresh()
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Invalid PIN')
      setPin('')
      setLoading(false)
    }
  }

  const switchMode = (m: 'password' | 'pin') => {
    setMode(m)
    setPin('')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#f4f7f6', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── Left panel — branding ── */}
      <div
        className="hidden lg:flex w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #035ebfed 0%, #257cd7ed 100%)' }}
      >
        {/* Background circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-20 w-[28rem] h-[28rem] rounded-full bg-white/5" />
        <div className="absolute top-1/3 -right-16 w-64 h-64 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col items-center text-center gap-6">
          <div className="w-24 h-24 rounded-full bg-white/15 border border-white/20 flex items-center justify-center shadow-xl overflow-hidden">
            <img src={logoUrl} alt="THB Manila" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">THB Manila</h1>
            <p className="mt-2 text-base" style={{ color: '#77b9ffed' }}>Point of Sale Management System</p>
          </div>
          <div className="mt-6 flex flex-col gap-3 w-full max-w-xs">
            {['Fast & reliable POS', 'Real-time inventory', 'Shift & staff tracking'].map(f => (
              <div key={f} className="flex items-center gap-3 rounded-xl px-4 py-2.5 bg-white/10">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#9FE1CB' }} />
                <span className="text-sm" style={{ color: '#a0d1f4' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg overflow-hidden">
              <img src={logoUrl} alt="THB Manila" className="w-full h-full object-cover" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900">THB Manila</h1>
              <p className="text-sm text-gray-400 mt-0.5">Point of Sale System</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-sm text-gray-400 mt-1">Sign in to continue</p>
          </div>

          {/* Mode toggle tabs */}
          <div className="flex rounded-xl border border-gray-200 bg-white p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => switchMode('password')}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
              style={mode === 'password'
                ? { background: '#035ebfed', color: 'white' }
                : { color: '#6b7280' }
              }
            >
              <Mail className="w-3.5 h-3.5" />
              Email & Password
            </button>
            <button
              type="button"
              onClick={() => switchMode('pin')}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
              style={mode === 'pin'
                ? { background: '#0F6E56', color: 'white' }
                : { color: '#6b7280' }
              }
            >
              <KeyRound className="w-3.5 h-3.5" />
              PIN Login
            </button>
          </div>

          {/* ── Password form ── */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={`${inputCls} ${focusTeal}`}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={`${inputCls} ${focusTeal} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 mt-2 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.98]"
                style={{ background: '#0F6E56' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#0D6B58' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0F6E56' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : 'Sign in'}
              </button>
            </form>
          )}

          {/* ── PIN form ── */}
          {mode === 'pin' && (
            <div className="flex flex-col items-center gap-4">
              {/* Optional email for disambiguation */}
              <div className="w-full space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Email <span className="text-gray-400 font-normal">(optional — required if PIN is shared)</span>
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={pinEmail}
                  onChange={e => setPinEmail(e.target.value)}
                  autoComplete="email"
                  className={`${inputCls} ${focusTeal}`}
                />
              </div>

              <p className="text-sm text-gray-400">Enter your 6-digit PIN</p>

              <PinPad value={pin} onChange={handlePinChange} />

              <button
                type="button"
                onClick={() => handlePinSubmitWithValue(pin)}
                disabled={pin.length < 4 || loading}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 active:scale-[0.98] shadow-sm"
                style={{ background: '#0F6E56' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Verifying…
                  </span>
                ) : 'Sign in with PIN'}
              </button>
            </div>
          )}

          {/* Footer note */}
          <p className="text-center text-xs text-gray-400 mt-8">
            THB Manila POS · Staff access only
          </p>
        </div>
      </div>
    </div>
  )
}
