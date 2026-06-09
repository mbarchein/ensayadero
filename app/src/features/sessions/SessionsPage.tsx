import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { Pencil, Archive, CalendarPlus, Users } from 'lucide-react'
import { Badge, BackButton, Button, EmptyState, Spinner } from '../../components/ui'
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
  const navigate = useNavigate()

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

  return (
    <div className="space-y-5 pb-6">
      <header className="sticky top-0 z-10 -mx-4 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <BackButton to="/" />
          <GroupAvatar seed={group?.avatar_seed || groupId} image={group?.avatar_image} />
          <h1 className="flex-1 text-xl font-bold">{group?.name}</h1>
        </div>
      </header>

      <div className="flex gap-2">
        {isInstructor && (
          <Button
            onClick={() => navigate(`/g/${groupId}/planner`)}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 !px-2"
          >
            <CalendarPlus size={16} /> {t('group.tabs.planner')}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => navigate(`/g/${groupId}/members`)}
          className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 !px-2"
        >
          <Users size={16} /> {t('group.tabs.members')}
        </Button>
        {isInstructor && group && (
          <Button
            variant="secondary"
            onClick={() => navigate(`/g/${groupId}/edit`)}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 !px-2"
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
        className={`block rounded-xl border p-4 shadow-sm transition hover:shadow ${
          mine ? 'bg-white' : 'bg-gray-50' // muted when I'm not summoned
        } ${onArchive ? 'rounded-b-none' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">
              {format(r.start, "EEEE d MMM · HH:mm", { locale: dateLocale() })}–{format(r.end, 'HH:mm')}
            </p>
            {s.location && <p className="text-sm text-gray-600">{s.location}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
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
      </Link>
      {onArchive && (
        <button
          onClick={onArchive}
          className="flex w-full items-center justify-center gap-1.5 rounded-b-xl border border-t-0 bg-gray-50 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          <Archive size={13} /> {t('sessions.archive')}
        </button>
      )}
    </li>
  )
}
