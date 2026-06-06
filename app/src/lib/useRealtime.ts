// Suscripción Realtime: en cada cambio en las tablas observadas, invalida las
// queries de react-query afectadas (invalidateQueries casa por prefijo de clave).
// La entrega ya está filtrada por RLS con el JWT del usuario.

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
