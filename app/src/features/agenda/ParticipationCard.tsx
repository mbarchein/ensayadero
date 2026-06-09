import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../../lib/dateLocale'
import { Check, X, Clock, Users } from 'lucide-react'
import { parseRange } from '../../lib/ranges'
import { Badge, Button, Modal } from '../../components/ui'
import GroupAvatar from '../groups/GroupAvatar'
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
      className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:shadow ${
        p.response === 'ACCEPTED' ? 'border-green-400' : p.response === 'DECLINED' ? 'border-red-400' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GroupAvatar seed={s.groups.avatar_seed || s.group_id} image={s.groups.avatar_image} size={40} />
            <span className="truncate text-base font-semibold">{s.groups.name}</span>
          </div>
          <p className="truncate text-sm text-gray-700">{s.title}</p>
          <p className="flex items-center gap-1 text-sm text-gray-600">
            <span>
              {format(r.start, "EEEE d MMM · HH:mm", { locale: dateLocale() })}–{format(r.end, 'HH:mm')}
              {s.location ? ` · ${s.location}` : ''}
            </span>
            {onViewAgenda && (
              <button
                onClick={onViewAgenda}
                title={t('upcoming.viewInAgenda')}
                aria-label={t('upcoming.viewInAgenda')}
                className="rounded p-1 text-violet-700 hover:bg-violet-100"
              >
                <CalendarDays size={14} />
              </button>
            )}
          </p>
        </div>
        {/* right block: status/response badge with the attendee count below,
            vertically centered against the group-name row */}
        <div className="flex shrink-0 flex-col items-end gap-1 pt-1.5 text-xs">
          {s.status !== 'CONFIRMED' && (
            <Badge color={confirmed ? 'green' : 'gray'}>{t(`sessions.status.${s.status}`)}</Badge>
          )}
          {!p.required && <Badge color="gray">{t('planner.optional')}</Badge>}
          {confirmed && p.response !== 'PENDING' && (
            <Badge color={p.response === 'ACCEPTED' ? 'green' : 'red'}>
              {p.response === 'ACCEPTED'
                ? t('sessions.response.going')
                : t('sessions.response.notGoing')}
            </Badge>
          )}
          {confirmed && (
            <button
              onClick={() => setAttendeesOpen(true)}
              title={t('upcoming.attendeesTitle')}
              aria-label={t('upcoming.attendeesTitle')}
              // mr-2 matches the badge's inner padding → aligned with its text
              className="mr-2 inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
            >
              <Users size={13} /> {tally.total}
            </button>
          )}
        </div>
      </div>


      {/* inline confirmation only while pending; changes happen in the detail */}
      {confirmed && p.response === 'PENDING' && (
        <div className="mt-3 flex items-center gap-2">
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

      <Modal open={attendeesOpen} onClose={() => setAttendeesOpen(false)} title={t('upcoming.attendeesTitle')}>
        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          {tally.accepted > 0 && (
            <span className="inline-flex items-center gap-1 text-green-700">
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
                respOrder[a.response] - respOrder[b.response] ||
                (a.profiles?.name ?? '').localeCompare(b.profiles?.name ?? ''),
            )
            .map((sp, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{sp.profiles?.name || '—'}</span>
                <Badge color={sp.response === 'ACCEPTED' ? 'green' : sp.response === 'DECLINED' ? 'red' : 'amber'}>
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
