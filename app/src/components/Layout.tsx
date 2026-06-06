import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { Spinner } from './ui'

const tabs = [
  { to: '/', key: 'nav.home', icon: '🏠', end: true },
  { to: '/availability', key: 'nav.availability', icon: '🗓️' },
  { to: '/notifications', key: 'nav.notifications', icon: '🔔' },
  { to: '/profile', key: 'nav.profile', icon: '👤' },
]

export default function Layout() {
  const { t } = useTranslation()
  const { session, profile, loading } = useAuth()

  const { data: unread } = useQuery({
    queryKey: ['unread-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
      return count ?? 0
    },
    enabled: !!session,
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
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-3xl">
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
              <span className="text-lg" aria-hidden>
                {t2.icon}
              </span>
              {t(t2.key)}
              {t2.to === '/notifications' && (unread ?? 0) > 0 && (
                <span className="absolute right-1/4 top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
