// Personal availability calendar (D1: global, not per group).
// Paint by dragging; tap cycles NONE → AVAILABLE → PREFERRED → NONE.
// "Repeat every week" turns the week's blocks into recurring ones.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trash2, Copy, Check, X, Loader2, AlertCircle } from 'lucide-react'
import { addDays, addWeeks, format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatRange } from '../../lib/ranges'
import { tg } from '../../lib/glossary'
import {
  SLOTS_PER_DAY,
  isoDay,
  slotRange,
  weekGrid,
  weekStart,
  type SlotState,
} from '../../lib/slots'
import WeekGrid, { type CellPos } from './WeekGrid'
import Tip from '../../components/Tip'
import { BackButton, Button, Modal, Spinner } from '../../components/ui'
import { overlaps, parseRange } from '../../lib/ranges'
import { useMyAgenda, type MyParticipation } from '../agenda/useMyAgenda'
import GroupAvatar from '../groups/GroupAvatar'
import type { Availability } from '../../lib/types'

const CYCLE: Record<SlotState, SlotState> = {
  NONE: 'AVAILABLE',
  AVAILABLE: 'NONE',
  PREFERRED: 'NONE', // legacy state; no longer painted
}

// AVAILABLE: light violet, clearly lighter than the accepted stripe (violet-700)
const CELL_STYLE: Record<SlotState, string> = {
  NONE: 'bg-white',
  AVAILABLE: 'bg-violet-200',
  PREFERRED: 'bg-violet-400',
}

// Assign every rehearsal a fixed sub-column (lane) and the lane count of its
// overlap cluster, so its box keeps the SAME width along its whole run — even on
// slots where it happens not to overlap. Built from the "day:slot" → list cells
// map: per day, derive each session's slot run, cluster the runs that overlap
// (transitively), then greedy-assign lanes within each cluster.
function computeLanes(
  cells: Map<string, MyParticipation[]>,
): Map<string, { lane: number; lanes: number }> {
  // session_id → { day, min slot, max slot } (rehearsals sit within one day)
  const spans = new Map<string, { day: number; a: number; b: number }>()
  for (const [key, arr] of cells) {
    const [day, slot] = key.split(':').map(Number)
    for (const p of arr) {
      const e = spans.get(p.session_id)
      if (!e) spans.set(p.session_id, { day, a: slot, b: slot })
      else {
        e.a = Math.min(e.a, slot)
        e.b = Math.max(e.b, slot)
      }
    }
  }
  const byDay = new Map<number, { id: string; a: number; b: number }[]>()
  for (const [id, s] of spans) {
    const list = byDay.get(s.day) ?? []
    list.push({ id, a: s.a, b: s.b })
    byDay.set(s.day, list)
  }
  const out = new Map<string, { lane: number; lanes: number }>()
  for (const list of byDay.values()) {
    list.sort((x, y) => x.a - y.a || x.b - y.b || x.id.localeCompare(y.id))
    let i = 0
    while (i < list.length) {
      // collect the connected cluster (overlap = start <= running max end)
      let maxEnd = list[i].b
      let j = i + 1
      const comp = [list[i]]
      while (j < list.length && list[j].a <= maxEnd) {
        comp.push(list[j])
        maxEnd = Math.max(maxEnd, list[j].b)
        j++
      }
      // greedy: place each in the first lane whose last end is before its start
      const laneEnd: number[] = []
      for (const it of comp) {
        let lane = laneEnd.findIndex((end) => end < it.a)
        if (lane < 0) {
          lane = laneEnd.length
          laneEnd.push(it.b)
        } else laneEnd[lane] = it.b
        out.set(it.id, { lane, lanes: 0 })
      }
      for (const it of comp) out.get(it.id)!.lanes = laneEnd.length
      i = j
    }
  }
  return out
}

export default function AvailabilityPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  // initial week: ?d=YYYY-MM-DD (from "view in my agenda"), otherwise the current one
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const initialOffset = useMemo(() => {
    const d = params.get('d')
    if (!d) return 0
    const diff = weekStart(new Date(d)).getTime() - weekStart(new Date()).getTime()
    return Math.max(-6, Math.round(diff / (7 * 86_400_000)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [weekOffset, setWeekOffset] = useState(initialOffset)
  const monday = useMemo(() => addWeeks(weekStart(new Date()), weekOffset), [weekOffset])
  // ?s=<session_id> (from "view in my agenda"): blink that rehearsal briefly
  // and scroll it into view, then drop the effect.
  const [flashSession, setFlashSession] = useState<string | null>(() => params.get('s'))
  useEffect(() => {
    if (!flashSession) return
    // consume the deep-link param: coming BACK to this history entry later
    // (e.g. from the session detail) must not flash again
    if (params.get('s')) {
      const next = new URLSearchParams(params)
      next.delete('s')
      setParams(next, { replace: true })
    }
    const scroll = setTimeout(() => {
      document.querySelector('.cell-flash')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 150)
    const clear = setTimeout(() => setFlashSession(null), 2600)
    return () => {
      clearTimeout(scroll)
      clearTimeout(clear)
    }
  }, [flashSession])
  // repeated taps on week-view cells without a rehearsal (the read-only area)
  // → pulse a color wave across the day strip to hint where to tap
  const [hintPulse, setHintPulse] = useState(0)
  const emptyTaps = useRef<{ count: number; last: number }>({ count: 0, last: 0 })
  // while a wave is running, further taps must not restart it mid-flight
  const waveBusyUntil = useRef(0)
  // 0.5s pulse + 70ms stagger × 6 days (keep in sync with .day-wave in index.css)
  const WAVE_MS = 500 + 70 * 6
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
  const buildSessionCells = useCallback(
    (m: Date) => {
      // one slot can hold several overlapping rehearsals → list per slot
      const map = new Map<string, MyParticipation[]>()
      const windowEnd = addDays(m, 7)
      for (const p of agenda.data ?? []) {
        const r = parseRange(p.sessions.time_range)
        if (r.start >= windowEnd || r.end <= m) continue
        for (let d = 0; d < 7; d++) {
          for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
            if (overlaps(slotRange(m, d, slot), r)) {
              const k = `${d}:${slot}`
              const arr = map.get(k)
              if (arr) arr.push(p)
              else map.set(k, [p])
            }
          }
        }
      }
      // stable order per slot so each rehearsal keeps the same sub-column across
      // the slots it spans (earlier start first, then id as tie-breaker)
      for (const arr of map.values())
        arr.sort((a, b) => {
          const t =
            parseRange(a.sessions.time_range).start.getTime() -
            parseRange(b.sessions.time_range).start.getTime()
          return t !== 0 ? t : a.session_id.localeCompare(b.session_id)
        })
      return map
    },
    [agenda.data],
  )
  const sessionCells = useMemo(() => buildSessionCells(monday), [buildSessionCells, monday])
  // Fixed sub-column layout per rehearsal: if a rehearsal overlaps another at
  // ANY slot, its box is narrowed for its WHOLE extent (constant lane/width),
  // not just on the overlapping cells. Computed per week from the cells map.
  const sessionLanes = useMemo(() => computeLanes(sessionCells), [sessionCells])

  // confirmed rehearsals in the visible week — clearing the week wipes the
  // availability that overlaps them, so we list them in the confirm modal.
  const weekScheduled = useMemo(() => {
    const seen = new Map<string, MyParticipation>()
    for (const arr of sessionCells.values())
      for (const p of arr) {
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

  // read-only availability + rehearsal maps for the carousel's adjacent weeks,
  // so the incoming week shows its real occupation mid-swipe
  const adjacentWeeks = useMemo(() => {
    const map = new Map<
      number,
      {
        grid: SlotState[][] | null
        cells: Map<string, MyParticipation[]>
        lanes: Map<string, { lane: number; lanes: number }>
      }
    >()
    for (const off of [-7, 7]) {
      const m = addDays(monday, off)
      const cells = buildSessionCells(m)
      map.set(m.getTime(), {
        grid: availabilities ? weekGrid(availabilities, m) : null,
        cells,
        lanes: computeLanes(cells),
      })
    }
    return map
  }, [availabilities, buildSessionCells, monday])
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
  const hasConfirmed = (pos: CellPos) =>
    (sessionCells.get(`${pos.day}:${pos.slot}`) ?? []).some((p) => p.sessions.status === 'CONFIRMED')

  // does the given grid leave ANY availability overlapping the session?
  const coversSession = (g: SlotState[][], sessionId: string) => {
    for (const [key, arr] of sessionCells) {
      if (!arr.some((p) => p.session_id === sessionId)) continue
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
            for (const p of sessionCells.get(`${day}:${slot}`) ?? [])
              if (p.sessions.status === 'CONFIRMED') sessionIds.add(p.session_id)
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
      for (const [key, arr] of sessionCells) {
        if (arr.some((p) => prompt.sessionIds.includes(p.session_id))) {
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <header className="-mx-4 flex min-h-9 items-center justify-between border-b border-violet-100 bg-violet-50 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {dayView ? <BackButton onBack={() => setEditDay(null)} /> : <BackButton to="/" />}
          <h1 className="shrink-0 text-xl font-bold">
            {dayView ? t('availability.editTitle') : t('availability.agendaTitle')}
          </h1>
          {editDay != null && (
            <span className="truncate text-xs text-gray-600">
              {format(addDays(monday, editDay), 'EEEE, d-MMMM-yyyy', { locale: dateLocale() })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 flex w-5 justify-center" role="status">
            {save.isPending || hasUnsaved ? (
              <Loader2 size={18} className="animate-spin text-gray-500" aria-label={t('availability.saving')} />
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

      {dayView ? <Tip id="agendaEdit" type="OTHER" /> : <Tip id="agenda" type="OTHER" />}

      <WeekGrid
        weekMonday={monday}
        cellClass={({ day, slot }, wm) => {
          const current = wm.getTime() === monday.getTime()
          const week = current ? null : adjacentWeeks.get(wm.getTime())
          const cells = current ? sessionCells : (week?.cells ?? null)
          // unsaved edits (additions and deletions): dashed outline until the
          // save confirms, then it switches to the final style
          const pending =
            current && hasUnsaved && serverGrid && grid[day][slot] !== serverGrid[day][slot]
              ? 'cell-pending'
              : ''
          // rehearsals are drawn by renderCell (side-by-side sub-columns); here
          // we only flash the slot when it holds the deep-linked session
          const flash =
            current && (cells?.get(`${day}:${slot}`) ?? []).some((p) => p.session_id === flashSession)
              ? 'cell-flash'
              : ''
          const state = current ? grid[day][slot] : (week?.grid?.[day][slot] ?? 'NONE')
          return `${CELL_STYLE[state]} cursor-pointer ${pending} ${flash}`
        }}
        renderCell={({ day, slot }, { dayView, weekMonday: wm }) => {
          const current = wm.getTime() === monday.getTime()
          const cells = current ? sessionCells : adjacentWeeks.get(wm.getTime())?.cells
          const lanes = current ? sessionLanes : adjacentWeeks.get(wm.getTime())?.lanes
          const list = cells?.get(`${day}:${slot}`)
          if (!list || !cells || !lanes) return null
          // each rehearsal keeps a FIXED lane (sub-column) across its whole run:
          // its box width is 1/laneCount on every slot, even where it doesn't
          // overlap. laneCount is shared by the whole overlap cluster, so it's the
          // same for every rehearsal present in this cell.
          const laneCount = lanes.get(list[0].session_id)?.lanes ?? 1
          const byLane = new Map(list.map((p) => [lanes.get(p.session_id)?.lane ?? 0, p]))
          return (
            <div className="flex h-full">
              {Array.from({ length: laneCount }, (_, lane) => {
                const p = byLane.get(lane)
                // empty lane: a spacer that holds the column width
                if (!p) return <span key={lane} className="min-w-0 flex-1" />
                // full border set per response, so the rehearsal renders as an
                // enclosed box (left stripe + right edge, top/bottom on the run
                // boundaries). Literal class names so Tailwind keeps them.
                const c =
                  p.sessions.status !== 'CONFIRMED'
                    ? { l: 'border-l-gray-400', r: 'border-r-gray-400', t: 'border-t-gray-400', b: 'border-b-gray-400' }
                    : p.response === 'ACCEPTED'
                      ? { l: 'border-l-violet-700', r: 'border-r-violet-700', t: 'border-t-violet-700', b: 'border-b-violet-700' }
                      : p.response === 'DECLINED'
                        ? { l: 'border-l-red-500', r: 'border-r-red-500', t: 'border-t-red-500', b: 'border-b-red-500' }
                        : { l: 'border-l-orange-500', r: 'border-r-orange-500', t: 'border-t-orange-500', b: 'border-b-orange-500' }
                const firstOfRun = !(cells.get(`${day}:${slot - 1}`) ?? []).some(
                  (x) => x.session_id === p.session_id,
                )
                const lastOfRun = !(cells.get(`${day}:${slot + 1}`) ?? []).some(
                  (x) => x.session_id === p.session_id,
                )
                const title = `${p.sessions.groups.name} — ${format(parseRange(p.sessions.time_range).start, 'EEE d · HH:mm', { locale: dateLocale() })}`
                const initials = p.sessions.groups.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 3)
                  .toUpperCase()
                return (
                  <span
                    key={p.session_id}
                    title={title}
                    data-session={p.session_id}
                    className={`flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-hidden border-l-4 border-r-2 pl-0.5 ${c.l} ${c.r} ${firstOfRun ? `border-t-2 ${c.t}` : ''} ${lastOfRun ? `border-b-2 ${c.b}` : ''}`}
                  >
                    {firstOfRun && (
                      <>
                        <GroupAvatar
                          seed={p.sessions.groups.avatar_seed || p.sessions.group_id}
                          image={p.sessions.groups.avatar_image}
                          size={14}
                        />
                        {(dayView || laneCount === 1) && (
                          <span
                            className={`truncate font-bold leading-none text-gray-900 ${dayView ? 'text-xs' : 'text-[11px]'}`}
                          >
                            {dayView ? p.sessions.groups.name : initials}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                )
              })}
            </div>
          )
        }}
        onPaintStart={(pos) => {
          const next = CYCLE[grid[pos.day][pos.slot]]
          setPaintValue(next)
          applyCell(pos, next)
        }}
        onPaintMove={(pos) => applyCell(pos, paintValue)}
        onPaintEnd={onPaintEnd}
        onWeekCellTap={(pos, sessionId) => {
          // tap on a rehearsal in the week view opens its detail — the exact lane
          // tapped when several overlap (fall back to the first in the slot)
          const slotList = sessionCells.get(`${pos.day}:${pos.slot}`)
          const ses = slotList?.find((p) => p.session_id === sessionId) ?? slotList?.[0]
          if (ses) {
            navigate(`/g/${ses.sessions.group_id}/sessions/${ses.session_id}`)
            return
          }
          // tap on a rehearsal-free cell does nothing here: after two quick
          // taps, wave the day strip to point at the actual tap target
          const now = Date.now()
          emptyTaps.current =
            now - emptyTaps.current.last < 2000
              ? { count: emptyTaps.current.count + 1, last: now }
              : { count: 1, last: now }
          if (emptyTaps.current.count >= 2 && now >= waveBusyUntil.current) {
            emptyTaps.current.count = 0
            waveBusyUntil.current = now + WAVE_MS
            setHintPulse((n) => n + 1)
          }
        }}
        onPrevWeek={() => setWeekOffset((w) => Math.max(-6, w - 1))}
        onNextWeek={() => setWeekOffset((w) => w + 1)}
        day={editDay}
        onDayChange={setEditDay}
        hintPulse={hintPulse}
        fill
      />

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title={t('availability.clearWeekTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('availability.clearWeekConfirm')}</p>
          {weekScheduled.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-800">{tg(t, 'availability.clearAffects', 'OTHER')}</p>
              <ul className="mt-1 space-y-0.5 text-amber-700">
                {weekScheduled.map((p) => {
                  const r = parseRange(p.sessions.time_range)
                  return (
                    <li key={p.session_id}>
                      {p.sessions.groups.name} — {format(r.start, 'EEE d · HH:mm', { locale: dateLocale() })}
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
        title={tg(t, 'availability.clearScheduledTitle', 'OTHER')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{tg(t, 'availability.clearScheduledBody', 'OTHER')}</p>
          <ul className="space-y-2">
            {(clearPrompt?.sessionIds ?? []).map((sid) => {
              const p = (agenda.data ?? []).find((x) => x.session_id === sid)
              if (!p) return null
              const r = parseRange(p.sessions.time_range)
              return (
                <li key={sid} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
                  <p className="font-medium text-indigo-900">{p.sessions.groups.name}</p>
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
                for (const [key, arr] of sessionCells) {
                  if (arr.some((p) => clearPrompt.sessionIds.includes(p.session_id))) {
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
                    <span>{tg(t, 'availability.clearFull', 'OTHER')}</span>
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
