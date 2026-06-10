import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { PasswordInput } from '../components/ui'
import { PASSWORD_MIN } from './SignupPage'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // supabase-js processes the recovery token from the URL hash on load and emits
  // PASSWORD_RECOVERY; a session may also already be established.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      const weak = error as { code?: string; reasons?: string[] }
      if (weak.code === 'weak_password') {
        setError(
          weak.reasons?.includes('pwned')
            ? t('signup.passwordPwned')
            : t('signup.passwordTooShort', { min: PASSWORD_MIN }),
        )
      } else setError(error.message)
    }
    else {
      setDone(true)
      setTimeout(() => navigate('/', { replace: true }), 1500)
    }
  }

  if (done) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-violet-50 p-6 text-center">
        <p className="text-violet-900">{t('reset.done')}</p>
      </main>
    )
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-violet-50 p-6 text-center">
        <p className="max-w-xs text-sm text-violet-700">{t('reset.invalidLink')}</p>
        <Link to="/forgot-password" className="text-sm text-violet-700 underline">
          {t('reset.requestAgain')}
        </Link>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-violet-50 p-6">
      <h1 className="text-2xl font-bold text-violet-900">{t('reset.title')}</h1>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder={t('reset.newPasswordPlaceholder')}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-violet-600 py-2.5 font-medium text-white shadow-md transition hover:bg-violet-700 disabled:opacity-60"
        >
          {loading ? t('reset.saving') : t('reset.saveButton')}
        </button>
      </form>
    </main>
  )
}
