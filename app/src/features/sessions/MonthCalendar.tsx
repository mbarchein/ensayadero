// Generic month grid (alternative to a list view). Its own lightweight grid —
// NOT the WeekGrid — so it has no touch-action caveat and can show the selected
// day's agenda below it. The caller supplies how to read each item's date, its
// dot color, and how to render the selected day's agenda; so it works for both
// the group sessions list and the cross-group "Upcoming" view.
//
// Days carry up to three colored dots; tapping a day lists its items below.
// Swipe left/right (or the arrows) changes month.

import { useRef, useState, type ReactNode } from 'react'
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

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function MonthCalendar<T>({
  items,
  dateOf,
  dotOf,
  renderAgenda,
}: {
  items: T[]
  dateOf: (item: T) => Date
  dotOf: (item: T) => string
  renderAgenda: (dayItems: T[]) => ReactNode
}) {
  const { t } = useTranslation()
  const today = new Date()
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selected, setSelected] = useState<Date>(today)

  // bucket items by day (and keep each day time-ascending)
  const byDay = new Map<string, T[]>()
  for (const it of items) {
    const k = dayKey(dateOf(it))
    const arr = byDay.get(k)
    if (arr) arr.push(it)
    else byDay.set(k, [it])
  }
  for (const arr of byDay.values()) arr.sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })

  const letters = (dateLocale().code ?? 'en').startsWith('es')
    ? ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const selectedItems = byDay.get(dayKey(selected)) ?? []

  // swipe left → next month, right → previous; only claimed when clearly
  // horizontal so vertical scroll still works (touch-action: pan-y)
  const start = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    moved.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) moved.current = true
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (start.current && moved.current) {
      const dx = e.clientX - start.current.x
      setMonth((m) => addMonths(m, dx < 0 ? 1 : -1))
    }
    start.current = null
  }

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

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
        onClickCapture={(e) => {
          // a horizontal swipe ends over a day button — swallow that click
          if (moved.current) {
            e.preventDefault()
            e.stopPropagation()
            moved.current = false
          }
        }}
        style={{ touchAction: 'pan-y' }}
        className="space-y-1"
      >
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
                  {list.slice(0, 3).map((it, i) => (
                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${dotOf(it)}`} />
                  ))}
                  {list.length > 3 && <span className="text-[9px] leading-none text-gray-400">+</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-violet-700">
          {cap(format(selected, 'EEEE d MMM', { locale: dateLocale() }))}
        </h3>
        {selectedItems.length > 0 ? (
          renderAgenda(selectedItems)
        ) : (
          <p className="text-sm text-gray-500">{t('sessions.noneThisDay')}</p>
        )}
      </div>
    </div>
  )
}
