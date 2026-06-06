import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '../../lib/dateLocale'
import { parseRange } from '../../lib/ranges'
import { Badge, Button } from '../../components/ui'
import type { ParticipantResponse } from '../../lib/types'
import type { MyParticipation } from './useMyAgenda'

export default function ParticipationCard({
  p,
  onRespond,
  pending,
}: {
  p: MyParticipation
  onRespond: (r: ParticipantResponse) => void
  pending?: boolean
}) {
  const { t } = useTranslation()
  const s = p.sessions
  const r = parseRange(s.time_range)
  const confirmed = s.status === 'CONFIRMED'

  return (
    <li className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/g/${s.group_id}/sessions/${s.id}`} className="font-medium hover:underline">
            {s.title}
          </Link>
          <p className="text-sm text-gray-600">
            {format(r.start, "EEEE d MMM · HH:mm", { locale: dateLocale() })}–{format(r.end, 'HH:mm')}
          </p>
          <p className="text-xs text-gray-500">
            {s.groups.name}
            {s.location ? ` · ${s.location}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge color={confirmed ? 'green' : 'gray'}>{t(`sessions.status.${s.status}`)}</Badge>
          <Badge color={p.required ? 'violet' : 'gray'}>
            {p.required ? t('planner.required') : t('planner.optional')}
          </Badge>
        </div>
      </div>

      {confirmed && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant={p.response === 'ACCEPTED' ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={() => onRespond('ACCEPTED')}
          >
            {t('sessions.goingBtn')}
          </Button>
          <Button
            variant={p.response === 'DECLINED' ? 'danger' : 'secondary'}
            disabled={pending}
            onClick={() => onRespond('DECLINED')}
          >
            {t('sessions.cantGoBtn')}
          </Button>
          {p.response === 'PENDING' && (
            <span className="text-xs font-medium text-amber-600">{t('sessions.response.pendingShort')}</span>
          )}
        </div>
      )}
    </li>
  )
}
