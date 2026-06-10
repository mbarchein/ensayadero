// Availability grid for the session form pages (create/edit): loads the
// group's availabilities plus the week's busy ranges and builds the heatmap
// over ALL members. When editing, the session's own occupation is excluded so
// its participants don't show as "busy" in their own slot.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'
import { heatmap } from '../../lib/slots'
import type { Availability, MembershipWithProfile, SessionWithParticipants } from '../../lib/types'

export function useSessionGrid(
  groupId: string,
  members: MembershipWithProfile[],
  monday: Date,
  excludeSession?: SessionWithParticipants,
) {
  const { data: availabilities } = useQuery({
    queryKey: ['group-availabilities', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availabilities')
        .select('*')
        .in(
          'user_id',
          members.map((m) => m.user_id),
        )
      if (error) throw error
      return data as Availability[]
    },
    enabled: members.length > 0,
  })

  const { data: busyRows } = useQuery({
    queryKey: ['group-busy', groupId, monday.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('group_busy_ranges', {
        gid: groupId,
        search: `[${monday.toISOString()},${addDays(monday, 7).toISOString()})`,
      })
      if (error) throw error
      return data as { user_id: string; busy: string }[]
    },
  })

  return useMemo(() => {
    if (!availabilities) return null
    const exclude = excludeSession ? parseRange(excludeSession.time_range) : null
    const sessionPeople = new Set(
      (excludeSession?.session_participants ?? []).map((p) => p.user_id),
    )
    const busyByUser = new Map<string, TimeRange[]>()
    for (const row of busyRows ?? []) {
      const iv = parseRange(row.busy)
      if (exclude && sessionPeople.has(row.user_id) && overlaps(iv, exclude)) continue
      const list = busyByUser.get(row.user_id) ?? []
      list.push(iv)
      busyByUser.set(row.user_id, list)
    }
    return heatmap(
      members.map((m) => ({
        userId: m.user_id,
        availabilities: availabilities.filter((a) => a.user_id === m.user_id),
        busy: busyByUser.get(m.user_id) ?? [],
      })),
      monday,
    )
  }, [availabilities, busyRows, members, monday, excludeSession])
}
