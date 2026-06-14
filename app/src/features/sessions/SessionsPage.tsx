import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isToday, isTomorrow, differenceInCalendarWeeks } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { Pencil, Archive, CalendarPlus, Users } from 'lucide-react'
import { Badge, BackButton, Button, EmptyState, InitialsAvatar, Spinner } from '../../components/ui'
import GroupAvatar from '../groups/GroupAvatar'
import Tip from '../../components/Tip'

import type { Profile, SessionWithParticipants } from '../../lib/types'

const STATUS_COLOR = {
  DRAFT: 'gray' as const,
  CONFIRMED: 'green' as const,
  CANCELLED: 'red' as const,
}

export default function SessionsPage() {
  const { t } = useTranslation()
  const { groupId, group, isInstructor, loading } = useGroup()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  // set by the join flow: greet freshly joined members with a tip
  const justJoined = !!(useLocation().state as { justJoined?: boolean } | null)?.justJoined

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
            <CalendarPlus size={16} /> {t('group.tabs.planner')}
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

      <h2 className="text-lg font-semibold">{t('group.tabs.sessions')}</h2>

      {upcoming.length === 0 ? (
        <EmptyState
          message={t('sessions.empty')}
          action={
            isInstructor ? (
              <Link to={`/g/${groupId}/planner`} className="font-medium text-violet-700 underline">
                {t('sessions.planOne')}
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
    </div>
  )
}

// Small overlapping participant avatar for the attendance stack.
function PersonAvatar({ profile }: { profile: Profile }) {
  return profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt=""
      className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
    />
  ) : (
    <span className="rounded-full ring-2 ring-white">
      <InitialsAvatar name={profile.name || profile.email} size={24} />
    </span>
  )
}

function SessionCard({
  session: s,
  groupId,
  userId,
  onArchive,
}: {
  session: SessionWithParticipants
  groupId: string
  userId: string
  onArchive?: () => void
}) {
  const { t } = useTranslation()
  const r = parseRange(s.time_range)
  const mine = s.session_participants.find((p) => p.user_id === userId)

  // attendance breakdown (data already loaded with the session)
  const going = s.session_participants.filter((p) => p.response === 'ACCEPTED')
  const pending = s.session_participants.filter((p) => p.response === 'PENDING')
  const declined = s.session_participants.filter((p) => p.response === 'DECLINED')

  // calendar-style date block, colored like the Upcoming cards: cancelled/draft
  // by status, otherwise by my own response.
  const block =
    s.status === 'CANCELLED'
      ? 'bg-red-500 text-white'
      : s.status === 'DRAFT'
        ? 'bg-gray-100 text-gray-600'
        : mine?.response === 'ACCEPTED'
          ? 'bg-violet-600 text-white'
          : mine?.response === 'DECLINED'
            ? 'bg-red-500 text-white'
            : mine
              ? 'bg-amber-400 text-amber-950' // summoned, pending
              : 'bg-gray-100 text-gray-600' // not summoned

  return (
    <li>
      <Link
        to={`/g/${groupId}/sessions/${s.id}`}
        className={`flex overflow-hidden rounded-xl border shadow-sm transition hover:shadow ${
          mine ? 'bg-white' : 'bg-gray-50'
        } ${onArchive ? 'rounded-b-none' : ''}`}
      >
        <div className={`flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-2 ${block}`}>
          <span className="text-[11px] font-semibold uppercase leading-none">
            {format(r.start, 'EEE', { locale: dateLocale() })}
          </span>
          <span className="text-2xl font-bold leading-none">{format(r.start, 'd')}</span>
          <span className="text-[11px] uppercase leading-none">
            {format(r.start, 'MMM', { locale: dateLocale() })}
          </span>
          <span className="mt-1 text-xs font-semibold leading-none">{format(r.start, 'HH:mm')}</span>
        </div>

        <div className="min-w-0 flex-1 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {format(r.start, 'HH:mm')}–{format(r.end, 'HH:mm')}
              </p>
              {s.location && <p className="truncate text-sm text-gray-600">{s.location}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {s.status !== 'CONFIRMED' && (
                <Badge color={STATUS_COLOR[s.status]}>{t(`sessions.status.${s.status}`)}</Badge>
              )}
              {mine && s.status === 'CONFIRMED' && (
                <Badge
                  color={mine.response === 'ACCEPTED' ? 'violet' : mine.response === 'DECLINED' ? 'red' : 'amber'}
                >
                  {mine.response === 'ACCEPTED'
                    ? t('sessions.response.going')
                    : mine.response === 'DECLINED'
                      ? t('sessions.response.notGoing')
                      : t('sessions.response.pendingShort')}
                </Badge>
              )}
            </div>
          </div>

          {/* attendance at a glance: avatars of who's going + per-response counts */}
          {s.status !== 'CANCELLED' && s.session_participants.length > 0 && (
            <div className="mt-2 flex items-center gap-3">
              {going.length > 0 && (
                <div className="flex -space-x-2">
                  {going.slice(0, 5).map((p) => (
                    <PersonAvatar key={p.user_id} profile={p.profiles} />
                  ))}
                  {going.length > 5 && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[11px] font-medium text-gray-600 ring-2 ring-white">
                      +{going.length - 5}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2.5 text-xs text-gray-600">
                {going.length > 0 && (
                  <span className="inline-flex items-center gap-1" title={t('sessions.response.going')}>
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    {going.length}
                  </span>
                )}
                {pending.length > 0 && (
                  <span className="inline-flex items-center gap-1" title={t('sessions.response.pendingShort')}>
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    {pending.length}
                  </span>
                )}
                {declined.length > 0 && (
                  <span className="inline-flex items-center gap-1" title={t('sessions.response.notGoing')}>
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    {declined.length}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </Link>
      {onArchive && (
        <button
          onClick={onArchive}
          className="flex w-full items-center justify-center gap-1.5 rounded-b-xl border border-t-0 bg-gray-50 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
        >
          <Archive size={13} /> {t('sessions.archive')}
        </button>
      )}
    </li>
  )
}
