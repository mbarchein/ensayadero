import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import i18n from '../i18n'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()
  // Last signed-in user id, to detect a user switch and wipe the cache.
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    // Drop every cached query when the user changes (sign-out or switching
    // accounts), so one user never sees another's cached data (notifications,
    // memberships…). Token refreshes keep the same id and don't clear.
    const syncUser = (s: Session | null) => {
      const id = s?.user.id ?? null
      if (id !== lastUserId.current) {
        queryClient.clear()
        lastUserId.current = id
      }
    }
    supabase.auth.getSession().then(({ data }) => {
      syncUser(data.session)
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      syncUser(s)
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [queryClient])

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

  useEffect(() => {
    if (!session) return
    loadProfile(session.user.id).then(() => setLoading(false))
    // Keep user_metadata.lang in sync with the UI language: GoTrue templates and
    // the send-notifications function pick the email language from it.
    const lang = i18n.language?.startsWith('en') ? 'en' : 'es'
    if (session.user.user_metadata?.lang !== lang) {
      supabase.auth.updateUser({ data: { lang } })
    }
  }, [session])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
