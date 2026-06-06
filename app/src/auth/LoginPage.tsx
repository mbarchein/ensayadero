import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${import.meta.env.VITE_APP_URL}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else navigate('/', { replace: true })
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-violet-50 p-6">
      <div className="flex flex-col items-center gap-2">
        <img src="/icons/icon-192.png" alt="" className="h-20 w-20 rounded-2xl shadow-lg" />
        <h1 className="text-3xl font-bold text-violet-900">Ensayo</h1>
        <p className="text-center text-sm text-violet-700">{t('login.tagline')}</p>
      </div>

      <button
        onClick={signInWithGoogle}
        className="flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-white px-6 py-3 font-medium shadow-md transition hover:shadow-lg"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
        </svg>
        {t('login.googleButton')}
      </button>

      <div className="flex w-full max-w-xs items-center gap-3 text-xs text-violet-400">
        <span className="h-px flex-1 bg-violet-200" />
        {t('login.or')}
        <span className="h-px flex-1 bg-violet-200" />
      </div>

      <form onSubmit={signInWithPassword} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder={t('login.emailPlaceholder')}
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder={t('login.passwordPlaceholder')}
          autoComplete="current-password"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-violet-600 py-2.5 font-medium text-white shadow-md transition hover:bg-violet-700 disabled:opacity-60"
        >
          {loading ? t('login.signingIn') : t('login.loginButton')}
        </button>
      </form>

      <div className="flex w-full max-w-xs items-center justify-between text-sm text-violet-700">
        <Link to="/signup" className="underline">
          {t('login.signupLink')}
        </Link>
        <Link to="/forgot-password" className="underline">
          {t('login.forgotLink')}
        </Link>
      </div>
    </main>
  )
}
