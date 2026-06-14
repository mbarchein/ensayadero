// Month grid of the group's rehearsals (alternative to the list view). Its own
// lightweight grid — NOT the WeekGrid — so it doesn't carry the touch-action
// caveat and can show the selected day's agenda below it. Days carry up to three
// dots colored by my response/status; tapping a day lists its rehearsals.

import { useMemo, useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dateLocale } from '../../lib/dateLocale'
import { parseRange } from '../../lib/ranges'
import SessionCard from './SessionCard'
import type { SessionWithParticipants } from '../../lib/types'

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// dot color mirrors the card's date block: cancelled/draft by status, else by
// my own response (going / pending / declined), grey when I'm not summoned.
function sessionDot(s: SessionWithParticipants, userId: string): string {
  const mine = s.session_participants.find((p) => p.user_id === userId)
  if (s.status === 'CANCELLED') return 'bg-red-400'
  if (s.status === 'DRAFT') return 'bg-gray-300'
  if (mine?.response === 'ACCEPTED') return 'bg-violet-500'
  if (mine?.response === 'DECLINED') return 'bg-red-400'
  if (mine) return 'bg-amber-400'
  return 'bg-gray-300'
}

export default function MonthCalendar({
  sessions,
  groupId,
  userId,
}: {
  sessions: SessionWithParticipants[]
  groupId: string
  userId: string
}) {
  const { t } = useTranslation()
  const today = new Date()
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selected, setSelected] = useState<Date>(today)

  const byDay = useMemo(() => {
    const m = new Map<string, SessionWithParticipants[]>()
    for (const s of sessions) {
      const k = dayKey(parseRange(s.time_range).start)
      const arr = m.get(k)
      if (arr) arr.push(s)
      else m.set(k, [s])
    }
    return m
  }, [sessions])

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })

  const letters = (dateLocale().code ?? 'en').startsWith('es')
    ? ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const selectedSessions = (byDay.get(dayKey(selected)) ?? [])
    .slice()
    .sort((a, b) => parseRange(a.time_range).start.getTime() - parseRange(b.time_range).start.getTime())

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label={t('sessions.prevMonth')}
          className="rounded p-1.5 text-violet-700 hover:bg-violet-50"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="font-semibold">{cap(format(month, 'LLLL yyyy', { locale: dateLocale() }))}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label={t('sessions.nextMonth')}
          className="rounded p-1.5 text-violet-700 hover:bg-violet-50"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500">
        {letters.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inMonth = isSameMonth(d, month)
          const list = byDay.get(dayKey(d)) ?? []
          return (
            <button
              key={dayKey(d)}
              type="button"
              onClick={() => setSelected(d)}
              className={`flex h-12 flex-col items-center gap-1 rounded-lg py-1 text-sm transition ${
                isSameDay(d, selected) ? 'bg-violet-100 ring-1 ring-violet-300' : 'hover:bg-gray-50'
              } ${!inMonth ? 'text-gray-300' : isToday(d) ? 'font-bold text-violet-700' : 'text-gray-800'}`}
            >
              <span className="leading-none">{format(d, 'd')}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {list.slice(0, 3).map((s) => (
                  <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${sessionDot(s, userId)}`} />
                ))}
                {list.length > 3 && <span className="text-[9px] leading-none text-gray-400">+</span>}
              </span>
            </button>
          )
        })}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-violet-700">
          {cap(format(selected, 'EEEE d MMM', { locale: dateLocale() }))}
        </h3>
        {selectedSessions.length > 0 ? (
          <ul className="space-y-3">
            {selectedSessions.map((s) => (
              <SessionCard key={s.id} session={s} groupId={groupId} userId={userId} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">{t('sessions.noneThisDay')}</p>
        )}
      </div>
    </div>
  )
}
