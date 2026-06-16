// Join a group by code (link /join/:code or by entering it).
// If there's no session, store the code and start login; AuthCallback resumes.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { BackButton, Button, Spinner } from '../../components/ui'

export const PENDING_JOIN_KEY = 'pendingJoinCode'

export default function JoinPage() {
  const { t } = useTranslation()
  const { code: codeParam } = useParams<{ code?: string }>()
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [code, setCode] = useState(codeParam ?? '')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const tried = useRef(false)

  const join = async (c: string) => {
    setWorking(true)
    setError(null)
    const { data, error } = await supabase.rpc('join_by_code', { code: c })
    setWorking(false)
    if (error) {
      setError(t('join.invalid'))
      return
    }
    qc.invalidateQueries({ queryKey: ['my-memberships'] })
    navigate(`/g/${data}`, { replace: true, state: { justJoined: true } })
  }

  // with a code in the URL: if there's a session, join directly; otherwise log in and resume
  useEffect(() => {
    if (loading || !codeParam || tried.current) return
    tried.current = true
    if (session) {
      join(codeParam)
    } else {
      // no session: remember the code and let the user pick how to sign in
      // (Google or email/password). Both paths resume the join afterwards.
      localStorage.setItem(PENDING_JOIN_KEY, codeParam)
      navigate('/login', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, codeParam])

  if (loading || (codeParam && working)) return <Spinner />

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-start gap-4 p-6 pt-2">
      <header className="-mx-6 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-6 py-2">
        <BackButton to="/" />
        <h1 className="text-xl font-bold">{t('join.title')}</h1>
      </header>
      <p className="text-center text-sm text-gray-600">{t('join.hint')}</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          join(code.trim())
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABC123"
          className="w-full rounded-lg border px-3 py-3 text-center text-2xl font-bold tracking-[0.3em] uppercase"
        />
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={code.trim().length < 4 || working} className="w-full">
          {working ? t('join.joining') : t('join.joinBtn')}
        </Button>
      </form>
    </main>
  )
}
