import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // Resistencia a enumeración: NO ramificamos la UI según exista o no la
    // cuenta ni mostramos el error del backend. GoTrue ya responde igual en
    // ambos casos; aquí mostramos siempre la misma pantalla neutra. Los
    // errores reales (rate limit) se silencian a propósito para no filtrar.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_URL}/reset-password`,
    })
    setLoading(false)
    setSent(true)
  }

  if (sent) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-violet-50 p-6 text-center">
        <MailCheck className="h-12 w-12 text-violet-600" />
        <h1 className="text-xl font-bold text-violet-900">{t('forgot.sentTitle')}</h1>
        <p className="max-w-xs text-sm text-violet-700">{t('forgot.sentBody', { email })}</p>
        <Link to="/login" className="text-sm text-violet-700 underline">
          {t('forgot.backToLogin')}
        </Link>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-violet-50 p-6">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-bold text-violet-900">{t('forgot.title')}</h1>
        <p className="max-w-xs text-center text-sm text-violet-700">{t('forgot.hint')}</p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder={t('forgot.emailPlaceholder')}
          autoComplete="email"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-violet-600 py-2.5 font-medium text-white shadow-md transition hover:bg-violet-700 disabled:opacity-60"
        >
          {loading ? t('forgot.sending') : t('forgot.sendButton')}
        </button>
      </form>
      <Link to="/login" className="text-sm text-violet-700 underline">
        {t('forgot.backToLogin')}
      </Link>
    </main>
  )
}
