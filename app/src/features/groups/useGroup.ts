import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Group, MembershipWithProfile } from '../../lib/types'

/** Contexto del grupo activo: datos, miembros y rol del usuario actual. */
export function useGroup() {
  const { groupId } = useParams<{ groupId: string }>()
  const { profile } = useAuth()

  const groupQuery = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('*').eq('id', groupId!).single()
      if (error) throw error
      return data as Group
    },
    enabled: !!groupId,
  })

  const membersQuery = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, profiles(*)')
        .eq('group_id', groupId!)
      if (error) throw error
      return data as MembershipWithProfile[]
    },
    enabled: !!groupId,
  })

  const myRole = membersQuery.data?.find((m) => m.user_id === profile?.id)?.role ?? null
  const isInstructor = myRole === 'INSTRUCTOR'

  return {
    groupId: groupId!,
    group: groupQuery.data,
    members: membersQuery.data ?? [],
    myRole,
    isInstructor,
    loading: groupQuery.isLoading || membersQuery.isLoading,
  }
}
