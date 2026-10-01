// Group availability heatmap (instructor).
// Select a subset of people, intensity = number available,
// tap a cell → create a session with prefilled times.

import { useEffect, useMemo, useRef, useState } from 'react'
import { addWeeks, format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGroup } from '../groups/useGroup'
import { tg } from '../../lib/glossary'
import { useAuth } from '../../auth/AuthContext'
import { parseRange } from '../../lib/ranges'
import { isoDay, slotRange, weekStart } from '../../lib/slots'
import WeekGrid from '../availability/WeekGrid'
import { Spinner, Button, Modal, BackButton } from '../../components/ui'
import Tip from '../../components/Tip'
import { useGroupHeat } from './useGroupHeat'
import { CellDetail, PeopleFilter, heatClass, mergeCells } from './heat'

export default function PlannerPage() {
  const { t } = useTranslation()
  const { groupId, group, members, isInstructor, loading } = useGroup()
  const navigate = useNavigate()
  const { profile } = useAuth()
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
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = all
  // slot selection: day + anchor slot + end slot (drag). a/b unordered.
  const [sel, setSel] = useState<{ day: number; a: number; b: number } | null>(null)
  const [dragging, setDragging] = useState(false)
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

  const { sessionCellsByWeek, gridsByWeek } = useGroupHeat(groupId, memberIds, activeIds, monday)
  const sessionCells = sessionCellsByWeek.get(monday.getTime())!
  const grid = gridsByWeek?.get(monday.getTime()) ?? null

  // tapping/selecting a slot that holds a session opens its editor page
  const selLo = sel ? Math.min(sel.a, sel.b) : 0
  const sessionAtSel = sel ? sessionCells.get(`${sel.day}:${selLo}`) ?? null : null
  useEffect(() => {
    if (sel && !dragging && sessionAtSel) {
      setSel(null)
      navigate(`/g/${groupId}/sessions/${sessionAtSel.id}/edit`)
    }
  }, [sel, dragging, sessionAtSel, navigate, groupId])

  if (loading) return <Spinner />
  if (!isInstructor) {
    return <p className="py-10 text-center text-sm text-gray-600">{t('planner.directorsOnly')}</p>
  }

  const total = activeIds.length
  const nameOf = (id: string) => {
    const m = members.find((x) => x.user_id === id)
    return m?.profiles.name || m?.profiles.email || '?'
  }

  // navigate to the routed create form, prefilled with the selection
  const openCreate = () => {
    if (!sel || !selRange) return
    const start = slotRange(monday, sel.day, selRange.lo).start
    const end = slotRange(monday, sel.day, selRange.hi).end
    const dur = Math.round((end.getTime() - start.getTime()) / 60_000)
    const hh = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
    setSel(null)
    navigate(
      `/g/${groupId}/sessions/new?d=${isoDay(start)}&start=${hh}&dur=${dur}&people=${activeIds.join(',')}`,
    )
  }

  return (
    // fixed full-height layout: only the calendar scrolls (its own scroll box)
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="-mx-4 flex items-center gap-2 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${groupId}`} />
        <h1 className="text-xl font-bold">{tg(t, 'planner.title', group?.group_type)}</h1>
      </header>

      <Tip id="planner" type={group?.group_type} />

      <PeopleFilter members={members} selected={selected} onChange={setSelected} />

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
        open={!!sel && !dragging && !sessionAtSel}
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
              groupType={group?.group_type}
            />
            <Button className="w-full" onClick={openCreate}>
              {tg(t, 'planner.createHere', group?.group_type)}
            </Button>
          </div>
        )}
      </Modal>

    </div>
  )
}
