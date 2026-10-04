// Calendar import: the user's subscribed calendars (calendar_sources), the
// busy blocks synced from them (external_busy) and the events they chose to
// ignore. The feed link itself is write-only: it's never read back.

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange, type TimeRange } from '../../lib/ranges'

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

export function useCalendars() {
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

  const busyRows = useQuery({
    queryKey: ['external-busy', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_busy')
        .select('id, source_id, uid, time_range, summary, all_day, recurring')
        .order('time_range', { ascending: true })
      if (error) throw error
      return (data as (Omit<ExternalBusy, 'start' | 'end'> & { time_range: string })[]).map(
        ({ time_range, ...rest }) => ({ ...rest, ...parseRange(time_range) }),
      )
    },
    enabled,
  })

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
  const busy = useMemo(() => {
    const ig = ignores.data ?? []
    return (busyRows.data ?? []).filter(
      (b) =>
        !ig.some(
          (i) =>
            i.source_id === b.source_id &&
            i.uid === b.uid &&
            (i.occurrence === null || Date.parse(i.occurrence) === b.start.getTime()),
        ),
    )
  }, [busyRows.data, ignores.data])

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

  return { sources, busy, busyRows, ignores, sync, add, update, remove, ignore, unignore }
}
