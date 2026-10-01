// Group availability heatmap for the planner and the agenda's group view.
// Loads the members' availabilities, their busy ranges (confirmed rehearsals
// in ANY group; the RPC hides which one) and the group's own rehearsals, for
// the 3-week carousel (prev/current/next), keyed by each week's Monday.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'
import { SLOTS_PER_DAY, heatmap, slotRange } from '../../lib/slots'
import type { Availability, SessionWithParticipants } from '../../lib/types'

export function useGroupHeat(
  groupId: string,
  memberIds: string[],
  activeIds: string[],
  monday: Date,
  // drafts are the director's work in progress: hide them outside the planner
  { confirmedOnly = false }: { confirmedOnly?: boolean } = {},
) {
  const weekEnd = useMemo(() => addDays(monday, 7), [monday])

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

  // map [day][slot] → session covering it, per carousel week (prev/current/next)
  const sessionCellsByWeek = useMemo(() => {
    const shown = (weekSessions ?? []).filter((s) => !confirmedOnly || s.status === 'CONFIRMED')
    const weeks = new Map<number, Map<string, SessionWithParticipants>>()
    for (const off of [-7, 0, 7]) {
      const m = addDays(monday, off)
      const map = new Map<string, SessionWithParticipants>()
      for (const s of shown) {
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
  }, [weekSessions, monday, confirmedOnly])

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

  return { sessionCellsByWeek, gridsByWeek }
}
