import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { Button, EmptyState, Spinner } from '../../components/ui'
import type { Notification } from '../../lib/types'

const TYPE_ICON: Record<string, string> = {
  SESSION_CONFIRMED: '✅',
  SESSION_CANCELLED: '❌',
  SESSION_CHANGED: '🕐',
  REMINDER: '⏰',
}

export default function NotificationsPage() {
  const { t } = useTranslation()
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
        <h1 className="text-xl font-bold">{t('notifications.title')}</h1>
        {notifications?.some((n) => !n.read_at) && (
          <Button variant="ghost" onClick={() => markAllRead.mutate()}>
            {t('notifications.markRead')}
          </Button>
        )}
      </header>

      {notifications?.length === 0 ? (
        <EmptyState message={t('notifications.empty')} />
      ) : (
        <ul className="space-y-2">
          {notifications?.map((n) => {
            const icon = TYPE_ICON[n.type] ?? '🔔'
            const label = TYPE_ICON[n.type]
              ? t(`notifications.types.${n.type}`, { title: String(n.payload.title ?? '') })
              : n.type
            const starts = n.payload.starts_at ? new Date(String(n.payload.starts_at)) : null
            const inner = (
              <div
                className={`flex gap-3 rounded-xl border p-3 ${n.read_at ? 'bg-white' : 'border-violet-200 bg-violet-50'}`}
              >
                <span className="text-xl" aria-hidden>
                  {icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  {starts && (
                    <p className="text-xs text-gray-600">
                      {format(starts, "EEEE d MMM · HH:mm", { locale: dateLocale() })}
                      {n.payload.location ? ` · ${n.payload.location}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: dateLocale() })}
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
