import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useGroup } from './useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Modal, Spinner } from '../../components/ui'
import type { GroupRole, Invitation } from '../../lib/types'

export default function MembersPage() {
  const { t } = useTranslation()
  const { groupId, members, isInstructor, loading } = useGroup()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<GroupRole>('ACTOR')

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

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('invitations').insert({
        group_id: groupId,
        email: email.trim().toLowerCase(),
        role,
        created_by: profile!.id,
      })
      if (error) throw error
      // notificación de invitación → el worker la envía por email
      const { data: inv } = await supabase
        .from('invitations')
        .select('id')
        .eq('group_id', groupId)
        .eq('email', email.trim().toLowerCase())
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      await supabase.functions.invoke('send-notifications', {
        body: { invitation_id: inv?.id },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations', groupId] })
      setInviteOpen(false)
      setEmail('')
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('group.membersTitle')}</h1>
        {isInstructor && <Button onClick={() => setInviteOpen(true)}>{t('group.invite')}</Button>}
      </div>

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
                  {t(`roles.${m.role}`)}
                </Badge>
              </div>
            </div>
            {isInstructor && m.user_id !== profile?.id && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    changeRole.mutate({
                      userId: m.user_id,
                      newRole: m.role === 'INSTRUCTOR' ? 'ACTOR' : 'INSTRUCTOR',
                    })
                  }
                >
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

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('group.inviteTitle')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            invite.mutate()
          }}
        >
          <label className="block text-sm">
            {t('group.email')}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="persona@ejemplo.com"
            />
          </label>
          <label className="block text-sm">
            {t('group.role')}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as GroupRole)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="ACTOR">{t('roles.ACTOR')}</option>
              <option value="INSTRUCTOR">{t('roles.INSTRUCTOR')}</option>
            </select>
          </label>
          {invite.isError && <p className="text-sm text-red-600">{(invite.error as Error).message}</p>}
          <Button type="submit" disabled={invite.isPending} className="w-full">
            {invite.isPending ? t('group.sending') : t('group.sendInvite')}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
