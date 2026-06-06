import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { Spinner } from './ui'

const tabs = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/availability', label: 'Mi agenda', icon: '🗓️' },
  { to: '/notifications', label: 'Avisos', icon: '🔔' },
  { to: '/profile', label: 'Perfil', icon: '👤' },
]

export default function Layout() {
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
        Tu cuenta no tiene perfil. Probablemente necesitas una invitación — contacta con tu instructor.
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
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                  isActive ? 'font-semibold text-violet-700' : 'text-gray-500'
                }`
              }
            >
              <span className="text-lg" aria-hidden>
                {t.icon}
              </span>
              {t.label}
              {t.to === '/notifications' && (unread ?? 0) > 0 && (
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
