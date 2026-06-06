import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGroup } from './useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { LogOut, UserCog, UserMinus } from 'lucide-react'
import { Badge, Button, Spinner } from '../../components/ui'
import InvitePanel from './InvitePanel'
import { roleLabel } from '../../lib/roleLabel'
import type { GroupRole, Invitation } from '../../lib/types'

export default function MembersPage() {
  const { t } = useTranslation()
  const { groupId, group, members, isInstructor, loading } = useGroup()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: invitations } = useQuery({
    queryKey: ['invitations', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('group_id', groupId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
      if (error) throw error
      return data as Invitation[]
    },
    enabled: isInstructor,
  })

  const leaveGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', profile!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      navigate('/', { replace: true })
    },
  })

  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: GroupRole }) => {
      const { error } = await supabase
        .from('memberships')
        .update({ role: newRole })
        .eq('group_id', groupId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-members', groupId] }),
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-members', groupId] }),
  })

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <header>
        <Link to={`/g/${groupId}`} className="text-sm text-gray-500">
          {t('sessions.backToSessions')}
        </Link>
        <h1 className="text-xl font-bold">{t('group.membersTitle')}</h1>
      </header>

      {isInstructor && group && <InvitePanel group={group} />}

      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between rounded-xl border bg-white p-3">
            <div className="flex items-center gap-3">
              {m.profiles.avatar_url ? (
                <img src={m.profiles.avatar_url} alt="" className="h-9 w-9 rounded-full" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700">
                  {(m.profiles.name || m.profiles.email)[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{m.profiles.name || m.profiles.email}</p>
                <Badge color={m.role === 'INSTRUCTOR' ? 'violet' : 'gray'}>
                  {roleLabel(t, m.role, m.profiles.gender)}
                </Badge>
              </div>
            </div>
            {isInstructor && m.user_id !== profile?.id && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="inline-flex items-center gap-1.5"
                  onClick={() =>
                    changeRole.mutate({
                      userId: m.user_id,
                      newRole: m.role === 'INSTRUCTOR' ? 'ACTOR' : 'INSTRUCTOR',
                    })
                  }
                >
                  {m.role === 'INSTRUCTOR' ? <UserMinus size={15} /> : <UserCog size={15} />}
                  {m.role === 'INSTRUCTOR' ? t('roles.toActor') : t('roles.toInstructor')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(t('group.removeConfirm', { name: m.profiles.name || m.profiles.email })))
                      removeMember.mutate(m.user_id)
                  }}
                >
                  {t('group.remove')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isInstructor && (invitations?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">{t('group.pendingInvites')}</h2>
          <ul className="space-y-1 text-sm text-gray-600">
            {invitations!.map((i) => (
              <li key={i.id} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span>
                  {i.email} <Badge color="gray">{t(`roles.${i.role}`)}</Badge>
                </span>
                <span className="text-xs">
                  {t('group.expires', { date: new Date(i.expires_at).toLocaleDateString() })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="border-t pt-4">
        <Button
          variant="ghost"
          className="inline-flex items-center gap-1.5 text-red-600"
          disabled={leaveGroup.isPending}
          onClick={() => {
            if (confirm(t('group.leaveConfirm'))) leaveGroup.mutate()
          }}
        >
          <LogOut size={15} /> {t('group.leave')}
        </Button>
        {leaveGroup.isError && (
          <p className="text-sm text-red-600">{(leaveGroup.error as Error).message}</p>
        )}
      </div>
    </div>
  )
}
