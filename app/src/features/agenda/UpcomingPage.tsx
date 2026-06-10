// "Upcoming": ordered list of my future rehearsals (all groups),
// with an inline confirmation flow.

import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { parseRange } from '../../lib/ranges'
import { isoDay, weekStart } from '../../lib/slots'
import { BackButton, EmptyState, Spinner } from '../../components/ui'
import { useMyAgenda } from './useMyAgenda'
import ParticipationCard from './ParticipationCard'

export default function UpcomingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, respond } = useMyAgenda()

  if (isLoading) return <Spinner />

  const now = new Date()
  const upcoming = (data ?? []).filter((p) => parseRange(p.sessions.time_range).end >= now)
  const pendingCount = upcoming.filter(
    (p) => p.sessions.status === 'CONFIRMED' && p.response === 'PENDING',
  ).length

  // group by this week / next week / later (Monday-based weeks)
  const nextWeek = addDays(weekStart(now), 7)
  const weekAfter = addDays(weekStart(now), 14)
  const startOf = (p: (typeof upcoming)[number]) => parseRange(p.sessions.time_range).start
  const sections = [
    { key: 'thisWeek', items: upcoming.filter((p) => startOf(p) < nextWeek) },
    { key: 'nextWeek', items: upcoming.filter((p) => startOf(p) >= nextWeek && startOf(p) < weekAfter) },
    { key: 'later', items: upcoming.filter((p) => startOf(p) >= weekAfter) },
  ].filter((s) => s.items.length > 0)

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to="/" />
        <h1 className="text-xl font-bold">{t('upcoming.title')}</h1>
      </header>

      {pendingCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('upcoming.pendingNotice', { count: pendingCount })}
        </p>
      )}

      {upcoming.length === 0 ? (
        <EmptyState message={t('upcoming.empty')} />
      ) : (
        sections.map((s) => (
          <section key={s.key} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500">{t(`upcoming.group.${s.key}`)}</h2>
            <ul className="space-y-3">
              {s.items.map((p) => (
                <ParticipationCard
                  key={p.session_id}
                  p={p}
                  pending={respond.isPending}
                  onRespond={(response) => respond.mutate({ sessionId: p.session_id, response })}
                  onViewAgenda={() =>
                    navigate(
                      `/availability?d=${isoDay(parseRange(p.sessions.time_range).start)}&s=${p.session_id}`,
                    )
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
