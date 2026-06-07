// Realtime subscription: on each change in the observed tables, invalidates the
// affected react-query queries (invalidateQueries matches by key prefix).
// Delivery is already filtered by RLS with the user's JWT.

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export function useRealtime(enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    const inv = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
    const channel = supabase
      .channel('app-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () =>
        inv('sessions', 'week-sessions', 'session', 'my-agenda', 'my-pending'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants' }, () =>
        inv('sessions', 'week-sessions', 'session', 'my-agenda', 'my-pending'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availabilities' }, () =>
        inv('availabilities', 'group-availabilities', 'group-busy', 'my-agenda'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () =>
        inv('notifications', 'unread-count'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships' }, () =>
        inv('my-memberships', 'group-members'),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, qc])
}
