import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useGroup } from '../groups/useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { Badge, Button, Spinner } from '../../components/ui'
import type { ParticipantResponse, SessionWithParticipants } from '../../lib/types'

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { groupId, isInstructor } = useGroup()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, session_participants(*, profiles(*))')
        .eq('id', sessionId!)
        .single()
      if (error) throw error
      return data as SessionWithParticipants
    },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['session', sessionId] })
    qc.invalidateQueries({ queryKey: ['sessions', groupId] })
    qc.invalidateQueries({ queryKey: ['my-pending'] })
  }

  const respond = useMutation({
    mutationFn: async (response: ParticipantResponse) => {
      const { error } = await supabase
        .from('session_participants')
        .update({ response })
        .eq('session_id', sessionId!)
        .eq('user_id', profile!.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setStatus = useMutation({
    mutationFn: async (status: 'CONFIRMED' | 'CANCELLED') => {
      const { error } = await supabase.from('sessions').update({ status }).eq('id', sessionId!)
      if (error) throw error
      // dispara entrega inmediata (el trigger ya creó las notifications)
      supabase.functions.invoke('send-notifications', { body: {} }).catch(() => {})
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sessions').delete().eq('id', sessionId!)
      if (error) throw error
    },
    onSuccess: () => navigate(`/g/${groupId}`),
  })

  if (isLoading || !session) return <Spinner />

  const r = parseRange(session.time_range)
  const mine = session.session_participants.find((p) => p.user_id === profile?.id)
  const required = session.session_participants.filter((p) => p.required)
  const optional = session.session_participants.filter((p) => !p.required)

  return (
    <div className="space-y-5">
      <Link to={`/g/${groupId}`} className="text-sm text-gray-500">
        ‹ Ensayos
      </Link>

      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{session.title}</h1>
          <Badge
            color={session.status === 'CONFIRMED' ? 'green' : session.status === 'CANCELLED' ? 'red' : 'gray'}
          >
            {session.status === 'CONFIRMED' ? 'Confirmado' : session.status === 'CANCELLED' ? 'Cancelado' : 'Borrador'}
          </Badge>
        </div>
        <p className="text-gray-700">
          {format(r.start, "EEEE d 'de' MMMM · HH:mm", { locale: es })}–{format(r.end, 'HH:mm')}
        </p>
        {session.scene && <p className="text-sm text-gray-600">Escena: {session.scene}</p>}
        {session.location && <p className="text-sm text-gray-600">📍 {session.location}</p>}
      </header>

      {mine && session.status === 'CONFIRMED' && (
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="mb-2 text-sm font-medium text-violet-900">
            {mine.required ? 'Tu asistencia es obligatoria.' : 'Tu asistencia es opcional.'} ¿Vas a ir?
          </p>
          <div className="flex gap-2">
            <Button
              variant={mine.response === 'ACCEPTED' ? 'primary' : 'secondary'}
              onClick={() => respond.mutate('ACCEPTED')}
            >
              ✓ Voy
            </Button>
            <Button
              variant={mine.response === 'DECLINED' ? 'danger' : 'secondary'}
              onClick={() => respond.mutate('DECLINED')}
            >
              ✗ No puedo
            </Button>
          </div>
        </section>
      )}

      <ParticipantList title="Obligatorios" list={required} />
      {optional.length > 0 && <ParticipantList title="Opcionales" list={optional} />}

      {isInstructor && (
        <section className="space-y-2 border-t pt-4">
          {session.status === 'DRAFT' && (
            <Button onClick={() => setStatus.mutate('CONFIRMED')} className="w-full">
              Confirmar ensayo (notifica a todos)
            </Button>
          )}
          {session.status === 'CONFIRMED' && (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('¿Cancelar este ensayo? Se notificará a todos los participantes.'))
                  setStatus.mutate('CANCELLED')
              }}
              className="w-full"
            >
              Cancelar ensayo
            </Button>
          )}
          {session.status === 'DRAFT' && (
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm('¿Eliminar este borrador?')) remove.mutate()
              }}
              className="w-full"
            >
              Eliminar borrador
            </Button>
          )}
        </section>
      )}
    </div>
  )
}

function ParticipantList({
  title,
  list,
}: {
  title: string
  list: SessionWithParticipants['session_participants']
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-700">{title}</h2>
      <ul className="space-y-1">
        {list.map((p) => (
          <li key={p.user_id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span>{p.profiles.name || p.profiles.email}</span>
            <Badge color={p.response === 'ACCEPTED' ? 'green' : p.response === 'DECLINED' ? 'red' : 'amber'}>
              {p.response === 'ACCEPTED' ? 'Voy' : p.response === 'DECLINED' ? 'No va' : 'Pendiente'}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
