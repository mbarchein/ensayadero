// Rehearsal card: calendar-style date block (colored by my response/status),
// time + location, status / my-response badges, and an attendance glance
// (avatars of who's going + per-response counts). Shared by the list and the
// month view; extracted to its own file to avoid a circular import between them.

import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../../lib/dateLocale'
import { Archive } from 'lucide-react'
import { Badge, InitialsAvatar } from '../../components/ui'
import { parseRange } from '../../lib/ranges'
import { visibleParticipants } from '../../lib/participants'
import type {
  ParticipantResponse,
  Profile,
  SessionStatus,
  SessionWithParticipants,
} from '../../lib/types'

export const STATUS_COLOR = {
  DRAFT: 'gray' as const,
  CONFIRMED: 'green' as const,
  CANCELLED: 'red' as const,
}

// Dot/accent color for a session by my relation to it: cancelled/draft by
// status, otherwise by my response (going / pending / declined), grey when I'm
// not summoned. Shared by the month calendar dots.
export function responseDotColor(status: SessionStatus, response?: ParticipantResponse): string {
  if (status === 'CANCELLED') return 'bg-red-400'
  if (status === 'DRAFT') return 'bg-gray-300'
  if (response === 'ACCEPTED') return 'bg-violet-500'
  if (response === 'DECLINED') return 'bg-red-600'
  if (response) return 'bg-amber-400' // PENDING (summoned)
  return 'bg-gray-300' // not summoned
}

// Small overlapping participant avatar for the attendance stack.
function PersonAvatar({ profile }: { profile: Profile }) {
  return profile.avatar_url ? (
    <img src={profile.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-white" />
  ) : (
    <span className="rounded-full ring-2 ring-white">
      <InitialsAvatar name={profile.name || profile.email} size={24} />
    </span>
  )
}

export default function SessionCard({
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

  // Skip participants whose profile RLS hides (removed members still on an old
  // session); the embedded profile is null and they're not renderable.
  const parts = visibleParticipants(s.session_participants)
  // attendance breakdown (data already loaded with the session)
  const going = parts.filter((p) => p.response === 'ACCEPTED')
  const pending = parts.filter((p) => p.response === 'PENDING')
  const declined = parts.filter((p) => p.response === 'DECLINED')

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
          {s.status !== 'CANCELLED' && parts.length > 0 && (
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
