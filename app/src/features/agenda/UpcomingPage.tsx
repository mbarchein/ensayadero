// "Próximos": lista ordenada de mis ensayos futuros (todos los grupos),
// con flujo de confirmación inline.

import { useTranslation } from 'react-i18next'
import { parseRange } from '../../lib/ranges'
import { EmptyState, Spinner } from '../../components/ui'
import { useMyAgenda } from './useMyAgenda'
import ParticipationCard from './ParticipationCard'

export default function UpcomingPage() {
  const { t } = useTranslation()
  const { data, isLoading, respond } = useMyAgenda()

  if (isLoading) return <Spinner />

  const now = new Date()
  const upcoming = (data ?? []).filter((p) => parseRange(p.sessions.time_range).end >= now)
  const pendingCount = upcoming.filter(
    (p) => p.sessions.status === 'CONFIRMED' && p.response === 'PENDING',
  ).length

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('upcoming.title')}</h1>

      {pendingCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('upcoming.pendingNotice', { count: pendingCount })}
        </p>
      )}

      {upcoming.length === 0 ? (
        <EmptyState message={t('upcoming.empty')} />
      ) : (
        <ul className="space-y-3">
          {upcoming.map((p) => (
            <ParticipationCard
              key={p.session_id}
              p={p}
              pending={respond.isPending}
              onRespond={(response) => respond.mutate({ sessionId: p.session_id, response })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
