// Weekly grid with two view modes:
//  - Week view (default): all 7 day columns, read-only. The day columns are a
//    3-panel carousel (prev/current/next week): dragging horizontally — on the
//    day header or on the cells — slides both in sync and shows the incoming
//    week's occupation while it appears. The hour column stays fixed.
//  - Day view: tap a day in the header to show only that day; editing (paint /
//    tap) is enabled here. The corner cell holds a button back to the week view.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { addDays, format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dateLocale } from '../../lib/dateLocale'
import { DAY_START_HOUR, SLOTS_PER_DAY, slotRange } from '../../lib/slots'

export interface CellPos {
  day: number
  slot: number
}

interface Props {
  weekMonday: Date
  /** ctx.weekMonday is the Monday of the panel being rendered: the carousel
      also renders the previous/next weeks. */
  renderCell: (pos: CellPos, ctx: { dayView: boolean; weekMonday: Date }) => ReactNode
  cellClass: (pos: CellPos, weekMonday: Date) => string
  onPaintStart?: (pos: CellPos) => void
  onPaintMove?: (pos: CellPos) => void
  onPaintEnd?: () => void
  onCellTap?: (pos: CellPos) => void
  /** Tap (no swipe) on a cell in week view. */
  onWeekCellTap?: (pos: CellPos) => void
  /** Fill the parent's height (flex child) instead of capping at 70vh. */
  fill?: boolean
  /** Horizontal swipe on the day header or the cells changes week. */
  onPrevWeek?: () => void
  onNextWeek?: () => void
  /** Notifies the parent when switching between week view and day (edit) view. */
  onViewChange?: (dayView: boolean) => void
  /** Controlled day-view selection: when provided, the parent owns which day
      is being edited (null = week view). */
  day?: number | null
  onDayChange?: (day: number | null) => void
  /** Increment to run a violet "wave" across the day strip — a hint that
      days are the tappable thing (e.g. after repeated taps on the
      read-only week cells). */
  hintPulse?: number
}

const HOUR_COL = '2.25rem'

export default function WeekGrid({
  weekMonday,
  renderCell,
  cellClass,
  onPaintStart,
  onPaintMove,
  onPaintEnd,
  onCellTap,
  onWeekCellTap,
  fill = false,
  onPrevWeek,
  onNextWeek,
  onViewChange,
  day,
  onDayChange,
  hintPulse = 0,
}: Props) {
  const { t } = useTranslation()
  // null = week view (all days, read-only); number = day view (editable).
  // Uncontrolled by default; controlled when the parent passes `day`.
  const [internalDay, setInternalDay] = useState<number | null>(null)
  const selectedDay = day !== undefined ? day : internalDay
  const setSelectedDay = (next: number | null | ((cur: number | null) => number | null)) => {
    const value = typeof next === 'function' ? next(selectedDay) : next
    if (day === undefined) setInternalDay(value)
    onDayChange?.(value)
  }
  const editing = selectedDay != null

  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // refs, not state: pointermove runs synchronously after pointerdown.
  const paintingRef = useRef(false)
  const movedRef = useRef(false)
  const lastPos = useRef<CellPos | null>(null)
  const modeRef = useRef<'idle' | 'pending' | 'paint' | 'scroll'>('idle')
  const startRef = useRef<{ x: number; y: number; pos: CellPos } | null>(null)
  const lastClient = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LONG_PRESS_MS = 250
  const MOVE_THRESHOLD = 8

  // week-view swipe started on the slot cells (drives the same carousel)
  const weekSwipeRef = useRef<'idle' | 'pending' | 'horizontal'>('idle')
  const weekStartRef = useRef<{ x: number; y: number } | null>(null)

  // Vertical swipe that can't scroll (the gesture started already at that
  // scroll edge) → self-triggered day-strip wave, hinting that days are the
  // tappable thing. Combined with the parent's hintPulse; a running wave
  // always completes before another can start.
  const [pullPulse, setPullPulse] = useState(0)
  const pullBusyUntil = useRef(0)
  const startScroll = useRef({ top: 0, max: 0 })
  // 0.5s pulse + 70ms stagger × 6 days (keep in sync with .day-wave in index.css)
  const PULL_WAVE_MS = 500 + 70 * 6
  const pullWave = () => {
    const now = Date.now()
    if (now < pullBusyUntil.current) return
    pullBusyUntil.current = now + PULL_WAVE_MS
    setPullPulse((n) => n + 1)
  }

  // week carousels: the day strip and the cell panels translate together.
  const stripRef = useRef<HTMLDivElement>(null)
  const bodyStripRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragStartX = useRef<number | null>(null)
  const swiped = useRef(false)
  const weekMondayRef = useRef(weekMonday)
  weekMondayRef.current = weekMonday
  const CENTER = 'translateX(-33.3333%)'

  const carousels = () => [stripRef.current, bodyStripRef.current].filter(Boolean) as HTMLDivElement[]

  // Recenter instantly whenever the week changes: the adjacent panel that was
  // dragged into view now renders the new current week → seamless transition.
  useLayoutEffect(() => {
    for (const el of carousels()) {
      el.style.transition = 'none'
      el.style.transform = CENTER
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekMonday])

  useEffect(() => {
    onViewChange?.(selectedDay != null)
  }, [selectedDay, onViewChange])

  const setDragOffset = (dx: number) => {
    for (const el of carousels()) el.style.transform = `translateX(calc(-33.3333% + ${dx}px))`
  }
  const beginDrag = () => {
    for (const el of carousels()) el.style.transition = 'none'
  }
  const recenter = () => {
    for (const el of carousels()) {
      el.style.transition = 'none'
      el.style.transform = CENTER
    }
  }
  const snapBack = () => {
    for (const el of carousels()) {
      el.style.transition = 'transform 0.2s ease-out'
      el.style.transform = CENTER
    }
  }
  const finishSwipe = (dir: 'prev' | 'next') => {
    for (const el of carousels()) {
      el.style.transition = 'transform 0.2s ease-out'
      el.style.transform = dir === 'next' ? 'translateX(-66.6667%)' : 'translateX(0%)'
    }
    const before = weekMondayRef.current.getTime()
    setTimeout(() => {
      if (dir === 'next') onNextWeek?.()
      else onPrevWeek?.()
      // clamped (week unchanged) → snap back to center
      setTimeout(() => {
        if (weekMondayRef.current.getTime() === before) recenter()
      }, 40)
    }, 200)
  }

  const now = new Date()
  const isPast = (pos: CellPos, monday: Date = weekMonday) =>
    slotRange(monday, pos.day, pos.slot).end <= now
  const sameCell = (a: CellPos | null, b: CellPos | null) =>
    !!a && !!b && a.day === b.day && a.slot === b.slot
  const clearLp = () => {
    if (lpTimer.current != null) clearTimeout(lpTimer.current)
    lpTimer.current = null
  }
  const capture = (e: React.PointerEvent) => {
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* not capturable in some environments; moves fall back to elementFromPoint */
    }
  }

  const posFromEvent = (e: React.PointerEvent): CellPos | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const cell = el?.closest('[data-day]') as HTMLElement | null
    if (!cell) return null
    return { day: Number(cell.dataset.day), slot: Number(cell.dataset.slot) }
  }

  const hours = Array.from({ length: SLOTS_PER_DAY / 2 }, (_, i) => DAY_START_HOUR + i)
  const todayKey = format(new Date(), 'yyyyMMdd')

  // week-view swipe gesture on the cell area (vertical drags keep native scroll)
  const weekSwipeHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      weekStartRef.current = { x: e.clientX, y: e.clientY }
      weekSwipeRef.current = 'pending'
      const el = scrollRef.current
      startScroll.current = el
        ? { top: el.scrollTop, max: el.scrollHeight - el.clientHeight }
        : { top: 0, max: 0 }
      beginDrag()
    },
    onPointerMove: (e: React.PointerEvent) => {
      const st = weekStartRef.current
      if (!st || weekSwipeRef.current === 'idle') return
      const dx = e.clientX - st.x
      const dy = e.clientY - st.y
      if (weekSwipeRef.current === 'pending') {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          weekSwipeRef.current = 'horizontal'
          capture(e)
        } else if (Math.abs(dy) > 10) {
          // a vertical swipe that has no scroll room in its direction is a
          // confused gesture → wave the day strip
          const s = startScroll.current
          if ((dy > 0 && s.top <= 0) || (dy < 0 && s.top >= s.max - 1)) pullWave()
          weekSwipeRef.current = 'idle' // vertical scroll wins
          return
        } else return
      }
      setDragOffset(dx)
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (weekSwipeRef.current === 'horizontal' && weekStartRef.current) {
        const dx = e.clientX - weekStartRef.current.x
        const w = viewportRef.current?.offsetWidth ?? 1
        const th = w * 0.3
        if (dx <= -th) finishSwipe('next')
        else if (dx >= th) finishSwipe('prev')
        else snapBack()
      } else if (weekSwipeRef.current === 'pending' && weekStartRef.current) {
        // no swipe, no scroll → a tap on a cell
        const moved = Math.hypot(
          e.clientX - weekStartRef.current.x,
          e.clientY - weekStartRef.current.y,
        )
        if (moved < MOVE_THRESHOLD && onWeekCellTap) {
          const pos = posFromEvent(e)
          if (pos) onWeekCellTap(pos)
        }
      }
      weekSwipeRef.current = 'idle'
      weekStartRef.current = null
    },
    onPointerCancel: () => {
      if (weekSwipeRef.current === 'horizontal') snapBack()
      weekSwipeRef.current = 'idle'
      weekStartRef.current = null
    },
  }

  return (
    <div className={`select-none ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      {/* week navigation (week view only): explicit prev/next for desktop;
          on touch the swipe carousel is the gesture, so hide below md */}
      {!editing && onPrevWeek && onNextWeek && (
        <div className="hidden items-center justify-between px-1 pb-1 md:flex">
          <button
            type="button"
            onClick={onPrevWeek}
            aria-label={t('availability.prevWeek')}
            title={t('availability.prevWeek')}
            className="rounded p-1 text-violet-700 hover:bg-violet-50"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs font-medium text-gray-700">
            {format(weekMonday, 'd', { locale: dateLocale() })}–
            {format(addDays(weekMonday, 6), 'd MMM', { locale: dateLocale() })}
          </span>
          <button
            type="button"
            onClick={onNextWeek}
            aria-label={t('availability.nextWeek')}
            title={t('availability.nextWeek')}
            className="rounded p-1 text-violet-700 hover:bg-violet-50"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {/* day selector header — always visible; drag to change week (carousel) */}
      <div className="flex border-b border-gray-200">
        {/* corner cell: empty — exiting day view is done from the page header
            (X) or by tapping the selected day again in the strip */}
        <div className="shrink-0" style={{ width: HOUR_COL }} />
        <div
          ref={viewportRef}
          className="relative flex-1 overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={(e) => {
            dragStartX.current = e.clientX
            swiped.current = false
            beginDrag()
          }}
          onPointerMove={(e) => {
            if (dragStartX.current == null) return
            const dx = e.clientX - dragStartX.current
            if (Math.abs(dx) > 10) swiped.current = true
            setDragOffset(dx)
          }}
          onPointerUp={(e) => {
            if (dragStartX.current == null) return
            const dx = e.clientX - dragStartX.current
            dragStartX.current = null
            const w = viewportRef.current?.offsetWidth ?? 1
            const th = w * 0.3
            if (dx <= -th) finishSwipe('next')
            else if (dx >= th) finishSwipe('prev')
            else snapBack()
          }}
          onPointerCancel={() => {
            dragStartX.current = null
            snapBack()
          }}
        >
          <div ref={stripRef} className="flex" style={{ width: '300%', transform: CENTER }}>
            <div className="shrink-0" style={{ width: '33.3333%' }}>
              <DayStripView weekMonday={addDays(weekMonday, -7)} todayKey={todayKey} />
            </div>
            <div className="shrink-0" style={{ width: '33.3333%' }}>
              <DayStripView
                weekMonday={weekMonday}
                todayKey={todayKey}
                interactive
                wave={hintPulse + pullPulse}
                selectedDay={selectedDay}
                onSelect={(d) => {
                  if (swiped.current) {
                    swiped.current = false
                    return
                  }
                  setSelectedDay((cur) => (cur === d ? null : d))
                }}
              />
            </div>
            <div className="shrink-0" style={{ width: '33.3333%' }}>
              <DayStripView weekMonday={addDays(weekMonday, 7)} todayKey={todayKey} />
            </div>
          </div>
        </div>
      </div>

      {/* body: vertical scroll */}
      <div
        ref={scrollRef}
        className={`overflow-auto overscroll-contain ${fill ? 'min-h-0 flex-1' : 'max-h-[70vh]'}`}
      >
        {editing ? (
          /* day view: single editable column (paint / tap) */
          <div
            ref={gridRef}
            style={{
              touchAction: 'none',
              gridTemplateColumns: `${HOUR_COL} minmax(0, 1fr)`,
            }}
            className="grid"
            onPointerDown={(e) => {
              const pos = posFromEvent(e)
              const ok = !!pos && !isPast(pos)
              movedRef.current = false
              lastClient.current = { x: e.clientX, y: e.clientY }
              if (e.pointerType !== 'touch') {
                if (ok && onPaintStart) {
                  paintingRef.current = true
                  capture(e)
                  onPaintStart(pos!)
                }
                return
              }
              capture(e)
              if (!ok) {
                modeRef.current = 'scroll'
                return
              }
              lastPos.current = pos
              startRef.current = { x: e.clientX, y: e.clientY, pos: pos! }
              modeRef.current = 'pending'
              lpTimer.current = setTimeout(() => {
                if (modeRef.current === 'pending') modeRef.current = 'scroll'
              }, LONG_PRESS_MS)
            }}
            onPointerMove={(e) => {
              if (paintingRef.current) {
                const pos = posFromEvent(e)
                if (!pos || isPast(pos) || sameCell(pos, lastPos.current)) return
                movedRef.current = true
                lastPos.current = pos
                onPaintMove?.(pos)
                return
              }
              if (e.pointerType !== 'touch' || modeRef.current === 'idle') return
              if (modeRef.current === 'pending') {
                const far =
                  Math.hypot(e.clientX - startRef.current!.x, e.clientY - startRef.current!.y) >
                  MOVE_THRESHOLD
                if (far) {
                  clearLp()
                  modeRef.current = 'paint'
                  movedRef.current = true
                  onPaintStart?.(startRef.current!.pos)
                  lastPos.current = startRef.current!.pos
                }
                lastClient.current = { x: e.clientX, y: e.clientY }
                return
              }
              if (modeRef.current === 'paint') {
                const pos = posFromEvent(e)
                if (pos && !isPast(pos) && !sameCell(pos, lastPos.current)) {
                  lastPos.current = pos
                  onPaintMove?.(pos)
                }
                lastClient.current = { x: e.clientX, y: e.clientY }
                return
              }
              // scroll: pan the box manually
              const el = scrollRef.current
              if (el) {
                el.scrollLeft -= e.clientX - lastClient.current.x
                el.scrollTop -= e.clientY - lastClient.current.y
              }
              lastClient.current = { x: e.clientX, y: e.clientY }
            }}
            onPointerUp={(e) => {
              clearLp()
              if (paintingRef.current) {
                paintingRef.current = false
                onPaintEnd?.()
              } else if (e.pointerType === 'touch') {
                if (modeRef.current === 'paint') {
                  onPaintEnd?.()
                } else if (modeRef.current === 'pending' && !movedRef.current) {
                  const pos = posFromEvent(e)
                  if (pos && !isPast(pos)) {
                    if (onCellTap) onCellTap(pos)
                    else if (onPaintStart) {
                      onPaintStart(pos)
                      onPaintEnd?.()
                    }
                  }
                }
              }
              modeRef.current = 'idle'
              startRef.current = null
            }}
            onPointerCancel={() => {
              clearLp()
              if (paintingRef.current) {
                paintingRef.current = false
                onPaintEnd?.()
              } else if (modeRef.current === 'paint') {
                onPaintEnd?.()
              }
              modeRef.current = 'idle'
              startRef.current = null
            }}
          >
            {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
              <Row
                key={s}
                slot={s}
                days={[selectedDay!]}
                dayView
                hours={hours}
                weekMonday={weekMonday}
                renderCell={renderCell}
                cellClass={cellClass}
                isPast={isPast}
              />
            ))}
          </div>
        ) : (
          /* week view: fixed hour column + 3-week cell carousel in sync with
             the day strip — the incoming week shows its real occupation */
          <div className="flex">
            <div className="shrink-0" style={{ width: HOUR_COL }}>
              {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
                <div
                  key={s}
                  className="relative h-5 pr-1 text-right text-[11px] font-medium text-gray-900"
                >
                  {s % 2 === 0 && <span className="absolute top-0.5 right-1">{hours[s / 2]}:00</span>}
                </div>
              ))}
            </div>
            <div
              className="relative flex-1 overflow-hidden"
              style={{ touchAction: 'pan-y' }}
              {...weekSwipeHandlers}
            >
              <div ref={bodyStripRef} className="flex" style={{ width: '300%', transform: CENTER }}>
                {[-7, 0, 7].map((off) => (
                  <div key={off} className="shrink-0" style={{ width: '33.3333%' }}>
                    <WeekCellsPanel
                      monday={addDays(weekMonday, off)}
                      renderCell={renderCell}
                      cellClass={cellClass}
                      isPast={isPast}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** One week of day×slot cells (7 columns), used as a carousel panel. */
function WeekCellsPanel({
  monday,
  renderCell,
  cellClass,
  isPast,
}: {
  monday: Date
  renderCell: Props['renderCell']
  cellClass: Props['cellClass']
  isPast: (pos: CellPos, monday: Date) => boolean
}) {
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: SLOTS_PER_DAY }, (_, slot) =>
        Array.from({ length: 7 }, (_, dayIdx) => {
          const pos = { day: dayIdx, slot }
          const past = isPast(pos, monday)
          return (
            <div
              key={`${dayIdx}:${slot}`}
              data-day={dayIdx}
              data-slot={slot}
              className={`h-5 overflow-hidden border-b border-r border-gray-100 ${
                slot % 2 === 0 ? 'border-t border-t-gray-200' : ''
              } ${cellClass(pos, monday)} ${past ? 'opacity-35 grayscale' : ''}`}
            >
              {renderCell(pos, { dayView: false, weekMonday: monday })}
            </div>
          )
        }),
      )}
    </div>
  )
}

function DayStripView({
  weekMonday,
  todayKey,
  interactive = false,
  wave = 0,
  selectedDay = null,
  onSelect,
}: {
  weekMonday: Date
  todayKey: string
  interactive?: boolean
  /** Re-runs the staggered violet pulse on every increment (key change). */
  wave?: number
  selectedDay?: number | null
  onSelect?: (day: number) => void
}) {
  // Fixed Monday-first weekday letters ('X' for miércoles), per language.
  const letters = (dateLocale().code ?? 'en').startsWith('es')
    ? ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <div className="grid w-full grid-cols-7">
      {Array.from({ length: 7 }, (_, d) => {
        const date = addDays(weekMonday, d)
        const isToday = format(date, 'yyyyMMdd') === todayKey
        const isSel = interactive && selectedDay === d
        const cls = `flex flex-col items-center pb-0.5 text-center leading-tight ${
          isSel
            ? 'bg-violet-600 font-bold text-white'
            : isToday
              ? 'font-bold text-gray-900'
              : 'text-gray-700'
        } ${interactive ? 'transition' : ''}`
        const inner = (
          <>
            <span
              className={`text-[11px] uppercase leading-none ${isToday || isSel ? 'font-bold' : 'font-medium'}`}
            >
              {letters[d]}
            </span>
            <span className={`text-[9px] uppercase ${isSel ? 'text-violet-200' : 'text-gray-600'}`}>
              {format(date, 'MMM', { locale: dateLocale() }).replace('.', '')}
            </span>
            <span className={`text-sm leading-none ${isToday || isSel ? 'font-bold' : ''}`}>
              {format(date, 'd')}
            </span>
          </>
        )
        return interactive ? (
          <button
            // wave in the key restarts the CSS animation on each pulse
            key={`${d}:${wave}`}
            onClick={() => onSelect?.(d)}
            className={`${cls} ${wave > 0 ? 'day-wave' : ''}`}
            style={wave > 0 ? { animationDelay: `${d * 70}ms` } : undefined}
          >
            {inner}
          </button>
        ) : (
          <div key={d} className={cls}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}

function Row({
  slot,
  days,
  dayView,
  hours,
  weekMonday,
  renderCell,
  cellClass,
  isPast,
}: {
  slot: number
  days: number[]
  dayView: boolean
  hours: number[]
  weekMonday: Date
  renderCell: Props['renderCell']
  cellClass: Props['cellClass']
  isPast: (pos: CellPos) => boolean
}) {
  const isHourStart = slot % 2 === 0
  return (
    <>
      <div className="relative h-5 pr-1 text-right text-[11px] font-medium text-gray-900">
        {isHourStart && <span className="absolute top-0.5 right-1">{hours[slot / 2]}:00</span>}
      </div>
      {days.map((day) => {
        const past = isPast({ day, slot })
        return (
          <div
            key={day}
            data-day={day}
            data-slot={slot}
            className={`h-5 overflow-hidden border-b border-r border-gray-100 ${
              isHourStart ? 'border-t border-t-gray-200' : ''
            } ${cellClass({ day, slot }, weekMonday)} ${past ? 'opacity-35 grayscale' : ''}`}
          >
            {renderCell({ day, slot }, { dayView, weekMonday })}
          </div>
        )
      })}
    </>
  )
}
