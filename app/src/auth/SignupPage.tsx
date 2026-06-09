import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Turnstile, { captchaEnabled } from './Turnstile'

export default function SignupPage() {
  const { t, i18n } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (captchaEnabled && !captchaToken) {
      setError(t('signup.captchaRequired'))
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // lang drives the language of auth + notification emails
        data: { full_name: name, lang: i18n.language?.startsWith('en') ? 'en' : 'es' },
        emailRedirectTo: `${import.meta.env.VITE_APP_URL}/auth/callback`,
        captchaToken: captchaToken ?? undefined,
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      setCaptchaToken(null)
      setCaptchaKey((k) => k + 1) // single-use token → refresh the widget
    } else setSent(true)
  }

  if (sent) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-violet-50 p-6 text-center">
        <MailCheck className="h-12 w-12 text-violet-600" />
        <h1 className="text-xl font-bold text-violet-900">{t('signup.checkEmailTitle')}</h1>
        <p className="max-w-xs text-sm text-violet-700">{t('signup.checkEmailBody', { email })}</p>
        <Link to="/login" className="text-sm text-violet-700 underline">
          {t('signup.backToLogin')}
        </Link>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-violet-50 p-6">
      <div className="flex flex-col items-center gap-2">
        <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-2xl shadow-lg" />
        <h1 className="text-2xl font-bold text-violet-900">{t('signup.title')}</h1>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder={t('signup.namePlaceholder')}
          autoComplete="name"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder={t('signup.emailPlaceholder')}
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder={t('signup.passwordPlaceholder')}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-violet-600 py-2.5 font-medium text-white shadow-md transition hover:bg-violet-700 disabled:opacity-60"
        >
          {loading ? t('signup.creating') : t('signup.createButton')}
        </button>
      </form>
      <Link to="/login" className="text-sm text-violet-700 underline">
        {t('signup.haveAccount')}
      </Link>
    </main>
  )
}
