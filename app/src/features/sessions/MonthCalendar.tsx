// Generic month grid (alternative to a list view). Its own lightweight grid —
// NOT the WeekGrid — so it has no touch-action caveat and can show the selected
// day's agenda below it. The caller supplies how to read each item's date, its
// dot color, and how to render the selected day's agenda; so it works for both
// the group sessions list and the cross-group "Upcoming" view.
//
// Days carry up to three colored dots; tapping a day lists its items below.
// The arrows change month instantly; a horizontal swipe slides a 3-panel
// carousel (prev/current/next) like the WeekGrid and snaps to the new month.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
const CENTER = 'translateX(-33.3333%)'

export default function MonthCalendar<T>({
  items,
  dateOf,
  dotOf,
  renderAgenda,
  emptyDayLabel,
}: {
  items: T[]
  dateOf: (item: T) => Date
  dotOf: (item: T) => string
  renderAgenda: (dayItems: T[]) => ReactNode
  emptyDayLabel?: string
}) {
  const { t } = useTranslation()
  const today = new Date()
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selected, setSelected] = useState<Date | null>(today)

  // changing month clears the day selection (and its agenda below)
  const goMonth = (delta: number) => {
    setMonth((m) => addMonths(m, delta))
    setSelected(null)
  }

  // bucket items by day (and keep each day time-ascending)
  const byDay = new Map<string, T[]>()
  for (const it of items) {
    const k = dayKey(dateOf(it))
    const arr = byDay.get(k)
    if (arr) arr.push(it)
    else byDay.set(k, [it])
  }
  for (const arr of byDay.values()) arr.sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())

  const letters = (dateLocale().code ?? 'en').startsWith('es')
    ? ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const selectedItems = selected ? (byDay.get(dayKey(selected)) ?? []) : []

  // ── carousel: 3 month panels, current centered; swipe slides to a neighbour ──
  const stripRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiping = useRef(false)

  // recenter (no animation) after any month change: the panel we slid to and
  // the new centre panel render the same month, so the swap is seamless.
  useLayoutEffect(() => {
    const s = stripRef.current
    if (s) {
      s.style.transition = 'none'
      s.style.transform = CENTER
    }
  }, [month])

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    swiping.current = false
    if (stripRef.current) stripRef.current.style.transition = 'none'
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!swiping.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        swiping.current = true
      } else if (Math.abs(dy) > 10) {
        start.current = null // vertical scroll wins
        return
      } else return
    }
    if (stripRef.current)
      stripRef.current.style.transform = `translateX(calc(-33.3333% + ${dx}px))`
  }
  const snap = (transform: string) => {
    const s = stripRef.current
    if (s) {
      s.style.transition = 'transform 0.2s ease-out'
      s.style.transform = transform
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const st = start.current
    start.current = null
    if (!st) return
    // a tap (never crossed the swipe threshold) → select the day under it.
    // Detecting selection here (not via the buttons' onClick) avoids the
    // swipe-release click racing with the gesture.
    if (!swiping.current) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 12) {
        const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
          '[data-date]',
        ) as HTMLElement | null
        const iso = cell?.dataset.date
        if (iso) {
          const [y, m, d] = iso.split('-').map(Number)
          setSelected(new Date(y, m - 1, d))
        }
      }
      return
    }
    swiping.current = false
    const dx = e.clientX - st.x
    const viewport = (stripRef.current?.offsetWidth ?? 3) / 3
    const th = viewport * 0.3
    if (dx <= -th) {
      setSelected(null)
      snap('translateX(-66.6667%)') // slide in next month
      setTimeout(() => setMonth((m) => addMonths(m, 1)), 200)
    } else if (dx >= th) {
      setSelected(null)
      snap('translateX(0%)') // slide in previous month
      setTimeout(() => setMonth((m) => addMonths(m, -1)), 200)
    } else {
      snap(CENTER) // not far enough: snap back
    }
  }

  const renderMonthGrid = (monthDate: Date) => {
    const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }),
    })
    return (
      <div
        key={format(monthDate, 'yyyy-MM')}
        className="shrink-0 space-y-1 px-0.5 pb-0.5"
        style={{ width: '33.3333%' }}
      >
        <p className="px-8 pb-1 text-center font-semibold">
          {cap(format(monthDate, 'LLLL yyyy', { locale: dateLocale() }))}
        </p>
        <div className="grid grid-cols-7 border-b border-gray-200 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-violet-400">
          {letters.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const inMonth = isSameMonth(d, monthDate)
            const past = dayKey(d) < dayKey(today)
            const list = byDay.get(dayKey(d)) ?? []
            return (
              <button
                key={dayKey(d)}
                type="button"
                data-date={dayKey(d)}
                className={`flex h-12 flex-col items-center gap-1 rounded-lg py-1 text-sm transition ${
                  selected && isSameDay(d, selected)
                    ? 'bg-violet-100 ring-1 ring-violet-300'
                    : inMonth && past
                      ? 'bg-gray-100'
                      : 'hover:bg-gray-50'
                } ${
                  !inMonth
                    ? 'text-gray-300'
                    : isToday(d)
                      ? 'font-bold text-violet-700'
                      : past
                        ? 'text-gray-400'
                        : 'text-gray-800'
                }`}
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
    )
  }

  return (
    <div className="space-y-4">
      {/* arrows fixed at the corners; the month label lives inside each panel so
          it slides with the grid */}
      <div className="relative">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label={t('sessions.prevMonth')}
          className="absolute left-0 top-0 z-10 rounded p-1.5 text-violet-700 hover:bg-violet-50"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label={t('sessions.nextMonth')}
          className="absolute right-0 top-0 z-10 rounded p-1.5 text-violet-700 hover:bg-violet-50"
        >
          <ChevronRight size={20} />
        </button>
        <div
          className="overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            start.current = null
            swiping.current = false
            snap(CENTER)
          }}
        >
          <div ref={stripRef} className="flex" style={{ width: '300%', transform: CENTER }}>
            {renderMonthGrid(addMonths(month, -1))}
            {renderMonthGrid(month)}
            {renderMonthGrid(addMonths(month, 1))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-violet-700">
            {cap(format(selected, 'EEEE d MMM yyyy', { locale: dateLocale() }))}
          </h3>
          {selectedItems.length > 0 ? (
            renderAgenda(selectedItems)
          ) : (
            <p className="text-sm text-gray-500">{emptyDayLabel ?? t('sessions.noneThisDay')}</p>
          )}
        </div>
      )}
    </div>
  )
}
