// Group availability heatmap (instructor).
// Select a subset of people, intensity = number available,
// tap a cell → create a session with prefilled times.

import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, addWeeks, format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useGroup } from '../groups/useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'
import { SLOTS_PER_DAY, heatmap, slotRange, weekStart, type HeatCell } from '../../lib/slots'
import WeekGrid from '../availability/WeekGrid'
import CreateSessionModal from './CreateSessionModal'
import { Spinner, Button, Modal, BackButton } from '../../components/ui'
import type { Availability, SessionWithParticipants } from '../../lib/types'

export default function PlannerPage() {
  const { t } = useTranslation()
  const { groupId, members, isInstructor, loading } = useGroup()
  const navigate = useNavigate()
  const location = useLocation()
  // true when the edit form was opened via ?edit= (i.e. from the session
  // detail): closing it must return there, never show the calendar
  const cameFromLink = useRef(false)
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const initialOffset = useMemo(() => {
    const d = params.get('d')
    if (!d) return 0
    const diff = weekStart(new Date(d)).getTime() - weekStart(new Date()).getTime()
    return Math.max(-6, Math.round(diff / (7 * 86_400_000)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [weekOffset, setWeekOffset] = useState(initialOffset)
  const monday = useMemo(() => addWeeks(weekStart(new Date()), weekOffset), [weekOffset])
  const weekEnd = useMemo(() => addDays(monday, 7), [monday])
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = all
  // slot selection: day + anchor slot + end slot (drag). a/b unordered.
  const [sel, setSel] = useState<{ day: number; a: number; b: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editSession, setEditSession] = useState<SessionWithParticipants | null>(null)
  const selRange = sel ? { lo: Math.min(sel.a, sel.b), hi: Math.max(sel.a, sel.b) } : null
  // repeated taps on week-view cells without a rehearsal (read-only area)
  // → wave the day strip to hint where to tap (same UX as the agenda)
  const [hintPulse, setHintPulse] = useState(0)
  const emptyTaps = useRef<{ count: number; last: number }>({ count: 0, last: 0 })
  const waveBusyUntil = useRef(0)
  // 0.5s pulse + 70ms stagger × 6 days (keep in sync with .day-wave in index.css)
  const WAVE_MS = 500 + 70 * 6

  const memberIds = members.map((m) => m.user_id)
  const activeIds = selected ? memberIds.filter((id) => selected.has(id)) : memberIds

  const { data: availabilities } = useQuery({
    queryKey: ['group-availabilities', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availabilities')
        .select('*')
        .in('user_id', memberIds)
      if (error) throw error
      return data as Availability[]
    },
    enabled: memberIds.length > 0,
  })

  const { data: busyRows } = useQuery({
    queryKey: ['group-busy', groupId, monday.toISOString()],
    queryFn: async () => {
      // 3-week window: the carousel also shows the adjacent weeks' occupation
      const { data, error } = await supabase.rpc('group_busy_ranges', {
        gid: groupId,
        search: `[${addDays(monday, -7).toISOString()},${addDays(weekEnd, 7).toISOString()})`,
      })
      if (error) throw error
      return data as { user_id: string; busy: string }[]
    },
  })

  // group sessions overlapping the visible week (drafts + confirmed)
  const { data: weekSessions } = useQuery({
    queryKey: ['week-sessions', groupId, monday.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, session_participants(*, profiles(*))')
        .eq('group_id', groupId)
        .neq('status', 'CANCELLED')
        .filter(
          'time_range',
          'ov',
          `[${addDays(monday, -7).toISOString()},${addDays(weekEnd, 7).toISOString()})`,
        )
        .order('time_range', { ascending: true })
      if (error) throw error
      return data as SessionWithParticipants[]
    },
  })

  // open editing directly from a ?edit=<sessionId> link
  const editId = params.get('edit')
  useEffect(() => {
    if (editId && weekSessions) {
      const s = weekSessions.find((x) => x.id === editId)
      if (s) {
        cameFromLink.current = true
        setEditSession(s)
      }
      // consume the deep-link param right away (found or not): no history
      // entry keeps ?edit=, so neither the post-save week-sessions refetch
      // nor going back can reopen the form
      const next = new URLSearchParams(params)
      next.delete('edit')
      setParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, weekSessions])

  // map [day][slot] → session covering it, per carousel week (prev/current/next)
  const sessionCellsByWeek = useMemo(() => {
    const weeks = new Map<number, Map<string, SessionWithParticipants>>()
    for (const off of [-7, 0, 7]) {
      const m = addDays(monday, off)
      const map = new Map<string, SessionWithParticipants>()
      for (const s of weekSessions ?? []) {
        const r = parseRange(s.time_range)
        for (let d = 0; d < 7; d++) {
          for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
            if (overlaps(slotRange(m, d, slot), r)) map.set(`${d}:${slot}`, s)
          }
        }
      }
      weeks.set(m.getTime(), map)
    }
    return weeks
  }, [weekSessions, monday])
  const sessionCells = sessionCellsByWeek.get(monday.getTime())!

  const gridsByWeek = useMemo(() => {
    if (!availabilities) return null
    const busyByUser = new Map<string, TimeRange[]>()
    for (const row of busyRows ?? []) {
      const list = busyByUser.get(row.user_id) ?? []
      list.push(parseRange(row.busy))
      busyByUser.set(row.user_id, list)
    }
    const people = (m: Date) =>
      heatmap(
        activeIds.map((id) => ({
          userId: id,
          availabilities: availabilities.filter((a) => a.user_id === id),
          busy: busyByUser.get(id) ?? [],
        })),
        m,
      )
    const weeks = new Map<number, ReturnType<typeof heatmap>>()
    for (const off of [-7, 0, 7]) {
      const m = addDays(monday, off)
      weeks.set(m.getTime(), people(m))
    }
    return weeks
  }, [availabilities, busyRows, activeIds, monday])
  const grid = gridsByWeek?.get(monday.getTime()) ?? null

  // Grid for the edit modal: over ALL members (so every participant's coverage
  // is computed) and excluding the edited session's own occupation — otherwise
  // its participants would show as "busy" in their own slot.
  const editGrid = useMemo(() => {
    if (!availabilities || !editSession) return null
    const exclude = parseRange(editSession.time_range)
    const sessionPeople = new Set(editSession.session_participants.map((p) => p.user_id))
    const busyByUser = new Map<string, TimeRange[]>()
    for (const row of busyRows ?? []) {
      const iv = parseRange(row.busy)
      // drop the edited session's slot from its own participants' busy time
      if (sessionPeople.has(row.user_id) && overlaps(iv, exclude)) continue
      const list = busyByUser.get(row.user_id) ?? []
      list.push(iv)
      busyByUser.set(row.user_id, list)
    }
    return heatmap(
      memberIds.map((id) => ({
        userId: id,
        availabilities: availabilities.filter((a) => a.user_id === id),
        busy: busyByUser.get(id) ?? [],
      })),
      monday,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilities, busyRows, editSession, monday])

  // tapping/selecting a slot that holds a session opens its editor instead of
  // the create flow
  const selLo = sel ? Math.min(sel.a, sel.b) : 0
  const sessionAtSel = sel ? sessionCells.get(`${sel.day}:${selLo}`) ?? null : null
  useEffect(() => {
    if (sel && !dragging && sessionAtSel) {
      setEditSession(sessionAtSel)
      setSel(null)
    }
  }, [sel, dragging, sessionAtSel])

  if (loading) return <Spinner />
  if (!isInstructor) {
    return <p className="py-10 text-center text-sm text-gray-500">{t('planner.directorsOnly')}</p>
  }
  // deep-link edit still resolving: don't flash the calendar underneath
  if (editId && !editSession) return <Spinner />

  const total = activeIds.length
  const nameOf = (id: string) => {
    const m = members.find((x) => x.user_id === id)
    return m?.profiles.name || m?.profiles.email || '?'
  }

  // full-screen session form replaces the planner (no longer a modal)
  if (createOpen && sel && selRange && grid) {
    return (
      <CreateSessionModal
        groupId={groupId}
        members={members}
        preselectedIds={activeIds}
        initialRange={{
          start: slotRange(monday, sel.day, selRange.lo).start,
          end: slotRange(monday, sel.day, selRange.hi).end,
        }}
        grid={grid}
        weekMonday={monday}
        onClose={() => {
          setCreateOpen(false)
          setSel(null)
        }}
      />
    )
  }
  if (editSession && editGrid) {
    const sid = editSession.id
    return (
      <CreateSessionModal
        groupId={groupId}
        members={members}
        preselectedIds={[]}
        session={editSession}
        initialRange={parseRange(editSession.time_range)}
        grid={editGrid}
        weekMonday={monday}
        onClose={() => {
          setEditSession(null)
          if (!cameFromLink.current) return // opened from the calendar: stay
          cameFromLink.current = false
          // Came from the session detail: skip the calendar on the way back.
          // The form's useBackClose entry is consumed during unmount (UI
          // close) or was already popped (hardware back); deferring one tick
          // queues our extra pop after it, so both paths land on the detail.
          setTimeout(() => {
            if (location.key !== 'default') navigate(-1)
            else navigate(`/g/${groupId}/sessions/${sid}`, { replace: true })
          }, 0)
        }}
      />
    )
  }

  return (
    // fixed full-height layout: only the calendar scrolls (its own scroll box)
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="-mx-4 flex items-center gap-2 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${groupId}`} />
        <h1 className="text-xl font-bold">{t('planner.title')}</h1>
      </header>

      {/* people selector */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelected(null)}
          className={chip(selected === null)}
        >
          {t('planner.all', { count: memberIds.length })}
        </button>
        {members.map((m) => {
          const active = selected === null || selected.has(m.user_id)
          return (
            <button
              key={m.user_id}
              onClick={() => {
                setSelected((prev) => {
                  const next = new Set(prev ?? memberIds)
                  if (prev === null) {
                    next.delete(m.user_id) // from "all": first click excludes
                  } else if (next.has(m.user_id)) {
                    next.delete(m.user_id)
                  } else {
                    next.add(m.user_id)
                  }
                  return next
                })
              }}
              className={chip(active)}
            >
              {(m.profiles.name || m.profiles.email).split(' ')[0]}
            </button>
          )
        })}
      </div>

      {!grid ? (
        <Spinner />
      ) : (
        <WeekGrid
          weekMonday={monday}
          cellClass={({ day, slot }, wm) => {
            const current = wm.getTime() === monday.getTime()
            const cells = sessionCellsByWeek.get(wm.getTime()) ?? sessionCells
            const gridW = gridsByWeek?.get(wm.getTime()) ?? grid
            const selected =
              current && selRange && sel!.day === day && slot >= selRange.lo && slot <= selRange.hi
            const ses = cells.get(`${day}:${slot}`)
            // rehearsals as enclosed boxes (violet=scheduled, amber=draft):
            // left stripe + right edge, top/bottom on the block boundaries
            let sesBg = heatClass(gridW[day][slot], total)
            if (ses) {
              const first = cells.get(`${day}:${slot - 1}`) !== ses
              const last = cells.get(`${day}:${slot + 1}`) !== ses
              sesBg =
                ses.status === 'CONFIRMED'
                  ? `bg-violet-300 border-l-4 border-l-violet-700 !border-r-2 !border-r-violet-700 ${first ? '!border-t-2 !border-t-violet-700' : ''} ${last ? '!border-b-2 !border-b-violet-700' : ''}`
                  : `bg-amber-200 border-l-4 border-l-amber-500 !border-r-2 !border-r-amber-500 ${first ? '!border-t-2 !border-t-amber-500' : ''} ${last ? '!border-b-2 !border-b-amber-500' : ''}`
            }
            return `${sesBg} cursor-pointer ${
              selected ? 'ring-2 ring-inset ring-violet-600' : ''
            }`
          }}
          renderCell={({ day, slot }, { weekMonday: wm }) => {
            const cells = sessionCellsByWeek.get(wm.getTime()) ?? sessionCells
            const gridW = gridsByWeek?.get(wm.getTime()) ?? grid
            const ses = cells.get(`${day}:${slot}`)
            if (ses) {
              // first slot of the session shows its abbreviated title
              const firstSlot = !cells.get(`${day}:${slot - 1}`)
              return firstSlot ? (
                <span
                  className="block truncate px-0.5 text-[8px] font-semibold leading-6 text-violet-900"
                >
                  {format(parseRange(ses.time_range).start, 'HH:mm', { locale: dateLocale() })}
                </span>
              ) : null
            }
            const c = gridW[day][slot]
            return c.available.length > 0 ? (
              <span className="block text-center text-[9px] leading-6 text-gray-700">
                {c.available.length}
              </span>
            ) : null
          }}
          onPaintStart={(pos) => {
            setDragging(true)
            setSel({ day: pos.day, a: pos.slot, b: pos.slot })
          }}
          onPaintMove={(pos) =>
            // extend only within the anchor's same day
            setSel((prev) => (prev && pos.day === prev.day ? { ...prev, b: pos.slot } : prev))
          }
          onPaintEnd={() => setDragging(false)}
          onWeekCellTap={(pos) => {
            // tap on a rehearsal in the week overview opens its detail
            const ses = sessionCells.get(`${pos.day}:${pos.slot}`)
            if (ses) {
              navigate(`/g/${groupId}/sessions/${ses.id}`)
              return
            }
            // repeated taps elsewhere → wave the day strip (a running wave
            // always completes before another can start)
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
          hintPulse={hintPulse}
          fill
        />
      )}

      {/* selected slot: availability detail + create (overlay, nothing below the grid) */}
      <Modal
        open={!!sel && !dragging && !createOpen && !sessionAtSel}
        onClose={() => setSel(null)}
        title={
          sel && selRange
            ? `${format(slotRange(monday, sel.day, selRange.lo).start, "EEE d · HH:mm", { locale: dateLocale() })}–${format(slotRange(monday, sel.day, selRange.hi).end, 'HH:mm')}`
            : ''
        }
      >
        {sel && selRange && grid && (
          <div className="space-y-3">
            <CellDetail
              cell={mergeCells(grid[sel.day], selRange.lo, selRange.hi)}
              activeIds={activeIds}
              nameOf={nameOf}
              meId={profile?.id}
            />
            <Button className="w-full" onClick={() => setCreateOpen(true)}>
              {t('planner.createHere')}
            </Button>
          </div>
        )}
      </Modal>

    </div>
  )
}

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition ${
    active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 line-through'
  }`

type MergedCell = HeatCell & { partial: string[] }

/** Aggregates slots lo..hi of a day: available = whoever is available in ALL
 *  slots (can attend the whole session); partial = available in some but not
 *  all; busy = union of busy. */
function mergeCells(day: HeatCell[], lo: number, hi: number): MergedCell {
  let available = day[lo].available
  const everAvailable = new Set<string>()
  const busy = new Set<string>()
  const preferred = new Set(day[lo].preferred)
  for (let s = lo; s <= hi; s++) {
    available = available.filter((id) => day[s].available.includes(id))
    day[s].available.forEach((id) => everAvailable.add(id))
    day[s].busy.forEach((id) => busy.add(id))
    for (const id of [...preferred]) if (!day[s].preferred.includes(id)) preferred.delete(id)
  }
  const partial = [...everAvailable].filter((id) => !available.includes(id) && !busy.has(id))
  return {
    available,
    preferred: [...preferred],
    busy: [...busy].filter((id) => !available.includes(id)),
    partial,
  }
}

function heatClass(cell: HeatCell, total: number): string {
  if (total === 0) return 'bg-white'
  const ratio = cell.available.length / total
  if (ratio === 0) return 'bg-white'
  if (ratio < 0.34) return 'bg-emerald-100'
  if (ratio < 0.67) return 'bg-emerald-200'
  if (ratio < 1) return 'bg-emerald-300'
  return 'bg-emerald-500 ring-1 ring-inset ring-emerald-700'
}

function NameChip({
  name,
  me,
  variant,
}: {
  name: string
  me: boolean
  variant: 'available' | 'partial' | 'busy' | 'unavailable'
}) {
  const base = {
    available: 'bg-green-100 text-green-800',
    partial: 'bg-orange-100 text-orange-800',
    busy: 'bg-amber-100 text-amber-800',
    unavailable: 'bg-gray-100 text-gray-500',
  }[variant]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        me ? 'bg-violet-600 text-white ring-2 ring-violet-300' : base
      }`}
    >
      {name}
      {me && ' (tú)'}
    </span>
  )
}

function CellDetail({
  cell,
  activeIds,
  nameOf,
  meId,
}: {
  cell: MergedCell
  activeIds: string[]
  nameOf: (id: string) => string
  meId?: string
}) {
  const { t } = useTranslation()
  const unavailable = activeIds.filter(
    (id) => !cell.available.includes(id) && !cell.partial.includes(id) && !cell.busy.includes(id),
  )
  return (
    <div className="space-y-2 text-xs">
      {cell.available.length > 0 && (
        <div>
          <span className="font-medium text-green-700">{t('planner.availableLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cell.available.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="available" />
            ))}
          </div>
        </div>
      )}
      {cell.partial.length > 0 && (
        <div>
          <span className="font-medium text-orange-700">{t('planner.partialLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cell.partial.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="partial" />
            ))}
          </div>
        </div>
      )}
      {cell.busy.length > 0 && (
        <div>
          <span className="font-medium text-amber-700">{t('planner.busyLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cell.busy.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="busy" />
            ))}
          </div>
        </div>
      )}
      {unavailable.length > 0 && (
        <div>
          <span className="font-medium text-gray-500">{t('planner.unavailableLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {unavailable.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="unavailable" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
