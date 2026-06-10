// Standalone edit-session page (/g/:groupId/sessions/:sessionId/edit).
// The form owns a real history entry, so navigation is natural:
// session detail → edit → back/save → session detail. (Editing from the
// planner calendar still embeds the form there instead.)

import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useGroup } from '../groups/useGroup'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'
import { heatmap, weekStart } from '../../lib/slots'
import CreateSessionModal from './CreateSessionModal'
import { Spinner } from '../../components/ui'
import type { Availability, SessionWithParticipants } from '../../lib/types'

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

  const monday = useMemo(
    () => (session ? weekStart(parseRange(session.time_range).start) : null),
    [session],
  )

  const { data: availabilities } = useQuery({
    queryKey: ['group-availabilities', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availabilities')
        .select('*')
        .in(
          'user_id',
          members.map((m) => m.user_id),
        )
      if (error) throw error
      return data as Availability[]
    },
    enabled: members.length > 0,
  })

  const { data: busyRows } = useQuery({
    queryKey: ['group-busy', groupId, monday?.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('group_busy_ranges', {
        gid: groupId,
        search: `[${monday!.toISOString()},${addDays(monday!, 7).toISOString()})`,
      })
      if (error) throw error
      return data as { user_id: string; busy: string }[]
    },
    enabled: !!monday,
  })

  // Same grid the planner builds for editing: over ALL members and excluding
  // the edited session's own occupation — otherwise its participants would
  // show as "busy" in their own slot.
  const grid = useMemo(() => {
    if (!availabilities || !session || !monday) return null
    const exclude = parseRange(session.time_range)
    const sessionPeople = new Set(session.session_participants.map((p) => p.user_id))
    const busyByUser = new Map<string, TimeRange[]>()
    for (const row of busyRows ?? []) {
      const iv = parseRange(row.busy)
      if (sessionPeople.has(row.user_id) && overlaps(iv, exclude)) continue
      const list = busyByUser.get(row.user_id) ?? []
      list.push(iv)
      busyByUser.set(row.user_id, list)
    }
    return heatmap(
      members.map((m) => ({
        userId: m.user_id,
        availabilities: availabilities.filter((a) => a.user_id === m.user_id),
        busy: busyByUser.get(m.user_id) ?? [],
      })),
      monday,
    )
  }, [availabilities, busyRows, session, monday, members])

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
  if (!session || !monday || !grid) return <Spinner />

  return (
    <CreateSessionModal
      groupId={groupId}
      members={members}
      preselectedIds={[]}
      session={session}
      initialRange={parseRange(session.time_range)}
      grid={grid}
      weekMonday={monday}
      onClose={goBack}
      manageHistory={false}
    />
  )
}
