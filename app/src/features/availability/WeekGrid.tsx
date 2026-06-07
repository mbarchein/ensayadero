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
  // ref, not state: the pointermove handler runs synchronously after
  // pointerdown and a setState wouldn't be applied yet (stale closure).
  const paintingRef = useRef(false)
  const movedRef = useRef(false)
  const lastPos = useRef<CellPos | null>(null)
  const now = new Date()
  const isPast = (pos: CellPos) => slotRange(weekMonday, pos.day, pos.slot).end <= now

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
      <div
        className="max-h-[70vh] overflow-auto overscroll-contain"
        // Allow the box to scroll on touch (pan-x/pan-y). Drag-to-paint is
        // mouse/pen only; touch paints via tap (a drag can't both scroll+paint).
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div
          ref={gridRef}
          className="grid min-w-[560px] grid-cols-[3rem_repeat(7,1fr)]"
          onPointerDown={(e) => {
            const pos = posFromEvent(e)
            if (!pos || isPast(pos)) return // the past is not editable
            movedRef.current = false
            lastPos.current = pos
            // touch is reserved for scrolling; it paints on tap (pointerup)
            if (onPaintStart && e.pointerType !== 'touch') {
              paintingRef.current = true
              try {
                gridRef.current?.setPointerCapture(e.pointerId)
              } catch {
                /* pointer not capturable (some environments); moves fall through via elementFromPoint */
              }
              onPaintStart(pos)
            }
          }}
          onPointerMove={(e) => {
            if (!paintingRef.current) return
            const pos = posFromEvent(e)
            if (!pos || isPast(pos)) return
            // ignore moves within the same cell (avoids false "moved" on taps)
            if (lastPos.current && pos.day === lastPos.current.day && pos.slot === lastPos.current.slot)
              return
            movedRef.current = true
            lastPos.current = pos
            onPaintMove?.(pos)
          }}
          onPointerUp={(e) => {
            if (paintingRef.current) {
              paintingRef.current = false
              onPaintEnd?.()
            }
            // a stationary tap: cycle one cell (touch) or fire onCellTap
            if (!movedRef.current) {
              const pos = posFromEvent(e)
              if (pos && !isPast(pos)) {
                if (onCellTap) onCellTap(pos)
                else if (e.pointerType === 'touch' && onPaintStart) {
                  onPaintStart(pos)
                  onPaintEnd?.()
                }
              }
            }
          }}
          onPointerCancel={() => {
            paintingRef.current = false
            onPaintEnd?.()
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
            className={`h-6 border-b border-r border-gray-100 ${
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
