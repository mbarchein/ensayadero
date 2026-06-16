import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isToday, isTomorrow, differenceInCalendarWeeks } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { tg } from '../../lib/glossary'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { Pencil, CalendarPlus, Users } from 'lucide-react'
import { BackButton, Button, EmptyState, Spinner } from '../../components/ui'
import GroupAvatar from '../groups/GroupAvatar'
import Tip from '../../components/Tip'
import SessionCard, { responseDotColor } from './SessionCard'
import MonthCalendar from './MonthCalendar'
import ViewToggle from './ViewToggle'

import type { SessionWithParticipants } from '../../lib/types'

export default function SessionsPage() {
  const { t } = useTranslation()
  const { groupId, group, isInstructor, loading } = useGroup()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  // set by the join flow: greet freshly joined members with a tip
  const justJoined = !!(useLocation().state as { justJoined?: boolean } | null)?.justJoined
  // list vs month view, remembered across visits
  const [view, setView] = useState<'list' | 'month'>(
    () => (localStorage.getItem('sessions-view') === 'month' ? 'month' : 'list'),
  )
  const switchView = (v: 'list' | 'month') => {
    localStorage.setItem('sessions-view', v)
    setView(v)
  }

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, session_participants(*, profiles(*))')
        .eq('group_id', groupId)
        .order('time_range', { ascending: true })
      if (error) throw error
      return data as SessionWithParticipants[]
    },
  })

  // ids of sessions archived by the current user (hidden only for me)
  const { data: archivedIds } = useQuery({
    queryKey: ['session-archives'],
    queryFn: async () => {
      const { data, error } = await supabase.from('session_archives').select('session_id')
      if (error) throw error
      return new Set((data as { session_id: string }[]).map((r) => r.session_id))
    },
  })

  const archive = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('session_archives')
        .insert({ user_id: profile!.id, session_id: sessionId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session-archives'] }),
  })

  if (loading || isLoading) return <Spinner />

  const now = new Date()
  const hidden = archivedIds ?? new Set<string>()
  const visible = (sessions ?? []).filter((s) => !hidden.has(s.id))
  const upcoming = visible.filter((s) => parseRange(s.time_range).end >= now && s.status !== 'CANCELLED')
  const past = visible.filter((s) => parseRange(s.time_range).end < now || s.status === 'CANCELLED')
  // archivable: cancelled or already past
  const canArchive = (s: SessionWithParticipants) =>
    s.status === 'CANCELLED' || parseRange(s.time_range).end < now

  // bucket upcoming (list is time-ascending) into Today / This week / Next week
  // / <month>. Buckets appear in first-seen order, which is already chronological.
  const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)
  const bucketOf = (d: Date): { key: string; label: string } => {
    if (isToday(d)) return { key: 'today', label: t('sessions.today') }
    // checked before the week diff so tomorrow keeps its own bucket even when
    // it falls into next calendar week (e.g. today Sunday → tomorrow Monday)
    if (isTomorrow(d)) return { key: 'tomorrow', label: t('sessions.tomorrow') }
    const wk = differenceInCalendarWeeks(d, now, { weekStartsOn: 1 })
    if (wk <= 0) return { key: 'this-week', label: t('sessions.thisWeek') }
    if (wk === 1) return { key: 'next-week', label: t('sessions.nextWeek') }
    const fmt = d.getFullYear() === now.getFullYear() ? 'LLLL' : 'LLLL yyyy'
    return { key: `m-${format(d, 'yyyy-MM')}`, label: cap(format(d, fmt, { locale: dateLocale() })) }
  }
  const buckets: { key: string; label: string; items: SessionWithParticipants[] }[] = []
  for (const s of upcoming) {
    const { key, label } = bucketOf(parseRange(s.time_range).start)
    const b = buckets.find((x) => x.key === key)
    if (b) b.items.push(s)
    else buckets.push({ key, label, items: [s] })
  }

  return (
    <div className="space-y-5 pb-6">
      <header className="sticky top-0 z-10 -mx-4 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <div className="flex items-center gap-3">
          <BackButton to="/" />
          <GroupAvatar seed={group?.avatar_seed || groupId} image={group?.avatar_image} />
          <h1 className="flex-1 text-xl font-bold">{group?.name}</h1>
        </div>
      </header>

      {justJoined && <Tip id="groupJoined" />}
      <Tip id="group" />

      <div className="space-y-2">
        {isInstructor && (
          <Button
            onClick={() => navigate(`/g/${groupId}/planner`)}
            className="inline-flex w-full items-center justify-center gap-1.5"
          >
            <CalendarPlus size={16} /> {tg(t, 'group.tabs.planner', group?.group_type)}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => navigate(`/g/${groupId}/members`)}
          className="inline-flex w-full items-center justify-center gap-1.5"
        >
          <Users size={16} /> {isInstructor ? t('group.membersManage') : t('group.membersView')}
        </Button>
        {isInstructor && group && (
          <Button
            variant="secondary"
            onClick={() => navigate(`/g/${groupId}/edit`)}
            className="inline-flex w-full items-center justify-center gap-1.5"
          >
            <Pencil size={16} /> {t('group.edit')}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{tg(t, 'group.tabs.sessions', group?.group_type)}</h2>
        <ViewToggle value={view} onChange={switchView} />
      </div>

      {view === 'month' ? (
        <MonthCalendar
          items={visible}
          emptyDayLabel={tg(t, 'sessions.noneThisDay', group?.group_type)}
          dateOf={(s) => parseRange(s.time_range).start}
          dotOf={(s) =>
            responseDotColor(s.status, s.session_participants.find((p) => p.user_id === profile!.id)?.response)
          }
          renderAgenda={(items) => (
            <ul className="space-y-3">
              {items.map((s) => (
                <SessionCard key={s.id} session={s} groupId={groupId} userId={profile!.id} />
              ))}
            </ul>
          )}
        />
      ) : (
        <>
          {upcoming.length === 0 ? (
            <EmptyState
              message={tg(t, 'sessions.empty', group?.group_type)}
              action={
                isInstructor ? (
                  <Link to={`/g/${groupId}/planner`} className="font-medium text-violet-700 underline">
                    {tg(t, 'sessions.planOne', group?.group_type)}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-5">
              {buckets.map((b) => (
                <section key={b.key} className="space-y-2">
                  <h3 className="text-sm font-semibold text-violet-700">{b.label}</h3>
                  <ul className="space-y-3">
                    {b.items.map((s) => (
                      <SessionCard key={s.id} session={s} groupId={groupId} userId={profile!.id} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-gray-600">
                {t('sessions.pastAndCancelled', { count: past.length })}
              </summary>
              <ul className="mt-2 space-y-2 opacity-60">
                {past.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    groupId={groupId}
                    userId={profile!.id}
                    onArchive={canArchive(s) ? () => archive.mutate(s.id) : undefined}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
