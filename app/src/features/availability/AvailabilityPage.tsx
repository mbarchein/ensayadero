// Personal availability calendar (D1: global, not per group).
// Paint by dragging; tap cycles NONE → AVAILABLE → PREFERRED → NONE.
// "Repeat every week" turns the week's blocks into recurring ones.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trash2, Copy, Check, X, Clock, Loader2, AlertCircle } from 'lucide-react'
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
import GroupAvatar from '../groups/GroupAvatar'
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
  // null = agenda (week view); number = day being edited
  const [editDay, setEditDay] = useState<number | null>(null)
  const dayView = editDay != null
  const [copyOpen, setCopyOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [showOk, setShowOk] = useState(false) // brief "saved" tick after a save
  const okTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // confirmed rehearsals in the visible week — clearing the week wipes the
  // availability that overlaps them, so we list them in the confirm modal.
  const weekScheduled = useMemo(() => {
    const seen = new Map<string, MyParticipation>()
    for (const p of sessionCells.values()) {
      if (p.sessions.status === 'CONFIRMED') seen.set(p.session_id, p)
    }
    return [...seen.values()].sort(
      (a, b) =>
        parseRange(a.sessions.time_range).start.getTime() -
        parseRange(b.sessions.time_range).start.getTime(),
    )
  }, [sessionCells])

  // list (with accept/decline) of the visible week's rehearsals
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
  // the draft is kept after save (to avoid flicker); "unsaved" means it still
  // differs from the server grid — drives the pending styling and save spinner
  const hasUnsaved =
    !!draft && !!serverGrid && draft.some((col, d) => col.some((v, s) => v !== serverGrid[d][s]))

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
        onSuccess: async () => {
          savedSeq.current = seqAtFire
          if (editSeq.current === seqAtFire) {
            // Keep the draft as the working grid; refetch the server grid so the
            // "pending" (dirty) styling clears once it matches. We do NOT drop
            // the draft — the draft→server handoff was the source of the flicker.
            await qc.refetchQueries({ queryKey: ['availabilities', profile?.id] })
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
      // the refetch is awaited in scheduleSave's onSuccess before clearing the
      // draft; here we only flash the saved indicator
      if (okTimer.current) clearTimeout(okTimer.current)
      setShowOk(true)
      okTimer.current = setTimeout(() => setShowOk(false), 2000)
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
      // clearing the week removes all availability → not attending any of its
      // scheduled rehearsals
      for (const p of weekScheduled) {
        if (p.response !== 'DECLINED') {
          agenda.respond.mutate({ sessionId: p.session_id, response: 'DECLINED' })
        }
      }
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

  // does the given grid leave ANY availability overlapping the session?
  const coversSession = (g: SlotState[][], sessionId: string) => {
    for (const [key, p] of sessionCells) {
      if (p.session_id !== sessionId) continue
      const [day, slot] = key.split(':').map(Number)
      if (g[day][slot] !== 'NONE') return true
    }
    return false
  }

  const applyCell = (pos: CellPos, value: SlotState) => {
    editSeq.current++
    // Keep draftRef in sync synchronously: on a single tap, onPaintEnd runs right
    // after onPaintStart, before React re-renders, so the ref must already reflect
    // this change (otherwise the scheduled-rehearsal clear prompt is missed except
    // on the first painted cell).
    const base = draftRef.current ?? serverGrid!
    const copy = base.map((col) => [...col])
    copy[pos.day][pos.slot] = value
    draftRef.current = copy
    setDraft(copy)
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
    const base = (draftRef.current ?? serverGrid).map((col) => [...col])
    if (choice === 'cancel') {
      for (const p of prompt.reverted) base[p.day][p.slot] = serverGrid[p.day][p.slot]
    } else if (choice === 'full') {
      // remove availability from ALL slots of those rehearsals this week
      for (const [key, p] of sessionCells) {
        if (prompt.sessionIds.includes(p.session_id)) {
          const [day, slot] = key.split(':').map(Number)
          base[day][slot] = 'NONE'
        }
      }
    }
    // 'selected' → base already reflects the painted removal
    setDraft(base)
    // a rehearsal left with no availability → mark the user as not attending
    if (choice !== 'cancel') {
      for (const sid of prompt.sessionIds) {
        if (!coversSession(base, sid)) {
          agenda.respond.mutate({ sessionId: sid, response: 'DECLINED' })
        }
      }
    }
    editSeq.current++
    scheduleSave()
  }

  return (
    // fixed full-height layout: only the calendar scrolls (its own scroll box)
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex min-h-9 items-center justify-between">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="shrink-0 text-xl font-bold">
            {dayView ? t('availability.editTitle') : t('availability.agendaTitle')}
          </h1>
          {editDay != null && (
            <span className="truncate text-xs text-gray-500">
              {format(addDays(monday, editDay), 'EEEE, d-MMMM-yyyy', { locale: dateLocale() })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 flex w-5 justify-center" role="status">
            {save.isPending || hasUnsaved ? (
              <Loader2 size={18} className="animate-spin text-gray-400" aria-label={t('availability.saving')} />
            ) : save.isError || copyWeeks.isError || clearWeek.isError ? (
              <AlertCircle size={18} className="text-red-600" aria-label={t('common.error', { message: '' })} />
            ) : showOk ? (
              <Check size={18} className="text-green-600" aria-label={t('availability.saved')} />
            ) : null}
          </span>
          {!dayView && (
            <>
              <Button
                variant="ghost"
                className="p-2"
                aria-label={t('availability.copyWeeks')}
                title={t('availability.copyWeeks')}
                onClick={() => setCopyOpen(true)}
                disabled={copyWeeks.isPending}
              >
                <Copy size={18} />
              </Button>
              <Button
                variant="ghost"
                className="p-2 text-red-600"
                aria-label={t('availability.clearWeek')}
                title={t('availability.clearWeek')}
                onClick={() => setClearOpen(true)}
                disabled={clearWeek.isPending}
              >
                <Trash2 size={18} />
              </Button>
            </>
          )}
          {dayView && (
            <Button
              variant="ghost"
              className="p-2"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={() => setEditDay(null)}
            >
              <X size={20} />
            </Button>
          )}
        </div>
      </header>

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
          // unsaved edits (additions and deletions): dashed outline until the
          // save confirms, then it switches to the final style
          const pending =
            hasUnsaved && serverGrid && grid[day][slot] !== serverGrid[day][slot]
              ? 'cell-pending'
              : ''
          // scheduled rehearsals: thick violet side stripe (same language as the
          // planner) while the background keeps showing my availability
          const sesMark =
            ses?.sessions.status === 'CONFIRMED' ? 'border-l-4 border-l-violet-700' : ''
          return `${CELL_STYLE[grid[day][slot]]} cursor-pointer ${sesMark} ${ring} ${pending}`
        }}
        renderCell={({ day, slot }, { dayView }) => {
          const p = sessionCells.get(`${day}:${slot}`)
          if (!p) return null
          const title = `${p.sessions.title} — ${p.sessions.groups.name}`
          const firstSlot = !sessionCells.get(`${day}:${slot - 1}`)
          // week view: the group avatar in every cell of the rehearsal (response
          // shown by the cell ring)
          if (!dayView) {
            return (
              <span className="flex h-full items-center justify-center" title={title}>
                <GroupAvatar seed={p.sessions.groups.avatar_seed || p.sessions.group_id} size={16} />
              </span>
            )
          }
          // day view: response icon + group, then the rehearsal name
          const secondSlot =
            !firstSlot && sessionCells.get(`${day}:${slot - 1}`) === p && !sessionCells.get(`${day}:${slot - 2}`)
          if (firstSlot) {
            const RespIcon = p.response === 'ACCEPTED' ? Check : p.response === 'DECLINED' ? X : Clock
            const color =
              p.response === 'ACCEPTED'
                ? 'text-green-700'
                : p.response === 'DECLINED'
                  ? 'text-red-600'
                  : 'text-amber-600'
            return (
              <span
                className={`flex items-center gap-0.5 truncate px-0.5 text-[8px] font-semibold leading-5 ${color}`}
                title={title}
              >
                <RespIcon size={9} className="shrink-0" />
                <span className="truncate">{p.sessions.groups.name}</span>
              </span>
            )
          }
          if (secondSlot) {
            return (
              <span className="block truncate px-0.5 text-[8px] leading-5 text-gray-500" title={title}>
                {p.sessions.title}
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
        onPaintEnd={onPaintEnd}
        onPrevWeek={() => setWeekOffset((w) => Math.max(-6, w - 1))}
        onNextWeek={() => setWeekOffset((w) => w + 1)}
        day={editDay}
        onDayChange={setEditDay}
        fill
      />

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title={t('availability.clearWeekTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('availability.clearWeekConfirm')}</p>
          {weekScheduled.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-800">{t('availability.clearAffects')}</p>
              <ul className="mt-1 space-y-0.5 text-amber-700">
                {weekScheduled.map((p) => {
                  const r = parseRange(p.sessions.time_range)
                  return (
                    <li key={p.session_id}>
                      {p.sessions.title} — {format(r.start, 'EEE d · HH:mm', { locale: dateLocale() })}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setClearOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="warning"
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={clearWeek.isPending}
              onClick={() => {
                clearWeek.mutate()
                setClearOpen(false)
              }}
            >
              <Trash2 size={16} /> {t('availability.clearWeek')}
            </Button>
          </div>
        </div>
      </Modal>

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
            <select
              required
              value={copyN}
              onChange={(e) => setCopyN(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
            >
              {Array.from({ length: 10 }, (_, idx) => {
                const n = idx + 1
                const first = addWeeks(monday, 1)
                const lastEnd = addDays(addWeeks(monday, n), 6)
                return (
                  <option key={n} value={n}>
                    {n} · {format(first, 'd MMM', { locale: dateLocale() })} – {format(lastEnd, 'd MMM', { locale: dateLocale() })}
                  </option>
                )
              })}
            </select>
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
