import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import Turnstile, { captchaEnabled } from './Turnstile'

// Facebook login is shown only when its OAuth credentials are configured.
// Terraform sets VITE_FACEBOOK_ENABLED from facebook_oauth_client_id != "".
const facebookEnabled = import.meta.env.VITE_FACEBOOK_ENABLED === 'true'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  // Map GoTrue's English error strings to localized, friendly messages.
  const errorText = (msg: string) => {
    const m = msg.toLowerCase()
    if (m.includes('invalid login credentials')) return t('login.errInvalidCredentials')
    if (m.includes('email not confirmed')) return t('login.errEmailNotConfirmed')
    if (m.includes('rate limit')) return t('login.errRateLimit')
    return msg
  }

  const signInWithProvider = async (provider: 'google' | 'facebook') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${import.meta.env.VITE_APP_URL}/auth/callback` },
    })
    if (error) setError(errorText(error.message))
  }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (captchaEnabled && !captchaToken) {
      setError(t('login.captchaRequired'))
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    })
    setLoading(false)
    if (error) {
      setError(errorText(error.message))
      setCaptchaToken(null)
      setCaptchaKey((k) => k + 1) // single-use token → refresh the widget
    } else navigate('/', { replace: true })
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-violet-50 p-6">
      <div className="flex flex-col items-center gap-2">
        <img src="/icons/icon-192.png" alt="" className="h-20 w-20 rounded-2xl shadow-lg" />
        <h1 className="text-3xl font-bold text-violet-900">Ensayadero</h1>
        <p className="text-center text-sm text-violet-700">{t('login.tagline')}</p>
      </div>

      <button
        onClick={() => signInWithProvider('google')}
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

      {facebookEnabled && (
        <button
          onClick={() => signInWithProvider('facebook')}
          className="flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-[#1877F2] px-6 py-3 font-medium text-white shadow-md transition hover:shadow-lg"
        >
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden>
            <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z"/>
          </svg>
          {t('login.facebookButton')}
        </button>
      )}

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
        <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700"
          >
            {error}
          </p>
        )}
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

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-violet-400">
        <Link to="/privacy" className="hover:underline">
          {t('privacy.title')}
        </Link>
        <span aria-hidden>·</span>
        <Link to="/legal" className="hover:underline">
          {t('legal.title')}
        </Link>
        <span aria-hidden>·</span>
        <Link to="/cookies" className="hover:underline">
          {t('cookies.title')}
        </Link>
      </div>
    </main>
  )
}
