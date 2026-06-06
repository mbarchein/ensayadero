// Calendario personal de disponibilidad (D1: global, no por grupo).
// Pintar arrastrando; tap cicla NONE → AVAILABLE → PREFERRED → NONE.
// "Repetir cada semana" convierte los bloques de la semana en recurrentes.

import { useMemo, useState } from 'react'
import { addDays, addWeeks, format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatRange } from '../../lib/ranges'
import {
  SLOTS_PER_DAY,
  isoDay,
  slotRange,
  weekGrid,
  weekStart,
  type SlotState,
} from '../../lib/slots'
import WeekGrid, { type CellPos } from './WeekGrid'
import { Button, Spinner } from '../../components/ui'
import type { Availability } from '../../lib/types'

const CYCLE: Record<SlotState, SlotState> = {
  NONE: 'AVAILABLE',
  AVAILABLE: 'PREFERRED',
  PREFERRED: 'NONE',
}

const CELL_STYLE: Record<SlotState, string> = {
  NONE: 'bg-white',
  AVAILABLE: 'bg-green-300',
  PREFERRED: 'bg-green-600',
}

export default function AvailabilityPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = useMemo(() => addWeeks(weekStart(new Date()), weekOffset), [weekOffset])

  const { data: availabilities, isLoading } = useQuery({
    queryKey: ['availabilities', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availabilities')
        .select('*')
        .eq('user_id', profile!.id)
      if (error) throw error
      return data as Availability[]
    },
    enabled: !!profile,
  })

  // estado local de la semana visible (optimistic, se persiste al soltar)
  const serverGrid = useMemo(
    () => (availabilities ? weekGrid(availabilities, monday) : null),
    [availabilities, monday],
  )
  const [draft, setDraft] = useState<SlotState[][] | null>(null)
  const [paintValue, setPaintValue] = useState<SlotState>('AVAILABLE')
  const grid = draft ?? serverGrid

  const save = useMutation({
    mutationFn: async (newGrid: SlotState[][]) => {
      // Estrategia simple y robusta: reemplazar las disponibilidades NO recurrentes
      // que solapan esta semana por los bloques pintados. Las recurrentes se
      // convierten con "Repetir cada semana".
      const weekEnd = addDays(monday, 7)
      const { error: delError } = await supabase
        .from('availabilities')
        .delete()
        .eq('user_id', profile!.id)
        .is('rrule', null)
        .filter('time_range', 'ov', `[${monday.toISOString()},${weekEnd.toISOString()})`)
      if (delError) throw delError

      const rows = gridToRanges(newGrid, monday).map((r) => ({
        user_id: profile!.id,
        time_range: formatRange(r.start, r.end),
        kind: r.kind,
      }))
      if (rows.length > 0) {
        const { error } = await supabase.from('availabilities').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availabilities'] })
      setDraft(null)
    },
  })

  const clearWeek = useMutation({
    mutationFn: async () => {
      const weekEnd = addDays(monday, 7)
      // puntuales que solapan la semana → fuera
      const { error: delError } = await supabase
        .from('availabilities')
        .delete()
        .eq('user_id', profile!.id)
        .is('rrule', null)
        .filter('time_range', 'ov', `[${monday.toISOString()},${weekEnd.toISOString()})`)
      if (delError) throw delError
      // recurrentes → añadir los 7 días como excepciones
      const weekDays = Array.from({ length: 7 }, (_, i) => isoDay(addDays(monday, i)))
      const recurring = (availabilities ?? []).filter((a) => a.rrule)
      for (const a of recurring) {
        const merged = [...new Set([...(a.exception_dates ?? []), ...weekDays])]
        const { error } = await supabase
          .from('availabilities')
          .update({ exception_dates: merged })
          .eq('id', a.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availabilities'] })
      setDraft(null)
    },
  })

  const makeRecurring = useMutation({
    mutationFn: async () => {
      if (!grid) return
      // bloques de esta semana → filas recurrentes semanales
      const rows = gridToRanges(grid, monday).map((r) => ({
        user_id: profile!.id,
        time_range: formatRange(r.start, r.end),
        kind: r.kind,
        rrule: 'FREQ=WEEKLY',
      }))
      // eliminar pintado previo (puntual y recurrente) para evitar duplicados
      await supabase.from('availabilities').delete().eq('user_id', profile!.id)
      if (rows.length > 0) {
        const { error } = await supabase.from('availabilities').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availabilities'] }),
  })

  if (isLoading || !grid) return <Spinner />

  const applyCell = (pos: CellPos, value: SlotState) => {
    setDraft((prev) => {
      const base = prev ?? serverGrid!
      const copy = base.map((col) => [...col])
      copy[pos.day][pos.slot] = value
      return copy
    })
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('availability.title')}</h1>
      </header>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setWeekOffset((w) => w - 1)} aria-label={t('availability.prevWeek')}>
          ‹
        </Button>
        <span className="text-sm font-medium">
          {format(monday, "d MMM", { locale: dateLocale() })} – {format(addDays(monday, 6), "d MMM yyyy", { locale: dateLocale() })}
          {weekOffset === 0 && ` ${t('availability.thisWeek')}`}
        </span>
        <Button variant="ghost" onClick={() => setWeekOffset((w) => w + 1)} aria-label={t('availability.nextWeek')}>
          ›
        </Button>
      </div>

      <WeekGrid
        weekMonday={monday}
        cellClass={({ day, slot }) => `${CELL_STYLE[grid[day][slot]]} cursor-pointer`}
        renderCell={({ day, slot }) =>
          grid[day][slot] === 'PREFERRED' ? (
            <span className="block text-center text-[9px] leading-6 text-white" aria-hidden>
              ★
            </span>
          ) : null
        }
        onPaintStart={(pos) => {
          const next = CYCLE[grid[pos.day][pos.slot]]
          setPaintValue(next)
          applyCell(pos, next)
        }}
        onPaintMove={(pos) => applyCell(pos, paintValue)}
        onPaintEnd={() => {
          /* se guarda con el botón */
        }}
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-300" /> {t('availability.available')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-600 text-center text-[8px] text-white">★</span>{' '}
          {t('availability.preferred')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border bg-white" /> {t('availability.unmarked')}
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => draft && save.mutate(draft)}
          disabled={!draft || save.isPending}
          className="flex-1"
        >
          {save.isPending
            ? t('availability.saving')
            : draft
              ? t('availability.saveChanges')
              : t('availability.noChanges')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (confirm(t('availability.repeatConfirm'))) makeRecurring.mutate()
          }}
          disabled={makeRecurring.isPending}
        >
          {t('availability.repeatWeekly')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(t('availability.clearWeekConfirm'))) clearWeek.mutate()
          }}
          disabled={clearWeek.isPending}
        >
          🗑 {t('availability.clearWeek')}
        </Button>
      </div>
      {(save.isError || makeRecurring.isError || clearWeek.isError) && (
        <p className="text-sm text-red-600">
          {t('availability.saveError', {
            message: ((save.error || makeRecurring.error || clearWeek.error) as Error).message,
          })}
        </p>
      )}
    </div>
  )
}

/** Convierte la matriz de slots en rangos contiguos por día y tipo. */
function gridToRanges(grid: SlotState[][], monday: Date) {
  const out: { start: Date; end: Date; kind: 'AVAILABLE' | 'PREFERRED' }[] = []
  for (let d = 0; d < 7; d++) {
    let runStart: number | null = null
    let runKind: SlotState = 'NONE'
    for (let s = 0; s <= SLOTS_PER_DAY; s++) {
      const v = s < SLOTS_PER_DAY ? grid[d][s] : 'NONE'
      if (v !== runKind) {
        if (runStart !== null && runKind !== 'NONE') {
          out.push({
            start: slotRange(monday, d, runStart).start,
            end: slotRange(monday, d, s - 1).end,
            kind: runKind as 'AVAILABLE' | 'PREFERRED',
          })
        }
        runStart = v === 'NONE' ? null : s
        runKind = v
      }
    }
  }
  return out
}
