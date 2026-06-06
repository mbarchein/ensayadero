import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { Button, EmptyState, Spinner } from '../../components/ui'
import type { Notification } from '../../lib/types'

const TYPE_META: Record<string, { icon: string; label: (p: Record<string, unknown>) => string }> = {
  SESSION_CONFIRMED: { icon: '✅', label: (p) => `Ensayo confirmado: ${p.title}` },
  SESSION_CANCELLED: { icon: '❌', label: (p) => `Ensayo cancelado: ${p.title}` },
  SESSION_CHANGED: { icon: '🕐', label: (p) => `Cambio de hora: ${p.title}` },
  REMINDER: { icon: '⏰', label: (p) => `Recordatorio: ${p.title}` },
}

export default function NotificationsPage() {
  const qc = useQueryClient()

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Notification[]
    },
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Avisos</h1>
        {notifications?.some((n) => !n.read_at) && (
          <Button variant="ghost" onClick={() => markAllRead.mutate()}>
            Marcar leídos
          </Button>
        )}
      </header>

      {notifications?.length === 0 ? (
        <EmptyState message="No tienes avisos." />
      ) : (
        <ul className="space-y-2">
          {notifications?.map((n) => {
            const meta = TYPE_META[n.type] ?? { icon: '🔔', label: () => n.type }
            const starts = n.payload.starts_at ? new Date(String(n.payload.starts_at)) : null
            const inner = (
              <div
                className={`flex gap-3 rounded-xl border p-3 ${n.read_at ? 'bg-white' : 'border-violet-200 bg-violet-50'}`}
              >
                <span className="text-xl" aria-hidden>
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{meta.label(n.payload)}</p>
                  {starts && (
                    <p className="text-xs text-gray-600">
                      {format(starts, "EEEE d MMM · HH:mm", { locale: es })}
                      {n.payload.location ? ` · ${n.payload.location}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                  </p>
                </div>
              </div>
            )
            return (
              <li key={n.id}>
                {n.payload.session_id && n.group_id ? (
                  <Link to={`/g/${n.group_id}/sessions/${n.payload.session_id}`}>{inner}</Link>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
