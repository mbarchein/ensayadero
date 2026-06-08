// Weekly grid with two view modes:
//  - Week view (default): all 7 day columns, read-only, vertical scroll only.
//  - Day view: tap a day in the header to show only that day; editing (paint /
//    tap) is enabled here. The corner cell holds a button back to the week view.
// The day-selector header is always visible (7 buttons); swiping it left/right
// moves to the next/previous week.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { addDays, format } from 'date-fns'
import { CalendarRange } from 'lucide-react'
import { dateLocale } from '../../lib/dateLocale'
import { DAY_START_HOUR, SLOTS_PER_DAY, slotRange } from '../../lib/slots'

export interface CellPos {
  day: number
  slot: number
}

interface Props {
  weekMonday: Date
  renderCell: (pos: CellPos, ctx: { dayView: boolean }) => ReactNode
  cellClass: (pos: CellPos) => string
  onPaintStart?: (pos: CellPos) => void
  onPaintMove?: (pos: CellPos) => void
  onPaintEnd?: () => void
  onCellTap?: (pos: CellPos) => void
  /** Fill the parent's height (flex child) instead of capping at 70vh. */
  fill?: boolean
  /** Horizontal swipe on the day header changes week. */
  onPrevWeek?: () => void
  onNextWeek?: () => void
  /** Notifies the parent when switching between week view and day (edit) view. */
  onViewChange?: (dayView: boolean) => void
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
  fill = false,
  onPrevWeek,
  onNextWeek,
  onViewChange,
}: Props) {
  // null = week view (all days, read-only); number = day view (editable).
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const editing = selectedDay != null
  const days = editing ? [selectedDay] : [0, 1, 2, 3, 4, 5, 6]

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

  // header week carousel: drag the day strip, snap to prev/next week.
  const stripRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragStartX = useRef<number | null>(null)
  const swiped = useRef(false)
  const weekMondayRef = useRef(weekMonday)
  weekMondayRef.current = weekMonday
  const CENTER = 'translateX(-33.3333%)'

  // Recenter instantly whenever the week changes: the adjacent strip that was
  // dragged into view now renders the new current week → seamless transition.
  useLayoutEffect(() => {
    const el = stripRef.current
    if (el) {
      el.style.transition = 'none'
      el.style.transform = CENTER
    }
  }, [weekMonday])

  useEffect(() => {
    onViewChange?.(selectedDay != null)
  }, [selectedDay, onViewChange])

  const recenter = () => {
    const el = stripRef.current
    if (el) {
      el.style.transition = 'none'
      el.style.transform = CENTER
    }
  }
  const snapBack = () => {
    const el = stripRef.current
    if (el) {
      el.style.transition = 'transform 0.2s ease-out'
      el.style.transform = CENTER
    }
  }
  const finishSwipe = (dir: 'prev' | 'next') => {
    const el = stripRef.current
    if (!el) return
    el.style.transition = 'transform 0.2s ease-out'
    el.style.transform = dir === 'next' ? 'translateX(-66.6667%)' : 'translateX(0%)'
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
  const isPast = (pos: CellPos) => slotRange(weekMonday, pos.day, pos.slot).end <= now
  const sameCell = (a: CellPos | null, b: CellPos | null) =>
    !!a && !!b && a.day === b.day && a.slot === b.slot
  const clearLp = () => {
    if (lpTimer.current != null) clearTimeout(lpTimer.current)
    lpTimer.current = null
  }
  const capture = (e: React.PointerEvent) => {
    try {
      gridRef.current?.setPointerCapture(e.pointerId)
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

  return (
    <div className={`select-none ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      {/* day selector header — always visible; drag to change week (carousel) */}
      <div className="flex border-b border-gray-200">
        <div className="flex shrink-0 items-center justify-center" style={{ width: HOUR_COL }}>
          {editing && (
            <button
              onClick={() => setSelectedDay(null)}
              aria-label="Semana"
              className="rounded p-1 text-violet-700 hover:bg-violet-50"
            >
              <CalendarRange size={16} />
            </button>
          )}
        </div>
        <div
          ref={viewportRef}
          className="relative flex-1 overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={(e) => {
            dragStartX.current = e.clientX
            swiped.current = false
            if (stripRef.current) stripRef.current.style.transition = 'none'
          }}
          onPointerMove={(e) => {
            if (dragStartX.current == null) return
            const dx = e.clientX - dragStartX.current
            if (Math.abs(dx) > 10) swiped.current = true
            if (stripRef.current)
              stripRef.current.style.transform = `translateX(calc(-33.3333% + ${dx}px))`
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

      {/* body: vertical scroll; editing (paint) only in day view */}
      <div
        ref={scrollRef}
        className={`overflow-auto overscroll-contain ${fill ? 'min-h-0 flex-1' : 'max-h-[70vh]'}`}
      >
        <div
          ref={gridRef}
          style={{
            touchAction: editing ? 'none' : 'auto',
            gridTemplateColumns: `${HOUR_COL} repeat(${days.length}, minmax(0, 1fr))`,
          }}
          className="grid"
          onPointerDown={(e) => {
            if (!editing) return
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
            if (!editing) return
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
            if (!editing) return
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
            if (!editing) return
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
              days={days}
              dayView={editing}
              hours={hours}
              renderCell={renderCell}
              cellClass={cellClass}
              isPast={isPast}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayStripView({
  weekMonday,
  todayKey,
  interactive = false,
  selectedDay = null,
  onSelect,
}: {
  weekMonday: Date
  todayKey: string
  interactive?: boolean
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
        const cls = `flex flex-col items-center py-1 text-center leading-tight ${
          isSel
            ? 'bg-violet-600 font-bold text-white'
            : isToday
              ? 'font-bold text-gray-900'
              : 'text-gray-700'
        } ${interactive ? 'transition' : ''}`
        const inner = (
          <>
            <span className={`text-[11px] uppercase ${isToday || isSel ? 'font-bold' : 'font-medium'}`}>
              {letters[d]}
            </span>
            <span className={`text-[9px] uppercase ${isSel ? 'text-violet-200' : 'text-gray-500'}`}>
              {format(date, 'MMM', { locale: dateLocale() }).replace('.', '')}
            </span>
            <span className={`text-sm ${isToday || isSel ? 'font-bold' : ''}`}>{format(date, 'd')}</span>
          </>
        )
        return interactive ? (
          <button key={d} onClick={() => onSelect?.(d)} className={cls}>
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
  renderCell,
  cellClass,
  isPast,
}: {
  slot: number
  days: number[]
  dayView: boolean
  hours: number[]
  renderCell: Props['renderCell']
  cellClass: Props['cellClass']
  isPast: (pos: CellPos) => boolean
}) {
  const isHourStart = slot % 2 === 0
  return (
    <>
      <div className="relative h-5 pr-1 text-right text-[10px] font-medium text-gray-900">
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
            } ${cellClass({ day, slot })} ${past ? 'opacity-35 grayscale' : ''}`}
          >
            {renderCell({ day, slot }, { dayView })}
          </div>
        )
      })}
    </>
  )
}
