import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Home, CalendarDays, ClipboardList, Bell, User, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { Spinner } from './ui'

const tabs: { to: string; key: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', key: 'nav.home', icon: Home, end: true },
  { to: '/availability', key: 'nav.availability', icon: CalendarDays },
  { to: '/upcoming', key: 'nav.upcoming', icon: ClipboardList },
  { to: '/notifications', key: 'nav.notifications', icon: Bell },
  { to: '/profile', key: 'nav.profile', icon: User },
]

export default function Layout() {
  const { t } = useTranslation()
  const { session, profile, loading } = useAuth()
  useRealtime(!!session)

  const { data: unread } = useQuery({
    queryKey: ['unread-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .is('archived_at', null)
      return count ?? 0
    },
    enabled: !!session,
    refetchInterval: 60_000,
  })

  // confirmed rehearsals I haven't answered yet (attendance pending) → alert badge
  const { data: pendingAttendance } = useQuery({
    queryKey: ['pending-attendance'],
    queryFn: async () => {
      const { count } = await supabase
        .from('session_participants')
        .select('session_id, sessions!inner(status, time_range)', { count: 'exact', head: true })
        .eq('user_id', profile!.id)
        .eq('response', 'PENDING')
        .eq('sessions.status', 'CONFIRMED')
        .filter('sessions.time_range', 'ov', `[${new Date().toISOString()},)`)
      return count ?? 0
    },
    enabled: !!session && !!profile,
    refetchInterval: 60_000,
  })

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-gray-600">
        {t('login.noProfile')}
      </main>
    )
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex h-14 max-w-3xl items-stretch">
          {tabs.map((t2) => (
            <NavLink
              key={t2.to}
              to={t2.to}
              end={t2.end}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                  isActive ? 'font-semibold text-violet-700' : 'text-gray-500'
                }`
              }
            >
              <t2.icon size={20} aria-hidden />
              {t(t2.key)}
              {t2.to === '/notifications' && (unread ?? 0) > 0 && (
                <span className="absolute right-1/4 top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
              {t2.to === '/upcoming' && (pendingAttendance ?? 0) > 0 && (
                <span className="absolute right-1/4 top-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                  {pendingAttendance}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
