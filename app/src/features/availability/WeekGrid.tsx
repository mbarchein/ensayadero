// Rejilla semanal genérica: pintado (modo edición) o visualización (heatmap).
// Pointer events → funciona con ratón y táctil (touch-action: none).

import { useRef, type ReactNode } from 'react'
import { addDays, format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { DAY_END_HOUR, DAY_START_HOUR, SLOT_MINUTES, SLOTS_PER_DAY } from '../../lib/slots'

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
  // ref, no state: el handler de pointermove se ejecuta síncronamente tras
  // pointerdown y un setState no estaría aplicado todavía (closure obsoleta).
  const paintingRef = useRef(false)
  const movedRef = useRef(false)
  const lastPos = useRef<CellPos | null>(null)

  const posFromEvent = (e: React.PointerEvent): CellPos | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const cell = el?.closest('[data-day]') as HTMLElement | null
    if (!cell) return null
    return { day: Number(cell.dataset.day), slot: Number(cell.dataset.slot) }
  }

  const hours = Array.from({ length: SLOTS_PER_DAY / 2 }, (_, i) => DAY_START_HOUR + i)

  return (
    <div className="select-none overflow-x-auto">
      <div className="min-w-[560px]">
        {/* cabecera días */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] text-center text-xs font-medium text-gray-600">
          <div />
          {Array.from({ length: 7 }, (_, d) => {
            const date = addDays(weekMonday, d)
            const isToday = format(date, 'yyyyMMdd') === format(new Date(), 'yyyyMMdd')
            return (
              <div key={d} className={`py-1 ${isToday ? 'font-bold text-violet-700' : ''}`}>
                {format(date, 'EEE d', { locale: dateLocale() })}
              </div>
            )
          })}
        </div>

        <div
          ref={gridRef}
          className="grid touch-none grid-cols-[3rem_repeat(7,1fr)]"
          onPointerDown={(e) => {
            const pos = posFromEvent(e)
            if (!pos) return
            movedRef.current = false
            if (onPaintStart) {
              paintingRef.current = true
              lastPos.current = pos
              try {
                gridRef.current?.setPointerCapture(e.pointerId)
              } catch {
                /* puntero no capturable (algunos entornos); moves caen vía elementFromPoint */
              }
              onPaintStart(pos)
            }
          }}
          onPointerMove={(e) => {
            if (!paintingRef.current) return
            const pos = posFromEvent(e)
            if (!pos) return
            // ignorar moves dentro de la misma celda (evita falsos "moved" en taps)
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
            if (!movedRef.current && onCellTap) {
              const pos = posFromEvent(e)
              if (pos) onCellTap(pos)
            }
          }}
          onPointerCancel={() => {
            paintingRef.current = false
            onPaintEnd?.()
          }}
        >
          {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
            <Row key={s} slot={s} hours={hours} renderCell={renderCell} cellClass={cellClass} />
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
}: {
  slot: number
  hours: number[]
  renderCell: Props['renderCell']
  cellClass: Props['cellClass']
}) {
  const isHourStart = slot % 2 === 0
  return (
    <>
      <div className="relative h-6 pr-1 text-right text-[10px] text-gray-400">
        {isHourStart && <span className="absolute -top-1.5 right-1">{hours[slot / 2]}:00</span>}
      </div>
      {Array.from({ length: 7 }, (_, day) => (
        <div
          key={day}
          data-day={day}
          data-slot={slot}
          className={`h-6 border-b border-r border-gray-100 ${
            isHourStart ? 'border-t border-t-gray-200' : ''
          } ${cellClass({ day, slot })}`}
        >
          {renderCell({ day, slot })}
        </div>
      ))}
    </>
  )
}
