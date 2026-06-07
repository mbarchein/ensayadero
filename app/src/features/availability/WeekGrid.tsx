// Generic weekly grid: painting (edit mode) or display (heatmap).
// Pointer events → works with mouse and touch (touch-action: none).

import { useRef, type ReactNode } from 'react'
import { addDays, format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { DAY_END_HOUR, DAY_START_HOUR, SLOT_MINUTES, SLOTS_PER_DAY, slotRange } from '../../lib/slots'

export interface CellPos {
  day: number
  slot: number
}

interface Props {
  weekMonday: Date
  renderCell: (pos: CellPos) => ReactNode
  cellClass: (pos: CellPos) => string
  onPaintStart?: (pos: CellPos) => void
  onPaintMove?: (pos: CellPos) => void
  onPaintEnd?: () => void
  onCellTap?: (pos: CellPos) => void
}

export default function WeekGrid({
  weekMonday,
  renderCell,
  cellClass,
  onPaintStart,
  onPaintMove,
  onPaintEnd,
  onCellTap,
}: Props) {
  const { t } = useTranslation()
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // refs, not state: pointermove runs synchronously after pointerdown and a
  // setState wouldn't be applied yet (stale closure).
  const paintingRef = useRef(false) // mouse/pen drag-paint
  const movedRef = useRef(false)
  const lastPos = useRef<CellPos | null>(null)
  // Touch gesture arbitration: a quick swipe paints (multiselect), a long-press
  // then move scrolls, a short tap cycles one cell.
  const modeRef = useRef<'idle' | 'pending' | 'paint' | 'scroll'>('idle')
  const startRef = useRef<{ x: number; y: number; pos: CellPos } | null>(null)
  const lastClient = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LONG_PRESS_MS = 250
  const MOVE_THRESHOLD = 8 // px before a swipe counts as painting

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

  return (
    <div className="select-none">
      {/* single scroll box so the day header (sticky top) and the hour column
          (sticky left) stay visible while scrolling in either direction */}
      <div ref={scrollRef} className="max-h-[70vh] overflow-auto overscroll-contain">
        <div
          ref={gridRef}
          // touch-action none: we arbitrate scroll vs paint ourselves (see refs).
          // Mouse keeps native behaviour.
          style={{ touchAction: 'none' }}
          className="grid min-w-[560px] grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
          onPointerDown={(e) => {
            const pos = posFromEvent(e)
            const editable = !!pos && !isPast(pos)
            movedRef.current = false
            lastClient.current = { x: e.clientX, y: e.clientY }
            if (e.pointerType !== 'touch') {
              // mouse/pen: immediate drag-paint on editable cells
              if (editable && onPaintStart) {
                paintingRef.current = true
                capture(e)
                onPaintStart(pos!)
              }
              return
            }
            // touch
            capture(e)
            if (!editable) {
              // header row, hour column or past area → scroll immediately
              modeRef.current = 'scroll'
              return
            }
            // editable cell: pending until we know swipe (paint) vs hold (scroll)
            lastPos.current = pos
            startRef.current = { x: e.clientX, y: e.clientY, pos: pos! }
            modeRef.current = 'pending'
            lpTimer.current = setTimeout(() => {
              if (modeRef.current === 'pending') modeRef.current = 'scroll'
            }, LONG_PRESS_MS)
          }}
          onPointerMove={(e) => {
            // mouse/pen drag-paint
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
                // quick swipe before the long-press fired → start multiselect
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
                // short tap → cycle one cell
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
          {/* corner: frozen on both axes */}
          <div className="sticky left-0 top-0 z-30 bg-white" />
          {/* day header: frozen on vertical scroll */}
          {Array.from({ length: 7 }, (_, d) => {
            const date = addDays(weekMonday, d)
            const isToday = format(date, 'yyyyMMdd') === format(new Date(), 'yyyyMMdd')
            return (
              <div
                key={`h${d}`}
                className={`sticky top-0 z-20 bg-white py-1 text-center text-xs font-medium ${
                  isToday ? 'font-bold text-violet-700' : 'text-gray-600'
                }`}
              >
                {format(date, 'EEE d', { locale: dateLocale() })}
              </div>
            )
          })}
          {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
            <Row
              key={s}
              slot={s}
              hours={hours}
              renderCell={renderCell}
              cellClass={cellClass}
              isPast={isPast}
            />
          ))}
        </div>
      </div>
      <p className="mt-1 text-center text-[10px] text-gray-400">
        {t('availability.gridFooter', { minutes: SLOT_MINUTES, start: DAY_START_HOUR, end: DAY_END_HOUR })}
      </p>
    </div>
  )
}

function Row({
  slot,
  hours,
  renderCell,
  cellClass,
  isPast,
}: {
  slot: number
  hours: number[]
  renderCell: Props['renderCell']
  cellClass: Props['cellClass']
  isPast: (pos: CellPos) => boolean
}) {
  const isHourStart = slot % 2 === 0
  return (
    <>
      <div className="sticky left-0 z-10 h-6 bg-white pr-1 text-right text-[10px] text-gray-400">
        {isHourStart && <span className="absolute -top-1.5 right-1">{hours[slot / 2]}:00</span>}
      </div>
      {Array.from({ length: 7 }, (_, day) => {
        const past = isPast({ day, slot })
        return (
          <div
            key={day}
            data-day={day}
            data-slot={slot}
            className={`h-6 overflow-hidden border-b border-r border-gray-100 ${
              isHourStart ? 'border-t border-t-gray-200' : ''
            } ${cellClass({ day, slot })} ${past ? 'opacity-35 grayscale' : ''}`}
          >
            {renderCell({ day, slot })}
          </div>
        )
      })}
    </>
  )
}
