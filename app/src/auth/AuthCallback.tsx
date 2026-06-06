import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // supabase-js procesa el hash/code automáticamente; esperamos sesión
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        // signup sin invitación → trigger lanza SIGNUP_REQUIRES_INVITATION
        const params = new URLSearchParams(window.location.search + window.location.hash.replace('#', '&'))
        const desc = params.get('error_description') ?? error?.message
        setError(
          desc?.includes('SIGNUP_REQUIRES_INVITATION') || desc?.includes('Database error')
            ? 'Necesitas una invitación para crear una cuenta. Pide a tu instructor que te invite.'
            : desc ?? null,
        )
        if (!desc) navigate('/login', { replace: true })
        return
      }
      navigate('/', { replace: true })
    })
  }, [navigate])

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <p className="max-w-sm text-center text-red-600">{error}</p>
        <button onClick={() => navigate('/login')} className="text-violet-700 underline">
          Volver
        </button>
      </main>
    )
  }
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="animate-pulse text-violet-600">Entrando…</p>
    </main>
  )
}
