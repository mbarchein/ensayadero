// Standalone edit-session page (/g/:groupId/sessions/:sessionId/edit).
// The form owns a real history entry, so navigation is natural:
// session detail → edit → back/save → session detail.

import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { weekStart } from '../../lib/slots'
import { useSessionGrid } from './useSessionGrid'
import SessionForm from './SessionForm'
import { Spinner } from '../../components/ui'
import type { SessionWithParticipants } from '../../lib/types'

export default function EditSessionPage() {
  const { t } = useTranslation()
  const { sessionId } = useParams<{ sessionId: string }>()
  const { groupId, members, isInstructor, loading } = useGroup()
  const navigate = useNavigate()
  const location = useLocation()

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, session_participants(*, profiles(*))')
        .eq('id', sessionId!)
        .single()
      if (error) throw error
      return data as SessionWithParticipants
    },
  })

  // week being inspected: follows the (editable) day chosen in the form
  const [monday, setMonday] = useState<Date | null>(null)
  const effectiveMonday = monday ?? (session ? weekStart(parseRange(session.time_range).start) : null)
  const grid = useSessionGrid(groupId, members, effectiveMonday ?? new Date(0), session)

  const goBack = () => {
    // in-app history → the previous page (the session detail); direct entry
    // (deep link / reload) → fall back to the detail route
    if (location.key !== 'default') navigate(-1)
    else navigate(`/g/${groupId}/sessions/${sessionId}`, { replace: true })
  }

  if (loading) return <Spinner />
  if (!isInstructor) {
    return <p className="py-10 text-center text-sm text-gray-500">{t('planner.directorsOnly')}</p>
  }
  if (!session || !effectiveMonday) return <Spinner />

  const r = parseRange(session.time_range)
  return (
    <SessionForm
      groupId={groupId}
      members={members}
      preselectedIds={[]}
      initialDay={r.start}
      initialStartMin={r.start.getHours() * 60 + r.start.getMinutes()}
      initialDurationMin={Math.round((r.end.getTime() - r.start.getTime()) / 60_000)}
      grid={grid}
      weekMonday={effectiveMonday}
      onDayChange={(d) => setMonday(weekStart(d))}
      onClose={goBack}
      session={session}
    />
  )
}
