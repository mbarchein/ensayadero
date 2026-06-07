// Personal availability calendar (D1: global, not per group).
// Paint by dragging; tap cycles NONE → AVAILABLE → PREFERRED → NONE.
// "Repeat every week" turns the week's blocks into recurring ones.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trash2, Check, X, Clock } from 'lucide-react'
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
  PREFERRED: 'NONE', // legacy state; no longer painted
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
  // initial week: ?d=YYYY-MM-DD (from "view in my agenda"), otherwise the current one
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
  const [clearPrompt, setClearPrompt] = useState<{ reverted: CellPos[]; sessionIds: string[] } | null>(null)

  // rehearsals I'm summoned to, overlaid on the time slots
  // of the visible week. map "day:slot" → participation.
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

  // list (with accept/decline) of the visible week's rehearsals
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

  // local state of the visible week (optimistic, persisted on release)
  const serverGrid = useMemo(
    () => (availabilities ? weekGrid(availabilities, monday) : null),
    [availabilities, monday],
  )
  const [draft, setDraft] = useState<SlotState[][] | null>(null)
  const [paintValue, setPaintValue] = useState<SlotState>('AVAILABLE')
  const grid = draft ?? serverGrid

  // ── Autosave: debounce after each gesture; retry if there were in-flight edits ──
  const editSeq = useRef(0) // current edit number
  const savedSeq = useRef(0) // edit number included in the last successful save
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
            setDraft(null) // no new edits: the server already reflects the grid
          } else {
            scheduleSave() // there were strokes during the save: persist again
          }
        },
      })
    }, 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // switching weeks invalidates the pending draft (each week is saved on paint)
  useEffect(() => {
    setDraft(null)
    editSeq.current = savedSeq.current
  }, [monday])

  const save = useMutation({
    mutationFn: async (newGrid: SlotState[][]) => {
      // Simple and robust strategy: replace the NON-recurring availabilities
      // overlapping this week with the painted blocks. Recurring ones are
      // converted with "Repeat every week".
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
      // one-off entries overlapping the week → removed
      const { error: delError } = await supabase
        .from('availabilities')
        .delete()
        .eq('user_id', profile!.id)
        .is('rrule', null)
        .filter('time_range', 'ov', `[${monday.toISOString()},${weekEnd.toISOString()})`)
      if (delError) throw delError
      // recurring → add the 7 days as exceptions
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

  // Copy the visible week to the next N weeks (replaces their one-off
  // availability). Does not create recurrence: an explicit copy.
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

  // does the slot have a SCHEDULED (confirmed) rehearsal?
  const hasConfirmed = (pos: CellPos) => {
    const p = sessionCells.get(`${pos.day}:${pos.slot}`)
    return !!p && p.sessions.status === 'CONFIRMED'
  }

  const applyCell = (pos: CellPos, value: SlotState) => {
    editSeq.current++
    setDraft((prev) => {
      const base = prev ?? serverGrid!
      const copy = base.map((col) => [...col])
      copy[pos.day][pos.slot] = value
      return copy
    })
  }

  // on release: if availability was removed from slots with a scheduled rehearsal,
  // open a modal (no confirm() in the gesture: it blocks the thread and the
  // pointerup is lost → "stuck" click).
  const onPaintEnd = () => {
    const d = draftRef.current
    if (d && serverGrid) {
      const reverted: CellPos[] = []
      const sessionIds = new Set<string>()
      for (let day = 0; day < 7; day++) {
        for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
          if (serverGrid[day][slot] !== 'NONE' && d[day][slot] === 'NONE' && hasConfirmed({ day, slot })) {
            reverted.push({ day, slot })
            const p = sessionCells.get(`${day}:${slot}`)
            if (p) sessionIds.add(p.session_id)
          }
        }
      }
      if (reverted.length > 0) {
        setClearPrompt({ reverted, sessionIds: [...sessionIds] })
        return // wait for the modal's choice before saving
      }
    }
    scheduleSave()
  }

  // resolution of the rehearsal-slot modal
  const resolveClear = (choice: 'selected' | 'full' | 'cancel') => {
    const prompt = clearPrompt
    setClearPrompt(null)
    if (!prompt || !serverGrid) {
      scheduleSave()
      return
    }
    if (choice === 'cancel') {
      setDraft((prev) => {
        const base = (prev ?? serverGrid).map((col) => [...col])
        for (const p of prompt.reverted) base[p.day][p.slot] = serverGrid[p.day][p.slot]
        return base
      })
    } else if (choice === 'full') {
      // remove availability from ALL slots of those rehearsals this week
      setDraft((prev) => {
        const base = (prev ?? serverGrid).map((col) => [...col])
        for (const [key, p] of sessionCells) {
          if (prompt.sessionIds.includes(p.session_id)) {
            const [day, slot] = key.split(':').map(Number)
            base[day][slot] = 'NONE'
          }
        }
        return base
      })
    }
    // 'selected' → leave as is
    editSeq.current++
    scheduleSave()
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
          const ring = ses
            ? ses.response === 'ACCEPTED'
              ? 'ring-2 ring-inset ring-green-500'
              : ses.response === 'DECLINED'
                ? 'ring-2 ring-inset ring-red-500'
                : 'ring-2 ring-inset ring-amber-500'
            : ''
          return `${CELL_STYLE[grid[day][slot]]} cursor-pointer ${ring}`
        }}
        renderCell={({ day, slot }) => {
          const p = sessionCells.get(`${day}:${slot}`)
          if (p) {
            const title = `${p.sessions.title} — ${p.sessions.groups.name}`
            const firstSlot = !sessionCells.get(`${day}:${slot - 1}`)
            const secondSlot =
              !firstSlot && sessionCells.get(`${day}:${slot - 1}`) === p && !sessionCells.get(`${day}:${slot - 2}`)
            if (firstSlot) {
              // first slot: my response icon + group
              const RespIcon =
                p.response === 'ACCEPTED' ? Check : p.response === 'DECLINED' ? X : Clock
              const color =
                p.response === 'ACCEPTED'
                  ? 'text-green-700'
                  : p.response === 'DECLINED'
                    ? 'text-red-600'
                    : 'text-amber-600'
              return (
                <span
                  className={`flex items-center gap-0.5 truncate px-0.5 text-[8px] font-semibold leading-6 ${color}`}
                  title={title}
                >
                  <RespIcon size={9} className="shrink-0" />
                  <span className="truncate">{p.sessions.groups.name}</span>
                </span>
              )
            }
            if (secondSlot) {
              // second slot: rehearsal name
              return (
                <span className="block truncate px-0.5 text-[8px] leading-6 text-gray-500" title={title}>
                  {p.sessions.title}
                </span>
              )
            }
            return null
          }
          return null
        }}
        onPaintStart={(pos) => {
          const next = CYCLE[grid[pos.day][pos.slot]]
          setPaintValue(next)
          applyCell(pos, next)
        }}
        onPaintMove={(pos) => applyCell(pos, paintValue)}
        onPaintEnd={onPaintEnd}
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
          className="inline-flex items-center gap-1.5"
        >
          <Trash2 size={15} /> {t('availability.clearWeek')}
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

      <Modal
        open={!!clearPrompt}
        onClose={() => resolveClear('cancel')}
        title={t('availability.clearScheduledTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('availability.clearScheduledBody')}</p>
          <ul className="space-y-2">
            {(clearPrompt?.sessionIds ?? []).map((sid) => {
              const p = (agenda.data ?? []).find((x) => x.session_id === sid)
              if (!p) return null
              const r = parseRange(p.sessions.time_range)
              return (
                <li key={sid} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
                  <p className="font-medium text-indigo-900">{p.sessions.title}</p>
                  <p className="text-xs text-indigo-700">
                    {format(r.start, "EEEE d MMM · HH:mm", { locale: dateLocale() })}–{format(r.end, 'HH:mm')}
                  </p>
                  <p className="text-xs text-indigo-600">
                    {p.sessions.groups.name}
                    {p.sessions.location ? ` · ${p.sessions.location}` : ''}
                  </p>
                </li>
              )
            })}
          </ul>
          <div className="space-y-2">
            {(() => {
              const rangeOf = (cells: CellPos[]) => {
                if (cells.length === 0) return ''
                let start = Infinity
                let end = -Infinity
                for (const c of cells) {
                  const r = slotRange(monday, c.day, c.slot)
                  start = Math.min(start, r.start.getTime())
                  end = Math.max(end, r.end.getTime())
                }
                return `${format(new Date(start), 'HH:mm')}–${format(new Date(end), 'HH:mm')}`
              }
              const selectedCells = clearPrompt?.reverted ?? []
              const fullCells: CellPos[] = []
              if (clearPrompt) {
                for (const [key, p] of sessionCells) {
                  if (clearPrompt.sessionIds.includes(p.session_id)) {
                    const [day, slot] = key.split(':').map(Number)
                    fullCells.push({ day, slot })
                  }
                }
              }
              return (
                <>
                  <Button className="w-full flex flex-col items-center gap-0.5 !py-2" onClick={() => resolveClear('selected')}>
                    <span>{t('availability.clearSelected')}</span>
                    <span className="text-xs font-normal opacity-80">{rangeOf(selectedCells)}</span>
                  </Button>
                  <Button variant="danger" className="w-full flex flex-col items-center gap-0.5 !py-2" onClick={() => resolveClear('full')}>
                    <span>{t('availability.clearFull')}</span>
                    <span className="text-xs font-normal opacity-80">{rangeOf(fullCells)}</span>
                  </Button>
                </>
              )
            })()}
            <Button variant="ghost" className="w-full" onClick={() => resolveClear('cancel')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* rehearsals summoned in the visible week */}
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

/** Converts the slot matrix into contiguous ranges by day and type. */
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
