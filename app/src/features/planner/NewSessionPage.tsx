// Create-session page (/g/:groupId/sessions/new). Prefilled via querystring
// from the planner — ?d=YYYY-MM-DD&start=HH:mm&dur=minutes&people=id,id —
// with sensible defaults when opened directly.

import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { weekStart } from '../../lib/slots'
import { useSessionGrid } from './useSessionGrid'
import SessionForm from './SessionForm'
import { Spinner } from '../../components/ui'

export default function NewSessionPage() {
  const { t } = useTranslation()
  const { groupId, group, members, isInstructor, loading } = useGroup()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  // prefill from the planner; defaults for direct entry
  const [initial] = useState(() => {
    const d = params.get('d')
    const day = d ? new Date(`${d}T00:00`) : new Date()
    const start = params.get('start')
    const [h, m] = (start ?? '18:00').split(':').map(Number)
    const dur = Number(params.get('dur')) || 90
    const people = params.get('people')?.split(',').filter(Boolean) ?? null
    return { day, startMin: h * 60 + m, dur, people }
  })

  const [monday, setMonday] = useState(() => weekStart(initial.day))
  const grid = useSessionGrid(groupId, members, monday)

  const goBack = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(`/g/${groupId}`, { replace: true })
  }

  if (loading) return <Spinner />
  if (!isInstructor) {
    return <p className="py-10 text-center text-sm text-gray-600">{t('planner.directorsOnly')}</p>
  }

  return (
    <SessionForm
      groupId={groupId}
      groupType={group?.group_type}
      members={members}
      // no explicit preselection → everyone summoned (and required) by default
      preselectedIds={initial.people ?? members.map((m) => m.user_id)}
      initialDay={initial.day}
      initialStartMin={initial.startMin}
      initialDurationMin={initial.dur}
      grid={grid}
      weekMonday={monday}
      onDayChange={(d) => setMonday(weekStart(d))}
      onClose={goBack}
    />
  )
}
