import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGroup } from './useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { AlertCircle, Check, Loader2, LogOut, Mail, UserCog, UserMinus, Trash2 } from 'lucide-react'
import { Badge, BackButton, Button, Modal, Spinner } from '../../components/ui'
import InvitePanel from './InvitePanel'
import { roleLabel } from '../../lib/roleLabel'
import type { GroupRole, Invitation, MembershipWithProfile } from '../../lib/types'

export default function MembersPage() {
  const { t } = useTranslation()
  const { groupId, group, members, isInstructor, loading } = useGroup()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [removeTarget, setRemoveTarget] = useState<MembershipWithProfile | null>(null)
  const [roleTarget, setRoleTarget] = useState<MembershipWithProfile | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveText, setLeaveText] = useState('')
  const [successor, setSuccessor] = useState<string | null>(null)
  // per-invitation resend feedback: id → ok/error (cleared after a few seconds)
  const [resendState, setResendState] = useState<Record<string, 'ok' | 'error'>>({})

  // leaving as the only director with other members left → a successor must be
  // chosen in the leave modal (one is preselected at random)
  const otherMembers = members.filter((m) => m.user_id !== profile?.id)
  const needsSuccessor =
    isInstructor &&
    otherMembers.length > 0 &&
    !otherMembers.some((m) => m.role === 'INSTRUCTOR')

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

  const flashResend = (id: string, state: 'ok' | 'error') => {
    setResendState((s) => ({ ...s, [id]: state }))
    setTimeout(
      () => setResendState(({ [id]: _, ...rest }) => rest),
      4000,
    )
  }

  // manual re-delivery of the invitation email; unlike the best-effort send on
  // creation, failures are surfaced to the user
  const resendInvite = useMutation({
    mutationFn: async (inv: Invitation) => {
      const { error } = await supabase.functions.invoke('send-notifications', {
        body: { invitation_id: inv.id },
      })
      if (error) throw error
    },
    onSuccess: (_, inv) => flashResend(inv.id, 'ok'),
    onError: (_, inv) => flashResend(inv.id, 'error'),
  })

  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invitations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', groupId] }),
  })

  const leaveGroup = useMutation({
    mutationFn: async () => {
      // promote the chosen successor BEFORE leaving (afterwards we are no
      // longer a director); the DB trigger covers any remaining edge case
      if (needsSuccessor && successor) {
        const { error } = await supabase
          .from('memberships')
          .update({ role: 'INSTRUCTOR' })
          .eq('group_id', groupId)
          .eq('user_id', successor)
        if (error) throw error
      }
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
    <div className="space-y-6 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-white px-4 py-2">
        <BackButton to={`/g/${groupId}`} />
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
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  className="p-2"
                  title={m.role === 'INSTRUCTOR' ? t('roles.toActor') : t('roles.toInstructor')}
                  aria-label={m.role === 'INSTRUCTOR' ? t('roles.toActor') : t('roles.toInstructor')}
                  onClick={() => setRoleTarget(m)}
                >
                  {m.role === 'INSTRUCTOR' ? <UserMinus size={18} /> : <UserCog size={18} />}
                </Button>
                <Button
                  variant="ghost"
                  className="p-2 text-red-600"
                  title={t('group.remove')}
                  aria-label={t('group.remove')}
                  onClick={() => setRemoveTarget(m)}
                >
                  <Trash2 size={18} />
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
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <span className="min-w-0">
                  <span className="break-all">{i.email}</span>{' '}
                  <Badge color="gray">{t(`roles.${i.role}`)}</Badge>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-xs">
                    {t('group.expires', { date: new Date(i.expires_at).toLocaleDateString() })}
                  </span>
                  {resendState[i.id] === 'ok' ? (
                    <Check size={16} className="mx-1.5 text-green-600" aria-label={t('invite.resendOk')} />
                  ) : resendState[i.id] === 'error' ? (
                    <AlertCircle size={16} className="mx-1.5 text-red-600" aria-label={t('invite.resendError')} />
                  ) : (
                    <Button
                      variant="ghost"
                      className="p-1.5"
                      title={t('invite.resendEmail')}
                      aria-label={t('invite.resendEmail')}
                      disabled={resendInvite.isPending}
                      onClick={() => resendInvite.mutate(i)}
                    >
                      {resendInvite.isPending && resendInvite.variables?.id === i.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Mail size={16} />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="p-1.5 text-red-600"
                    title={t('invite.deleteInvite')}
                    aria-label={t('invite.deleteInvite')}
                    disabled={deleteInvite.isPending}
                    onClick={() => deleteInvite.mutate(i.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="border-t pt-4">
        <Button
          variant="danger"
          className="inline-flex items-center gap-1.5"
          disabled={leaveGroup.isPending}
          onClick={() => {
            setLeaveText('')
            setSuccessor(
              otherMembers.length
                ? otherMembers[Math.floor(Math.random() * otherMembers.length)].user_id
                : null,
            )
            setLeaveOpen(true)
          }}
        >
          <LogOut size={16} /> {t('group.leave')}
        </Button>
        {leaveGroup.isError && (
          <p className="text-sm text-red-600">{(leaveGroup.error as Error).message}</p>
        )}
      </div>

      {/* change role */}
      <Modal
        open={!!roleTarget}
        onClose={() => setRoleTarget(null)}
        title={roleTarget?.role === 'INSTRUCTOR' ? t('roles.toActor') : t('roles.toInstructor')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {t(roleTarget?.role === 'INSTRUCTOR' ? 'group.demoteConfirm' : 'group.promoteConfirm', {
              name: roleTarget?.profiles.name || roleTarget?.profiles.email || '',
            })}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRoleTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={changeRole.isPending}
              onClick={() => {
                if (roleTarget) {
                  changeRole.mutate({
                    userId: roleTarget.user_id,
                    newRole: roleTarget.role === 'INSTRUCTOR' ? 'ACTOR' : 'INSTRUCTOR',
                  })
                }
                setRoleTarget(null)
              }}
            >
              {roleTarget?.role === 'INSTRUCTOR' ? <UserMinus size={16} /> : <UserCog size={16} />}
              {roleTarget?.role === 'INSTRUCTOR' ? t('roles.toActor') : t('roles.toInstructor')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* remove member */}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title={t('group.removeTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {t('group.removeConfirm', {
              name: removeTarget?.profiles.name || removeTarget?.profiles.email || '',
            })}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRemoveTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={removeMember.isPending}
              onClick={() => {
                if (removeTarget) removeMember.mutate(removeTarget.user_id)
                setRemoveTarget(null)
              }}
            >
              <Trash2 size={16} /> {t('group.remove')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* leave group */}
      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t('group.leaveTitle')}>
        <div className="space-y-4">
          <p className="text-sm font-bold text-red-700">{t('group.leaveConfirm')}</p>
          {needsSuccessor && (
            <label className="block text-sm">
              {t('group.leaveSuccessor')}
              <select
                value={successor ?? ''}
                onChange={(e) => setSuccessor(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
              >
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profiles.name || m.profiles.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            {t('group.leaveTypePrompt', { word: t('group.leaveConfirmWord') })}
            <input
              value={leaveText}
              onChange={(e) => setLeaveText(e.target.value)}
              autoComplete="off"
              placeholder={t('group.leaveConfirmWord')}
              className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setLeaveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={
                leaveGroup.isPending ||
                leaveText.trim().toUpperCase() !== t('group.leaveConfirmWord') ||
                (needsSuccessor && !successor)
              }
              onClick={() => {
                leaveGroup.mutate()
                setLeaveOpen(false)
              }}
            >
              <LogOut size={16} /> {t('group.leave')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
