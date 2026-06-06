import { Link, NavLink } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { Badge, EmptyState, Spinner } from '../../components/ui'
import GroupAvatar from '../groups/GroupAvatar'
import type { SessionWithParticipants } from '../../lib/types'

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

  // ids de sesiones archivadas por el usuario actual (oculto solo para mí)
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
  // archivable: cancelado o ya pasado
  const canArchive = (s: SessionWithParticipants) =>
    s.status === 'CANCELLED' || parseRange(s.time_range).end < now

  return (
    <div className="space-y-5">
      <header>
        <Link to="/" className="text-sm text-gray-500">
          {t('group.backToGroups')}
        </Link>
        <div className="flex items-center gap-3">
          <GroupAvatar seed={groupId} />
          <h1 className="text-xl font-bold">{group?.name}</h1>
        </div>
      </header>

      <nav className="flex gap-2 text-sm">
        <NavLink to={`/g/${groupId}`} end className={tabClass}>
          {t('group.tabs.sessions')}
        </NavLink>
        {isInstructor && (
          <NavLink to={`/g/${groupId}/planner`} className={tabClass}>
            {t('group.tabs.planner')}
          </NavLink>
        )}
        <NavLink to={`/g/${groupId}/members`} className={tabClass}>
          {t('group.tabs.members')}
        </NavLink>
      </nav>

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
        <ul className="space-y-3">
          {upcoming.map((s) => (
            <SessionCard key={s.id} session={s} groupId={groupId} userId={profile!.id} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-gray-500">
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

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1 ${isActive ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`

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
  return (
    <li>
      <Link
        to={`/g/${groupId}/sessions/${s.id}`}
        className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow ${
          onArchive ? 'rounded-b-none' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{s.title}</p>
            <p className="text-sm text-gray-600">
              {format(r.start, "EEEE d MMM · HH:mm", { locale: dateLocale() })}–{format(r.end, 'HH:mm')}
              {s.location && ` · ${s.location}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge color={STATUS_COLOR[s.status]}>{t(`sessions.status.${s.status}`)}</Badge>
            {mine && s.status === 'CONFIRMED' && (
              <Badge
                color={mine.response === 'ACCEPTED' ? 'green' : mine.response === 'DECLINED' ? 'red' : 'amber'}
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
      </Link>
      {onArchive && (
        <button
          onClick={onArchive}
          className="w-full rounded-b-xl border border-t-0 bg-gray-50 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          🗄 {t('sessions.archive')}
        </button>
      )}
    </li>
  )
}
