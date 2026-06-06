// Ensayos a los que estoy convocado (cualquier grupo) + mi respuesta,
// con mutación para confirmar/rechazar asistencia. Reutilizado por
// "Mi agenda" (semana) y "Próximos" (lista completa).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import type { ParticipantResponse, Session, SessionParticipant } from '../../lib/types'

export interface MyParticipation extends SessionParticipant {
  sessions: Session & {
    groups: { name: string }
    // todos los participantes (para el resumen voy/no voy/pendientes)
    session_participants: { response: ParticipantResponse }[]
  }
}

export function tallyResponses(p: MyParticipation) {
  const all = p.sessions.session_participants ?? []
  return {
    total: all.length,
    accepted: all.filter((x) => x.response === 'ACCEPTED').length,
    declined: all.filter((x) => x.response === 'DECLINED').length,
    pending: all.filter((x) => x.response === 'PENDING').length,
  }
}

export function useMyAgenda() {
  const { profile } = useAuth()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['my-agenda', profile?.id],
    queryFn: async () => {
      const [parts, archives] = await Promise.all([
        supabase
          .from('session_participants')
          .select('*, sessions!inner(*, groups(name), session_participants(response))')
          .eq('user_id', profile!.id)
          .neq('sessions.status', 'CANCELLED'),
        supabase.from('session_archives').select('session_id'),
      ])
      if (parts.error) throw parts.error
      if (archives.error) throw archives.error
      const hidden = new Set((archives.data as { session_id: string }[]).map((r) => r.session_id))
      return (parts.data as MyParticipation[])
        .filter((p) => !hidden.has(p.session_id))
        .sort((a, b) => a.sessions.time_range.localeCompare(b.sessions.time_range))
    },
    enabled: !!profile,
  })

  const respond = useMutation({
    mutationFn: async ({ sessionId, response }: { sessionId: string; response: ParticipantResponse }) => {
      const { error } = await supabase
        .from('session_participants')
        .update({ response })
        .eq('session_id', sessionId)
        .eq('user_id', profile!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-agenda'] })
      qc.invalidateQueries({ queryKey: ['my-pending'] })
    },
  })

  return { ...query, respond }
}
