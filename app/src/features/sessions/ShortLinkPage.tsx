// Resolver for short session links (/s/<code>): redirects members to the full
// session detail route. Lives outside Layout so it can stash the code and send
// logged-out visitors through login first (same pattern as /join/:code).

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui'

export const PENDING_SESSION_KEY = 'pendingSessionCode'

export default function ShortLinkPage() {
  const { t } = useTranslation()
  const { code } = useParams<{ code: string }>()
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [notFound, setNotFound] = useState(false)
  const tried = useRef(false)

  useEffect(() => {
    if (loading || !code || tried.current) return
    tried.current = true
    if (!session) {
      localStorage.setItem(PENDING_SESSION_KEY, code)
      navigate('/login', { replace: true })
      return
    }
    supabase
      .from('sessions')
      .select('id, group_id')
      .eq('short_code', code)
      .maybeSingle()
      .then(({ data }) => {
        if (data) navigate(`/g/${data.group_id}/sessions/${data.id}`, { replace: true })
        else setNotFound(true) // nonexistent code, or RLS: not a member of the group
      })
  }, [loading, session, code, navigate])

  if (notFound) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-xs text-sm text-gray-600">{t('sessions.shortLinkNotFound')}</p>
        <Link to="/" className="text-sm text-violet-700 underline">
          {t('common.back')}
        </Link>
      </main>
    )
  }
  return <Spinner />
}
