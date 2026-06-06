// Lógica de slots de calendario: expansión de disponibilidades (con recurrencia),
// descuento de ocupaciones (D1) y cálculo de heatmap. Pura, sin dependencias de UI.

import { RRule } from 'rrule'
import { addDays, addMinutes, startOfWeek } from 'date-fns'
import type { Availability, AvailabilityKind } from './types'
import { parseRange, subtract, overlaps, type TimeRange } from './ranges'

export const SLOT_MINUTES = 30
export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 23
export const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES

export interface ExpandedInterval extends TimeRange {
  kind: AvailabilityKind
  sourceId: string
}

/** Lunes 00:00 local de la semana que contiene `d`. */
export function weekStart(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 })
}

/** Expande una disponibilidad (puntual o recurrente) dentro de una ventana. */
export function expandAvailability(
  av: Availability,
  windowStart: Date,
  windowEnd: Date,
): ExpandedInterval[] {
  const base = parseRange(av.time_range)
  const durationMs = base.end.getTime() - base.start.getTime()
  const exceptions = new Set(av.exception_dates ?? [])

  const make = (start: Date): ExpandedInterval | null => {
    const end = new Date(start.getTime() + durationMs)
    const interval = { start, end }
    if (!overlaps(interval, { start: windowStart, end: windowEnd })) return null
    if (exceptions.has(isoDay(start))) return null
    return { ...interval, kind: av.kind, sourceId: av.id }
  }

  if (!av.rrule) {
    const one = make(base.start)
    return one ? [one] : []
  }

  const rule = RRule.fromString(
    av.rrule.includes('DTSTART')
      ? av.rrule
      : `DTSTART:${toRRuleDate(base.start)}\nRRULE:${av.rrule.replace(/^RRULE:/, '')}`,
  )
  // margen de un día por husos horarios
  const occurrences = rule.between(addDays(windowStart, -1), addDays(windowEnd, 1), true)
  return occurrences.map(make).filter((x): x is ExpandedInterval => x !== null)
}

function toRRuleDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Slot (día, índice) → rango temporal real. */
export function slotRange(weekMonday: Date, dayIndex: number, slotIndex: number): TimeRange {
  const day = addDays(weekMonday, dayIndex)
  const start = addMinutes(
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_START_HOUR),
    slotIndex * SLOT_MINUTES,
  )
  return { start, end: addMinutes(start, SLOT_MINUTES) }
}

export type SlotState = 'NONE' | 'AVAILABLE' | 'PREFERRED'

/** Matriz semanal [día][slot] del estado de disponibilidad de UN usuario. */
export function weekGrid(
  availabilities: Availability[],
  weekMonday: Date,
): SlotState[][] {
  const windowEnd = addDays(weekMonday, 7)
  const intervals = availabilities.flatMap((a) => expandAvailability(a, weekMonday, windowEnd))
  const grid: SlotState[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: SLOTS_PER_DAY }, () => 'NONE' as SlotState),
  )
  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const r = slotRange(weekMonday, d, s)
      for (const iv of intervals) {
        if (overlaps(iv, r)) {
          // PREFERRED pisa AVAILABLE
          if (grid[d][s] !== 'PREFERRED') grid[d][s] = iv.kind === 'PREFERRED' ? 'PREFERRED' : 'AVAILABLE'
        }
      }
    }
  }
  return grid
}

export interface UserWeekData {
  userId: string
  availabilities: Availability[]
  busy: TimeRange[] // sesiones confirmadas en cualquier grupo (D1)
}

export interface HeatCell {
  available: string[] // userIds disponibles (tras descontar busy)
  preferred: string[]
  busy: string[] // disponibles según pintado pero ocupados por otra sesión
}

/** Heatmap semanal [día][slot] para un conjunto de usuarios. */
export function heatmap(users: UserWeekData[], weekMonday: Date): HeatCell[][] {
  const windowEnd = addDays(weekMonday, 7)
  const expanded = users.map((u) => ({
    userId: u.userId,
    free: u.availabilities
      .flatMap((a) => expandAvailability(a, weekMonday, windowEnd))
      .flatMap((iv) => subtract(iv, u.busy).map((r) => ({ ...r, kind: iv.kind }))),
    painted: u.availabilities.flatMap((a) => expandAvailability(a, weekMonday, windowEnd)),
    busy: u.busy,
  }))

  const grid: HeatCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: SLOTS_PER_DAY }, () => ({ available: [], preferred: [], busy: [] })),
  )

  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const r = slotRange(weekMonday, d, s)
      const cell = grid[d][s]
      for (const u of expanded) {
        const freeHit = u.free.find((iv) => overlaps(iv, r))
        if (freeHit) {
          cell.available.push(u.userId)
          if (freeHit.kind === 'PREFERRED') cell.preferred.push(u.userId)
        } else if (u.painted.some((iv) => overlaps(iv, r)) && u.busy.some((b) => overlaps(b, r))) {
          cell.busy.push(u.userId)
        }
      }
    }
  }
  return grid
}

/** Franjas contiguas donde TODOS los `requiredIds` están disponibles. */
export function fullCoverageRanges(
  grid: HeatCell[][],
  requiredIds: string[],
  weekMonday: Date,
): TimeRange[] {
  if (requiredIds.length === 0) return []
  const out: TimeRange[] = []
  for (let d = 0; d < 7; d++) {
    let runStart: number | null = null
    for (let s = 0; s <= SLOTS_PER_DAY; s++) {
      const ok =
        s < SLOTS_PER_DAY && requiredIds.every((id) => grid[d][s].available.includes(id))
      if (ok && runStart === null) runStart = s
      if (!ok && runStart !== null) {
        out.push({
          start: slotRange(weekMonday, d, runStart).start,
          end: slotRange(weekMonday, d, s - 1).end,
        })
        runStart = null
      }
    }
  }
  return out
}
