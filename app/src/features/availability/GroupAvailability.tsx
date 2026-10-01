// Agenda's group view: the group's availability heatmap, as the director sees
// it in the planner, but read-only. Tap a day and pick a slot to see who can
// make it; tap a rehearsal to open it. Only confirmed rehearsals are drawn:
// drafts are the director's work in progress.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { slotRange } from '../../lib/slots'
import { Modal, Spinner } from '../../components/ui'
import WeekGrid from './WeekGrid'
import { useGroupHeat } from '../planner/useGroupHeat'
import { CellDetail, PeopleFilter, heatClass, mergeCells } from '../planner/heat'
import type { GroupType, MembershipWithProfile } from '../../lib/types'

export default function GroupAvailability({
  groupId,
  groupType,
  monday,
  onPrevWeek,
  onNextWeek,
  day,
  onDayChange,
}: {
  groupId: string
  groupType?: GroupType
  monday: Date
  onPrevWeek: () => void
  onNextWeek: () => void
  day: number | null
  onDayChange: (day: number | null) => void
}) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = all
  // slot selection: day + anchor slot + end slot (drag). a/b unordered.
  const [sel, setSel] = useState<{ day: number; a: number; b: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const selRange = sel ? { lo: Math.min(sel.a, sel.b), hi: Math.max(sel.a, sel.b) } : null
  // repeated taps on week-view cells without a rehearsal → wave the day strip
  const [hintPulse, setHintPulse] = useState(0)
  const emptyTaps = useRef<{ count: number; last: number }>({ count: 0, last: 0 })
  const waveBusyUntil = useRef(0)
  // 0.5s pulse + 70ms stagger × 6 days (keep in sync with .day-wave in index.css)
  const WAVE_MS = 500 + 70 * 6

  // same query as useGroup, so the cache is shared with the group pages
  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, profiles(*)')
        .eq('group_id', groupId)
      if (error) throw error
      return data as MembershipWithProfile[]
    },
  })
  const memberIds = members.map((m) => m.user_id)
  const activeIds = selected ? memberIds.filter((id) => selected.has(id)) : memberIds

  const { sessionCellsByWeek, gridsByWeek } = useGroupHeat(groupId, memberIds, activeIds, monday, {
    confirmedOnly: true,
  })
  const sessionCells = sessionCellsByWeek.get(monday.getTime())!
  const grid = gridsByWeek?.get(monday.getTime()) ?? null

  // selecting a slot that holds a rehearsal opens its detail
  const selLo = sel ? Math.min(sel.a, sel.b) : 0
  const sessionAtSel = sel ? (sessionCells.get(`${sel.day}:${selLo}`) ?? null) : null
  useEffect(() => {
    if (sel && !dragging && sessionAtSel) {
      setSel(null)
      navigate(`/g/${groupId}/sessions/${sessionAtSel.id}`)
    }
  }, [sel, dragging, sessionAtSel, navigate, groupId])

  const total = activeIds.length
  const nameOf = (id: string) => {
    const m = members.find((x) => x.user_id === id)
    return m?.profiles.name || m?.profiles.email || '?'
  }

  return (
    <>
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
            const isSel =
              current && selRange && sel!.day === day && slot >= selRange.lo && slot <= selRange.hi
            const ses = cells.get(`${day}:${slot}`)
            // rehearsals as enclosed violet boxes: left stripe + right edge,
            // top/bottom on the block boundaries
            let bg = heatClass(gridW[day][slot], total)
            if (ses) {
              const first = cells.get(`${day}:${slot - 1}`) !== ses
              const last = cells.get(`${day}:${slot + 1}`) !== ses
              bg = `bg-violet-300 border-l-4 border-l-violet-700 !border-r-2 !border-r-violet-700 ${first ? '!border-t-2 !border-t-violet-700' : ''} ${last ? '!border-b-2 !border-b-violet-700' : ''}`
            }
            return `${bg} cursor-pointer ${isSel ? 'ring-2 ring-inset ring-violet-600' : ''}`
          }}
          renderCell={({ day, slot }, { weekMonday: wm }) => {
            const cells = sessionCellsByWeek.get(wm.getTime()) ?? sessionCells
            const gridW = gridsByWeek?.get(wm.getTime()) ?? grid
            const ses = cells.get(`${day}:${slot}`)
            if (ses) {
              // first slot of the rehearsal shows its start time
              return !cells.get(`${day}:${slot - 1}`) ? (
                <span className="block truncate px-0.5 text-[8px] font-semibold leading-6 text-violet-900">
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
            const ses = sessionCells.get(`${pos.day}:${pos.slot}`)
            if (ses) {
              navigate(`/g/${groupId}/sessions/${ses.id}`)
              return
            }
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
          onPrevWeek={onPrevWeek}
          onNextWeek={onNextWeek}
          day={day}
          onDayChange={onDayChange}
          hintPulse={hintPulse}
          fill
        />
      )}

      {/* selected slot: who can make it (overlay, nothing below the grid) */}
      <Modal
        open={!!sel && !dragging && !sessionAtSel}
        onClose={() => setSel(null)}
        title={
          sel && selRange
            ? `${format(slotRange(monday, sel.day, selRange.lo).start, 'EEE d · HH:mm', { locale: dateLocale() })}–${format(slotRange(monday, sel.day, selRange.hi).end, 'HH:mm')}`
            : ''
        }
      >
        {sel && selRange && grid && (
          <CellDetail
            cell={mergeCells(grid[sel.day], selRange.lo, selRange.hi)}
            activeIds={activeIds}
            nameOf={nameOf}
            meId={profile?.id}
            groupType={groupType}
          />
        )}
      </Modal>
    </>
  )
}
