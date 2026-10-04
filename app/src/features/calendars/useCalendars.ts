// Calendar import: the user's subscribed calendars (calendar_sources), the
// busy blocks synced from them (external_busy) and the events they chose to
// ignore. The feed link itself is write-only: it's never read back.

import { useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'

export interface CalendarSource {
  id: string
  name: string
  url_hint: string | null
  include_all_day: boolean
  include_free: boolean
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

export interface ExternalBusy extends TimeRange {
  id: number
  source_id: string
  uid: string
  summary: string | null
  all_day: boolean
  recurring: boolean
}

export interface IgnoredEvent {
  id: string
  source_id: string
  uid: string
  occurrence: string | null // null = the whole series
  summary: string | null
}

/** Calendars older than this get refreshed when the agenda opens. */
export const STALE_MS = 60 * 60_000

const SOURCE_COLS = 'id, name, url_hint, include_all_day, include_free, last_synced_at, last_error, created_at'
const BUSY_COLS = 'id, source_id, uid, time_range, summary, all_day, recurring'

type BusyRow = Omit<ExternalBusy, 'start' | 'end'> & { time_range: string }
const toBusy = (rows: BusyRow[]): ExternalBusy[] =>
  rows.map(({ time_range, ...rest }) => ({ ...rest, ...parseRange(time_range) }))

/** The blocks overlapping [from, to). */
async function fetchBusyWindow(from: number, to: number) {
  const { data, error } = await supabase
    .from('external_busy')
    .select(BUSY_COLS)
    .filter('time_range', 'ov', `[${new Date(from).toISOString()},${new Date(to).toISOString()})`)
    .order('time_range', { ascending: true })
  if (error) throw error
  return toBusy(data as BusyRow[])
}

const notIgnored = (list: ExternalBusy[], ig: IgnoredEvent[]) =>
  list.filter(
    (b) =>
      !ig.some(
        (i) =>
          i.source_id === b.source_id &&
          i.uid === b.uid &&
          (i.occurrence === null || Date.parse(i.occurrence) === b.start.getTime()),
      ),
  )

const mergeById = (a: ExternalBusy[], b: ExternalBusy[]) => {
  if (b.length === 0) return a
  const seen = new Set(a.map((r) => r.id))
  return [...a, ...b.filter((r) => !seen.has(r.id))]
}

/** `range`: the time on screen. Only matters when the server capped the
 *  first load (see allBusy): blocks past the cap are then fetched for it. */
export function useCalendars(range?: TimeRange | null) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const enabled = !!profile

  const sources = useQuery({
    queryKey: ['calendar-sources', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_sources')
        .select(SOURCE_COLS)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as CalendarSource[]
    },
    enabled,
  })

  // All the blocks at once, unless PostgREST's row cap (max_rows) cuts the
  // answer: the rows (in start order) are then complete only before the last
  // one's start, and later time is fetched as it comes on screen.
  const allBusy = useQuery({
    queryKey: ['external-busy', profile?.id],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('external_busy')
        .select(BUSY_COLS, { count: 'exact' })
        .order('time_range', { ascending: true })
      if (error) throw error
      const rows = toBusy(data as BusyRow[])
      const capped = count != null && count > rows.length && rows.length > 0
      return { rows, completeUntil: capped ? rows[rows.length - 1].start.getTime() : null }
    },
    enabled,
  })
  const completeUntil = allBusy.data?.completeUntil ?? null

  const rangeEnd = range?.end.getTime() ?? null
  const windowStart =
    completeUntil != null && range && rangeEnd! > completeUntil
      ? Math.max(range.start.getTime(), completeUntil)
      : null
  const windowBusy = useQuery({
    queryKey: ['external-busy', profile?.id, windowStart, rangeEnd],
    queryFn: () => fetchBusyWindow(windowStart!, rangeEnd!),
    enabled: enabled && windowStart != null,
    // while the next week loads, keep the previous one's blocks (they only
    // paint their own week)
    placeholderData: keepPreviousData,
  })

  const busyRows = useMemo(
    () => mergeById(allBusy.data?.rows ?? [], windowStart != null ? (windowBusy.data ?? []) : []),
    [allBusy.data, windowBusy.data, windowStart],
  )

  const ignores = useQuery({
    queryKey: ['external-ignores', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_busy_ignores')
        .select('id, source_id, uid, occurrence, summary')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as IgnoredEvent[]
    },
    enabled,
  })

  // what actually counts as busy: everything not ignored
  const busy = useMemo(() => notIgnored(busyRows, ignores.data ?? []), [busyRows, ignores.data])

  /** What counts as busy in [from, to), fetching it first if it lies past
   *  the cap (e.g. "fill in availability" over the coming weeks). */
  const busyBetween = async (from: Date, to: Date) => {
    let rows = busyRows
    if (completeUntil != null && to.getTime() > completeUntil) {
      const start = Math.max(from.getTime(), completeUntil)
      const extra = await qc.fetchQuery({
        queryKey: ['external-busy', profile?.id, start, to.getTime()],
        queryFn: () => fetchBusyWindow(start, to.getTime()),
      })
      rows = mergeById(rows, extra)
    }
    const span = { start: from, end: to }
    return notIgnored(rows, ignores.data ?? []).filter((b) => overlaps(b, span))
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['calendar-sources'] })
    qc.invalidateQueries({ queryKey: ['external-busy'] })
    qc.invalidateQueries({ queryKey: ['external-ignores'] })
    // the group views read the members' busy time from the server
    qc.invalidateQueries({ queryKey: ['group-busy'] })
  }

  /** Re-downloads one calendar, or all of the user's (the server skips the
   *  ones synced in the last 30 s). */
  const sync = useMutation({
    mutationFn: async (sourceId?: string) => {
      const { error } = await supabase.functions.invoke('sync-calendars', {
        body: sourceId ? { source_id: sourceId } : {},
      })
      if (error) throw error
    },
    onSettled: refresh,
  })

  const add = useMutation({
    mutationFn: async (input: { name: string; url: string; include_all_day: boolean; include_free: boolean }) => {
      const { data, error } = await supabase.from('calendar_sources').insert(input).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: (id) => {
      refresh()
      sync.mutate(id)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; include_all_day?: boolean; include_free?: boolean }) => {
      const { error } = await supabase.from('calendar_sources').update(patch).eq('id', id)
      if (error) throw error
      return id
    },
    // new rules → expand the feed again
    onSuccess: (id) => sync.mutate(id),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calendar_sources').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const ignore = useMutation({
    mutationFn: async (ev: { source_id: string; uid: string; occurrence: Date | null; summary: string | null }) => {
      const { error } = await supabase.from('external_busy_ignores').insert({
        source_id: ev.source_id,
        uid: ev.uid,
        occurrence: ev.occurrence?.toISOString() ?? null,
        summary: ev.summary,
      })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const unignore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('external_busy_ignores').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const capped = completeUntil != null
  return { sources, busy, busyRows, capped, busyBetween, ignores, sync, add, update, remove, ignore, unignore }
}
