// File: app/auth/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import axios from 'axios'

import Logo from '@/app/Images/Ungu__1_-removebg-preview.png'

export default function AuthPage() {
  const tIn = useTranslations('signin')
  const tUp = useTranslations('signup')
  const router = useRouter()

  type Mode = 'signin' | 'signup'
  const [mode, setMode] = useState<Mode>('signin')

  const [error, setError] = useState<string | null>(null)

  // signin
  const [siEmailOrUsername, setSiEmailOrUsername] = useState('')
  const [siPw, setSiPw] = useState('')
  const [siShow, setSiShow] = useState(false)
  const [siBusy, setSiBusy] = useState(false)

  // signup
  const [suName, setSuName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPw, setSuPw] = useState('')
  const [suConfirm, setSuConfirm] = useState('')
  const [suShow, setSuShow] = useState(false)
  const [suShowC, setSuShowC] = useState(false)
  const [suAgree, setSuAgree] = useState(false)
  const [suBusy, setSuBusy] = useState(false)

  const suStrong =
    suPw.length >= 8 &&
    /[A-Z]/.test(suPw) &&
    /[a-z]/.test(suPw) &&
    /[0-9]/.test(suPw)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  function redirectToDashboard() {
    router.push('/dashboard')
    router.refresh()
  }

  function looksLikeUser(obj: any) {
    if (!obj || typeof obj !== 'object') return false
    if (obj.id || obj._id || obj.email || obj.username || obj.role) return true
    return false
  }

  function deepFindUser(x: any, seen = new WeakSet()): any | null {
    if (x == null || typeof x !== 'object') return null
    try {
      if (seen.has(x)) return null
      seen.add(x)
    } catch {}
    if (looksLikeUser(x)) return x
    if (Array.isArray(x)) {
      for (const it of x) {
        const f = deepFindUser(it, seen)
        if (f) return f
      }
      return null
    }
    for (const k of Object.keys(x)) {
      try {
        const v = x[k]
        if (looksLikeUser(v)) return v
        if (typeof v === 'object') {
          const f = deepFindUser(v, seen)
          if (f) return f
        }
      } catch {}
    }
    return null
  }

  function extractUserFromResponse(data: any) {
    if (!data) return null
    const fast = data.data ?? data.user ?? data
    if (looksLikeUser(fast)) return fast
    const found = deepFindUser(data)
    if (found) return found
    return null
  }

  // --------------------------------------
  // Simplified redirect: always to dashboard
  // --------------------------------------
  function redirectByRole(u: any) {
    router.push('/dashboard')
  }

  // ===========================
  // onSignin (user-only)
  // ===========================
  async function onSignin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSiBusy(true)
    setError(null)

    const payload = {
      usernameOrEmail: siEmailOrUsername.trim(),
      password: siPw,
    }

    try {
      const res = await axios.post(`/auth/signin`, payload, {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status) => status >= 200 && status < 300,
      })
      let user = extractUserFromResponse(res.data)

      // fallback GET /auth/me
      if (!user) {
        try {
          const me = await axios.get(`/auth/me`, { withCredentials: true })
          user = extractUserFromResponse(me.data)
        } catch {}
      }

      if (user) {
        redirectByRole(user)
      } else {
        setError(tIn('error.default') || 'Signin failed')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || tIn('error.default') || 'Signin failed'
      setError(msg)
    } finally {
      setSiBusy(false)
    }
  }

  // ===========================
  // onSignup (user-only)
  // ===========================
  async function onSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!suAgree) {
      setError(tUp('error.agree') || 'Please agree to terms')
      return
    }
    if (suPw !== suConfirm) {
      setError(tUp('error.mismatch') || 'Passwords do not match')
      return
    }

    setSuBusy(true)
    setError(null)

    try {
      const res = await axios.post(
        `/auth/signup`,
        { name: suName.trim(), email: suEmail.trim(), password: suPw },
        { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
      )
      let user = extractUserFromResponse(res.data)

      // fallback GET /auth/me
      if (!user) {
        try {
          const me = await axios.get(`/auth/me`, { withCredentials: true })
          user = extractUserFromResponse(me.data)
        } catch {}
      }

      if (user) {
        redirectToDashboard()
      } else {
        setError(tUp('error.default') || 'Signup failed')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || tUp('error.default') || 'Signup failed'
      setError(msg)
    } finally {
      setSuBusy(false)
    }
  }

  // ===========================
  // Google OAuth
  // ===========================
  const searchParams = useSearchParams()
  const from = searchParams?.get('from')

  useEffect(() => {
    if (from === 'google') {
      ;(async () => {
        setSiBusy(true)
        setError(null)
        try {
          const res = await axios.get(`/auth/me`, { withCredentials: true })
          const user = extractUserFromResponse(res.data)
          if (user) {
            redirectToDashboard()
          } else {
            setError('Google sign-in failed: no user session found.')
          }
        } catch {
          setError('Google sign-in failed.')
        } finally {
          setSiBusy(false)
        }
      })()
    }
  }, [from])

  function startGoogleSignin() {
    window.location.href = `/auth/google`
  }

  return (
    <div className="min-h-[100svh] bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.08),transparent_60%)] from-slate-50 via-white to-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_10px_50px_rgba(2,6,23,0.08)] ring-1 ring-slate-100/60">
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl" />

          <div className="px-8 pt-8 text-center">
            <Image
              src={Logo}
              alt="ArkWork Logo"
              width={96}
              height={96}
              className="mx-auto mb-5 h-20 w-20 object-contain drop-shadow-sm"
              priority
            />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {mode === 'signin' ? tIn('title') : tUp('title')}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {mode === 'signin' ? tIn('subtitle') : tUp('subtitle')}
            </p>

            <div className="mt-6 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 text-sm">
              <button
                onClick={() => switchMode('signin')}
                className={`px-4 py-1.5 rounded-xl transition ${mode === 'signin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                aria-pressed={mode === 'signin'}
              >
                {tIn('form.signInBtn')}
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`px-4 py-1.5 rounded-xl transition ${mode === 'signup' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                aria-pressed={mode === 'signup'}
              >
                {tUp('createBtn')}
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-8 mt-5 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </div>
          )}

          <div className="px-8 pb-8 pt-6">
            {mode === 'signin' ? (
              <form onSubmit={onSignin} noValidate className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">Email / Username</span>
                  <input
                    type="text"
                    value={siEmailOrUsername}
                    onChange={(e) => setSiEmailOrUsername(e.target.value)}
                    required
                    autoComplete="username email"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">{tIn('form.password')}</span>
                  <div className="relative">
                    <input
                      type={siShow ? 'text' : 'password'}
                      value={siPw}
                      onChange={(e) => setSiPw(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-10 text-sm"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setSiShow((v) => !v)}
                      className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-700"
                      tabIndex={-1}
                      aria-label={tIn('form.togglePw')}
                    >
                      {siShow ? '👁️' : '🙈'}
                    </button>
                  </div>
                </label>

                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    {tIn('form.remember')}
                  </label>
                  <Link className="text-sm font-medium text-blue-700 hover:underline" href="/auth/forgot">
                    {tIn('form.forgot')}
                  </Link>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={startGoogleSignin}
                    disabled={siBusy}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <path d="M21.6 12.24c0-.72-.06-1.44-.18-2.12H12v4.02h5.2c-.22 1.2-.88 2.22-1.86 2.9v2.4h3c1.76-1.62 2.76-4.02 2.76-6.98z" fill="#4285F4"/>
                      <path d="M12 22c2.7 0 4.98-.9 6.64-2.46l-3-2.4c-.82.56-1.86.9-3.64.9-2.8 0-5.16-1.86-6-4.38H3v2.76A10 10 0 0012 22z" fill="#34A853"/>
                      <path d="M6 13.06A6.01 6.01 0 016 7.94V5.18H3a10 10 0 000 13.64l3-2.76z" fill="#FBBC05"/>
                      <path d="M12 6.5c1.48 0 2.8.5 3.84 1.5l2.88-2.88C16.96 3.5 14.7 2.5 12 2.5 7.98 2.5 4.56 5 3 8.94l3 2.76C7.12 7.36 9.4 6.5 12 6.5z" fill="#EA4335"/>
                    </svg>

                    {siBusy ? 'Processing...' : (tIn('form.signInWithGoogle') ?? 'Sign in with Google')}
                  </button>
                </div>

                <div className="flex items-center justify-center">
                  <div className="my-3 h-px w-full bg-slate-100" />
                </div>

                <button
                  type="submit"
                  disabled={siBusy}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
                >
                  {siBusy ? (
                    <>
                      <span className="mr-2 inline-block animate-spin">⏳</span>
                      {tIn('form.signingIn')}
                    </>
                  ) : (
                    tIn('form.signInBtn')
                  )}
                </button>

                <p className="mt-6 text-center text-sm text-slate-600">
                  {tIn('noAccount')}{' '}
                  <button type="button" onClick={() => switchMode('signup')} className="font-medium text-blue-700 hover:underline">
                    {tIn('signUp')}
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={onSignup} noValidate className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">{tUp('form.name')}</span>
                  <input
                    value={suName}
                    onChange={(e) => setSuName(e.target.value)}
                    required
                    placeholder={tUp('placeholder.name')}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    autoComplete="name"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">{tUp('form.email')}</span>
                  <input
                    type="email"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder={tUp('placeholder.email')}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">{tUp('form.password')}</span>
                  <div className="relative">
                    <input
                      type={suShow ? 'text' : 'password'}
                      value={suPw}
                      onChange={(e) => setSuPw(e.target.value)}
                      required
                      minLength={8}
                      placeholder={tUp('placeholder.password')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-10 text-sm"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setSuShow((v) => !v)}
                      className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-700"
                      tabIndex={-1}
                      aria-label={tUp('form.togglePw')}
                    >
                      {suShow ? '👁️' : '🙈'}
                    </button>
                  </div>

                  <div className="mt-1 flex items-center gap-2" aria-hidden="true">
                    <div className={`h-1 w-1/3 rounded ${suPw.length >= 6 ? 'bg-amber-400' : 'bg-slate-200'}`} />
                    <div className={`h-1 w-1/3 rounded ${suPw.length >= 8 ? 'bg-amber-500' : 'bg-slate-200'}`} />
                    <div className={`h-1 w-1/3 rounded ${suStrong ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{tUp('password.hint')}</p>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">{tUp('form.confirm')}</span>
                  <div className="relative">
                    <input
                      type={suShowC ? 'text' : 'password'}
                      value={suConfirm}
                      onChange={(e) => setSuConfirm(e.target.value)}
                      required
                      placeholder={tUp('placeholder.confirm')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-10 text-sm"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setSuShowC((v) => !v)}
                      className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-slate-700"
                      tabIndex={-1}
                      aria-label={tUp('form.toggleConfirm')}
                    >
                      {suShowC ? '👁️' : '🙈'}
                    </button>
                  </div>
                  {suConfirm.length > 0 && (
                    <p className={`mt-1 text-xs ${suPw === suConfirm ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {suPw === suConfirm ? tUp('match.ok') : tUp('match.no')}
                    </p>
                  )}
                </label>

                <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={suAgree} onChange={(e) => setSuAgree(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                  {tUp('agree.1')}{' '}
                  <Link href="/terms" className="text-blue-700 hover:underline">
                    {tUp('agree.terms')}
                  </Link>{' '}
                  {tUp('agree.and')}{' '}
                  <Link href="/privacy" className="text-blue-700 hover:underline">
                    {tUp('agree.privacy')}
                  </Link>
                  .
                </label>

                <button type="submit" disabled={suBusy} className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60">
                  {suBusy ? (
                    <>
                      <span className="mr-2 inline-block animate-spin">⏳</span>
                      {tUp('creating')}
                    </>
                  ) : (
                    tUp('createBtn')
                  )}
                </button>

                <p className="mt-6 text-center text-sm text-slate-600">
                  {tUp('haveAccount')}{' '}
                  <button type="button" onClick={() => switchMode('signin')} className="font-medium text-blue-700 hover:underline">
                    {tUp('signIn')}
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
