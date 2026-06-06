// Calendario personal de disponibilidad (D1: global, no por grupo).
// Pintar arrastrando; tap cicla NONE → AVAILABLE → PREFERRED → NONE.
// "Repetir cada semana" convierte los bloques de la semana en recurrentes.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { Button, Modal, Spinner } from '../../components/ui'
import { overlaps, parseRange } from '../../lib/ranges'
import { useMyAgenda, type MyParticipation } from '../agenda/useMyAgenda'
import ParticipationCard from '../agenda/ParticipationCard'
import type { Availability } from '../../lib/types'

const CYCLE: Record<SlotState, SlotState> = {
  NONE: 'AVAILABLE',
  AVAILABLE: 'NONE',
  PREFERRED: 'NONE', // estado heredado; ya no se pinta
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
  // semana inicial: ?d=YYYY-MM-DD (desde "ver en mi agenda"), si no la actual
  const [params] = useSearchParams()
  const initialOffset = useMemo(() => {
    const d = params.get('d')
    if (!d) return 0
    const diff = weekStart(new Date(d)).getTime() - weekStart(new Date()).getTime()
    return Math.max(-6, Math.round(diff / (7 * 86_400_000)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [weekOffset, setWeekOffset] = useState(initialOffset)
  const monday = useMemo(() => addWeeks(weekStart(new Date()), weekOffset), [weekOffset])
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyN, setCopyN] = useState(1)

  // ensayos a los que estoy convocado, superpuestos en las franjas horarias
  // de la semana visible. mapa "día:slot" → participación.
  const agenda = useMyAgenda()
  const sessionCells = useMemo(() => {
    const map = new Map<string, MyParticipation>()
    const windowEnd = addDays(monday, 7)
    for (const p of agenda.data ?? []) {
      const r = parseRange(p.sessions.time_range)
      if (r.start >= windowEnd || r.end <= monday) continue
      for (let d = 0; d < 7; d++) {
        for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
          if (overlaps(slotRange(monday, d, slot), r)) map.set(`${d}:${slot}`, p)
        }
      }
    }
    return map
  }, [agenda.data, monday])

  // lista (con confirmar/rechazar) de los ensayos de la semana visible
  const weekParticipations = useMemo(() => {
    const windowEnd = addDays(monday, 7)
    return (agenda.data ?? []).filter((p) => {
      const r = parseRange(p.sessions.time_range)
      return r.start < windowEnd && r.end > monday
    })
  }, [agenda.data, monday])

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

  // ── Autosave: debounce tras cada gesto; reintenta si hubo ediciones en vuelo ──
  const editSeq = useRef(0) // nº de edición actual
  const savedSeq = useRef(0) // nº de edición incluida en el último save OK
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const draftRef = useRef<SlotState[][] | null>(null)
  draftRef.current = draft

  const scheduleSave = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const seqAtFire = editSeq.current
      if (!draftRef.current || seqAtFire === savedSeq.current) return
      save.mutate(draftRef.current, {
        onSuccess: () => {
          savedSeq.current = seqAtFire
          if (editSeq.current === seqAtFire) {
            setDraft(null) // sin ediciones nuevas: el servidor ya refleja la rejilla
          } else {
            scheduleSave() // hubo trazos durante el save: persistir de nuevo
          }
        },
      })
    }, 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // cambiar de semana invalida el borrador pendiente (cada semana se guarda al pintar)
  useEffect(() => {
    setDraft(null)
    editSeq.current = savedSeq.current
  }, [monday])

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

  // Copiar la semana visible a las próximas N semanas (sustituye su
  // disponibilidad puntual). No crea recurrencia: copia explícita.
  const copyWeeks = useMutation({
    mutationFn: async (weeks: number) => {
      if (!grid) return
      const blocks = gridToRanges(grid, monday)
      for (let i = 1; i <= weeks; i++) {
        const wStart = addDays(monday, 7 * i)
        const wEnd = addDays(wStart, 7)
        const { error: delError } = await supabase
          .from('availabilities')
          .delete()
          .eq('user_id', profile!.id)
          .is('rrule', null)
          .filter('time_range', 'ov', `[${wStart.toISOString()},${wEnd.toISOString()})`)
        if (delError) throw delError
        const rows = blocks.map((b) => ({
          user_id: profile!.id,
          time_range: formatRange(addDays(b.start, 7 * i), addDays(b.end, 7 * i)),
          kind: b.kind,
        }))
        if (rows.length > 0) {
          const { error } = await supabase.from('availabilities').insert(rows)
          if (error) throw error
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availabilities'] })
      setCopyOpen(false)
    },
  })

  if (isLoading || !grid) return <Spinner />

  const applyCell = (pos: CellPos, value: SlotState) => {
    editSeq.current++
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
        <Button
          variant="ghost"
          onClick={() => setWeekOffset((w) => Math.max(-6, w - 1))}
          disabled={weekOffset <= -6}
          aria-label={t('availability.prevWeek')}
        >
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
        cellClass={({ day, slot }) => {
          const ses = sessionCells.get(`${day}:${slot}`)
          const overlay = ses ? 'ring-2 ring-inset ring-indigo-500' : ''
          return `${CELL_STYLE[grid[day][slot]]} cursor-pointer ${overlay}`
        }}
        renderCell={({ day, slot }) => {
          const p = sessionCells.get(`${day}:${slot}`)
          if (p) {
            // primer slot del ensayo: título + estado de mi respuesta
            const firstSlot = !sessionCells.get(`${day}:${slot - 1}`)
            if (!firstSlot) return null
            const icon =
              p.response === 'ACCEPTED' ? '✓' : p.response === 'DECLINED' ? '✗' : '•'
            return (
              <span
                className="block truncate px-0.5 text-[8px] font-semibold leading-6 text-indigo-800"
                title={`${p.sessions.title} — ${p.sessions.groups.name}`}
              >
                {icon} {p.sessions.title}
              </span>
            )
          }
          return null
        }}
        onPaintStart={(pos) => {
          const next = CYCLE[grid[pos.day][pos.slot]]
          setPaintValue(next)
          applyCell(pos, next)
        }}
        onPaintMove={(pos) => applyCell(pos, paintValue)}
        onPaintEnd={scheduleSave}
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-300" /> {t('availability.available')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border bg-white" /> {t('availability.unmarked')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded ring-2 ring-inset ring-indigo-500" />{' '}
          {t('availability.rehearsal')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`flex-1 text-sm ${save.isPending || draft ? 'text-gray-400' : 'text-green-600'}`}
          role="status"
        >
          {save.isPending || draft ? t('availability.saving') : t('availability.saved')}
        </span>
        <Button variant="secondary" onClick={() => setCopyOpen(true)} disabled={copyWeeks.isPending}>
          {t('availability.copyWeeks')}
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
      {(save.isError || copyWeeks.isError || clearWeek.isError) && (
        <p className="text-sm text-red-600">
          {t('availability.saveError', {
            message: ((save.error || copyWeeks.error || clearWeek.error) as Error).message,
          })}
        </p>
      )}

      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title={t('availability.copyTitle')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            copyWeeks.mutate(copyN)
          }}
        >
          <p className="text-sm text-gray-600">{t('availability.copyHint')}</p>
          <label className="block text-sm">
            {t('availability.copyWeeksLabel')}
            <input
              type="number"
              min={1}
              max={12}
              required
              value={copyN}
              onChange={(e) => setCopyN(Math.min(12, Math.max(1, Number(e.target.value))))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <Button type="submit" disabled={copyWeeks.isPending} className="w-full">
            {copyWeeks.isPending
              ? t('availability.saving')
              : t('availability.copyConfirm', { count: copyN })}
          </Button>
        </form>
      </Modal>

      {/* ensayos convocados en la semana visible */}
      {weekParticipations.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">{t('availability.weekSessions')}</h2>
          <ul className="space-y-3">
            {weekParticipations.map((p) => (
              <ParticipationCard
                key={p.session_id}
                p={p}
                pending={agenda.respond.isPending}
                onRespond={(response) => agenda.respond.mutate({ sessionId: p.session_id, response })}
              />
            ))}
          </ul>
        </section>
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
