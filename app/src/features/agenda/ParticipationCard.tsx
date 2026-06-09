import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../../lib/dateLocale'
import { Check, X, Clock, Users } from 'lucide-react'
import { parseRange } from '../../lib/ranges'
import { Badge, Button, Modal } from '../../components/ui'
import { celebrate, commiserate } from '../../lib/confetti'
import type { ParticipantResponse } from '../../lib/types'
import { tallyResponses, type MyParticipation } from './useMyAgenda'

export default function ParticipationCard({
  p,
  onRespond,
  pending,
  onViewAgenda,
}: {
  p: MyParticipation
  onRespond: (r: ParticipantResponse) => void
  pending?: boolean
  onViewAgenda?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const s = p.sessions
  const r = parseRange(s.time_range)
  const confirmed = s.status === 'CONFIRMED'
  const tally = tallyResponses(p)
  const [attendeesOpen, setAttendeesOpen] = useState(false)
  const respOrder: Record<ParticipantResponse, number> = { ACCEPTED: 0, DECLINED: 1, PENDING: 2 }

  return (
    <li
      // the whole card opens the session detail; inner buttons/links and the
      // attendees modal keep their own behavior
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, [role=dialog]')) return
        navigate(`/g/${s.group_id}/sessions/${s.id}`)
      }}
      className="flex cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow"
    >
      {/* calendar-style date block; its color mirrors my response. Tapping
          it jumps to this day in my agenda (instead of the session detail) */}
      <button
        type="button"
        onClick={onViewAgenda}
        disabled={!onViewAgenda}
        title={t('upcoming.viewInAgenda')}
        aria-label={t('upcoming.viewInAgenda')}
        className={`flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-2 ${
          !confirmed
            ? 'bg-gray-100 text-gray-600'
            : p.response === 'ACCEPTED'
              ? 'bg-violet-600 text-white'
              : p.response === 'DECLINED'
                ? 'bg-red-500 text-white'
                : 'bg-amber-400 text-amber-950'
        }`}
      >
        <span className="text-[11px] font-semibold uppercase leading-none">
          {format(r.start, 'EEE', { locale: dateLocale() })}
        </span>
        <span className="text-2xl font-bold leading-none">{format(r.start, 'd')}</span>
        <span className="text-[11px] uppercase leading-none">
          {format(r.start, 'MMM', { locale: dateLocale() })}
        </span>
        <span className="mt-1 text-xs font-semibold leading-none">{format(r.start, 'HH:mm')}</span>
      </button>

      <div className="min-w-0 flex-1 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="block truncate text-base font-semibold">{s.groups.name}</span>
            <p className="text-sm text-gray-600">
              {format(r.start, 'HH:mm')}–{format(r.end, 'HH:mm')}
              {s.location ? ` · ${s.location}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-1.5 text-xs">
            {s.status !== 'CONFIRMED' && (
              <Badge color={confirmed ? 'green' : 'gray'}>{t(`sessions.status.${s.status}`)}</Badge>
            )}
            {!p.required && <Badge color="gray">{t('planner.optional')}</Badge>}
          </div>
        </div>

        {/* inline confirmation only while pending; changes happen in the detail */}
        {confirmed && p.response === 'PENDING' && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="secondary"
              className="inline-flex items-center gap-1.5"
              disabled={pending}
              onClick={() => {
                celebrate()
                onRespond('ACCEPTED')
              }}
            >
              <Check size={16} /> {t('sessions.goingBtn')}
            </Button>
            <Button
              variant="secondary"
              className="inline-flex items-center gap-1.5"
              disabled={pending}
              onClick={() => {
                commiserate()
                onRespond('DECLINED')
              }}
            >
              <X size={16} /> {t('sessions.cantGoBtn')}
            </Button>
          </div>
        )}

        {/* bottom line: one pill merging my response with the attendee
            count; tapping it opens the attendees modal */}
        {confirmed && (
          <div className="mt-1.5 text-xs">
            <button
              onClick={() => setAttendeesOpen(true)}
              title={t('upcoming.attendeesTitle')}
              aria-label={t('upcoming.attendeesTitle')}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${
                p.response === 'ACCEPTED'
                  ? 'bg-violet-100 text-violet-800'
                  : p.response === 'DECLINED'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
              }`}
            >
              {p.response === 'ACCEPTED' ? (
                <>
                  <Check size={13} /> {t('sessions.response.going')}
                </>
              ) : p.response === 'DECLINED' ? (
                <>
                  <X size={13} /> {t('sessions.response.notGoing')}
                </>
              ) : (
                <Clock size={13} />
              )}
              <span className="opacity-50">·</span>
              <Users size={13} /> {tally.total}
            </button>
          </div>
        )}
      </div>

      <Modal open={attendeesOpen} onClose={() => setAttendeesOpen(false)} title={t('upcoming.attendeesTitle')}>
        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          {tally.accepted > 0 && (
            <span className="inline-flex items-center gap-1 text-violet-700">
              <Check size={14} /> {t('upcoming.going')}: {tally.accepted}
            </span>
          )}
          {tally.declined > 0 && (
            <span className="inline-flex items-center gap-1 text-red-600">
              <X size={14} /> {t('upcoming.notGoing')}: {tally.declined}
            </span>
          )}
          {tally.pending > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Clock size={14} /> {t('upcoming.pending')}: {tally.pending}
            </span>
          )}
        </div>
        <ul className="space-y-2">
          {[...s.session_participants]
            .sort(
              (a, b) =>
                Number(b.user_id === p.user_id) - Number(a.user_id === p.user_id) || // me first
                respOrder[a.response] - respOrder[b.response] ||
                (a.profiles?.name ?? '').localeCompare(b.profiles?.name ?? ''),
            )
            .map((sp, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                {sp.user_id === p.user_id ? (
                  <span className="font-bold text-violet-700">{t('upcoming.me')}</span>
                ) : (
                  <span className="truncate">{sp.profiles?.name || '—'}</span>
                )}
                <Badge color={sp.response === 'ACCEPTED' ? 'violet' : sp.response === 'DECLINED' ? 'red' : 'amber'}>
                  {sp.response === 'ACCEPTED'
                    ? t('sessions.response.going')
                    : sp.response === 'DECLINED'
                      ? t('sessions.response.notGoing')
                      : t('sessions.response.pending')}
                </Badge>
              </li>
            ))}
        </ul>
      </Modal>
    </li>
  )
}
