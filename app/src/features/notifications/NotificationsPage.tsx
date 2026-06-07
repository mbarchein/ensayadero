import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle, Clock, AlarmClock, Bell, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button, EmptyState, Spinner } from '../../components/ui'
import type { Notification } from '../../lib/types'

const TYPE_ICON: Record<string, { Icon: LucideIcon; color: string }> = {
  SESSION_CONFIRMED: { Icon: CheckCircle2, color: 'text-green-600' },
  SESSION_CANCELLED: { Icon: XCircle, color: 'text-red-600' },
  SESSION_CHANGED: { Icon: Clock, color: 'text-amber-600' },
  REMINDER: { Icon: AlarmClock, color: 'text-violet-600' },
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*, groups(name)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as (Notification & { groups: { name: string } | null })[]
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
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-white px-4 py-2">
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
            const meta = TYPE_ICON[n.type]
            const Icon = meta?.Icon ?? Bell
            const title = String(n.payload.title ?? '')
            let typeKey = n.type
            if (n.type === 'SESSION_CHANGED') {
              // distinguish time / place / both based on the payload
              const timeChanged = !!n.payload.old_starts_at
              const locChanged = !!n.payload.old_location
              typeKey = locChanged && timeChanged
                ? 'SESSION_CHANGED_BOTH'
                : locChanged
                  ? 'SESSION_CHANGED_LOCATION'
                  : 'SESSION_CHANGED'
            }
            const label = meta ? t(`notifications.types.${typeKey}`, { title }) : n.type
            const starts = n.payload.starts_at ? new Date(String(n.payload.starts_at)) : null
            const inner = (
              <div
                className={`flex gap-3 rounded-xl border p-3 ${n.read_at ? 'bg-white' : 'border-violet-200 bg-violet-50'}`}
              >
                <Icon size={20} className={`mt-0.5 shrink-0 ${meta?.color ?? 'text-gray-500'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  {starts && (
                    <p className="text-xs text-gray-600">
                      {format(starts, "EEEE d MMM · HH:mm", { locale: dateLocale() })}
                      {n.payload.location ? ` · ${n.payload.location}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {n.groups?.name ? `${n.groups.name} · ` : ''}
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
