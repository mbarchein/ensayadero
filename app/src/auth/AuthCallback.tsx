import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { PENDING_JOIN_KEY } from '../features/groups/JoinPage'

export default function AuthCallback() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // supabase-js processes the hash/code automatically; we wait for the session
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        const params = new URLSearchParams(window.location.search + window.location.hash.replace('#', '&'))
        const desc = params.get('error_description') ?? error?.message
        setError(desc ?? null)
        if (!desc) navigate('/login', { replace: true })
        return
      }
      // resume join by code if it was started from a /join/:code link
      const pending = localStorage.getItem(PENDING_JOIN_KEY)
      if (pending) {
        localStorage.removeItem(PENDING_JOIN_KEY)
        navigate(`/join/${pending}`, { replace: true })
        return
      }
      navigate('/', { replace: true })
    })
  }, [navigate])

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <p className="max-w-sm text-center text-red-600">{error}</p>
        <button onClick={() => navigate('/login')} className="text-violet-700 underline">
          {t('common.back')}
        </button>
      </main>
    )
  }
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="animate-pulse text-violet-600">{t('login.entering')}</p>
    </main>
  )
}
