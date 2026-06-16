import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGroup } from './useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { AlertCircle, Check, Loader2, LogOut, Mail, UserCog, UserMinus, UserPlus, Trash2 } from 'lucide-react'
import { Badge, BackButton, Button, InitialsAvatar, Modal, Spinner } from '../../components/ui'
import InvitePanel from './InvitePanel'
import Tip from '../../components/Tip'
import { roleLabel } from '../../lib/roleLabel'
import { parseRange } from '../../lib/ranges'
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
  // member tapped in the orla → action sheet (instructor only, not self)
  const [sheetTarget, setSheetTarget] = useState<MembershipWithProfile | null>(null)
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

  // "new member" banner: members who joined recently and are not summoned to
  // any upcoming session yet. Dismissals are per-device (localStorage).
  const dismissKey = (userId: string) => `member-onboard-dismissed:${groupId}:${userId}`
  // session-only mirror of localStorage so dismissing re-renders immediately
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const { data: futureSessions } = useQuery({
    queryKey: ['future-sessions', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, time_range, status, session_participants(user_id)')
        .eq('group_id', groupId)
        .neq('status', 'CANCELLED')
      if (error) throw error
      return data as { id: string; time_range: string; status: string; session_participants: { user_id: string }[] }[]
    },
    enabled: isInstructor,
  })
  const JOIN_BANNER_DAYS = 14
  const newJoiners = !futureSessions
    ? []
    : members
        .filter(
          (m) =>
            m.user_id !== profile?.id &&
            !dismissed.has(m.user_id) &&
            localStorage.getItem(dismissKey(m.user_id)) === null &&
            Date.now() - new Date(m.joined_at).getTime() < JOIN_BANNER_DAYS * 86_400_000,
        )
        .map((m) => ({
          member: m,
          missing: futureSessions.filter(
            (s) =>
              parseRange(s.time_range).start > new Date() &&
              !s.session_participants.some((p) => p.user_id === m.user_id),
          ).length,
        }))
        .filter((x) => x.missing > 0)

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
    onSuccess: (_, inv) => {
      flashResend(inv.id, 'ok')
      // refresh email_sent_at / email_send_error stamped by the function
      qc.invalidateQueries({ queryKey: ['invitations', groupId] })
    },
    onError: (_, inv) => {
      flashResend(inv.id, 'error')
      qc.invalidateQueries({ queryKey: ['invitations', groupId] })
    },
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

  // directors first, then alphabetical by name (fallback email)
  const sortedMembers = [...members].sort((a, b) => {
    if ((a.role === 'INSTRUCTOR') !== (b.role === 'INSTRUCTOR'))
      return a.role === 'INSTRUCTOR' ? -1 : 1
    return (a.profiles.name || a.profiles.email).localeCompare(
      b.profiles.name || b.profiles.email,
      undefined,
      { sensitivity: 'base' },
    )
  })

  return (
    <div className="space-y-6 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${groupId}`} />
        <h1 className="text-xl font-bold">{t('group.membersTitle')}</h1>
      </header>

      <Tip id="members" />

      {isInstructor && group && <InvitePanel group={group} />}

      {newJoiners.map(({ member: m, missing }) => (
        <div
          key={m.user_id}
          className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm"
        >
          <div className="flex gap-2.5">
            <UserPlus size={18} className="mt-0.5 shrink-0 text-violet-700" aria-hidden />
            <p className="text-violet-900">
              {t('group.joinedBanner', {
                name: m.profiles.name || m.profiles.email,
                count: missing,
              })}
            </p>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                localStorage.setItem(dismissKey(m.user_id), '1')
                setDismissed((prev) => new Set(prev).add(m.user_id))
              }}
            >
              {t('group.joinedDismiss')}
            </Button>
            <Button onClick={() => navigate(`/g/${groupId}/members/${m.user_id}/sessions`)}>
              {t('group.joinedConvoke')}
            </Button>
          </div>
        </div>
      ))}

      {/* members shown as the orla; tapping a face (instructor only, not self)
          opens an action sheet to promote/demote or remove */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
        {sortedMembers.map((m) => {
          const actionable = isInstructor && m.user_id !== profile?.id
          const face = m.profiles.avatar_url ? (
            <img
              src={m.profiles.avatar_url}
              alt=""
              className="h-24 w-24 rounded-full object-cover ring-2 ring-violet-100"
            />
          ) : (
            <InitialsAvatar name={m.profiles.name || m.profiles.email} size={96} />
          )
          const label = (
            <>
              <p className="mt-2 text-sm font-medium leading-tight">
                {m.profiles.name || m.profiles.email}
              </p>
              <Badge color={m.role === 'INSTRUCTOR' ? 'violet' : 'gray'}>
                {roleLabel(t, m.role, m.profiles.gender)}
              </Badge>
            </>
          )
          return (
            <li key={m.user_id} className="flex flex-col items-center text-center">
              {actionable ? (
                <button
                  type="button"
                  onClick={() => setSheetTarget(m)}
                  aria-label={m.profiles.name || m.profiles.email}
                  className="flex flex-col items-center rounded-xl p-1 transition hover:bg-violet-50"
                >
                  {face}
                  {label}
                </button>
              ) : (
                <>
                  {face}
                  {label}
                </>
              )}
            </li>
          )
        })}
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
                  <span className="block text-xs">
                    {i.email_send_error ? (
                      <span className="text-red-600" title={i.email_send_error}>
                        {t('invite.lastSendFailed')}
                      </span>
                    ) : i.email_sent_at ? (
                      <span className="text-gray-500">
                        {t('invite.sentAt', { date: new Date(i.email_sent_at).toLocaleString() })}
                      </span>
                    ) : (
                      <span className="text-amber-600">{t('invite.neverSent')}</span>
                    )}
                  </span>
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

      {/* action sheet for a tapped member */}
      <Modal
        open={!!sheetTarget}
        onClose={() => setSheetTarget(null)}
        title={sheetTarget ? sheetTarget.profiles.name || sheetTarget.profiles.email : ''}
      >
        {sheetTarget && (
          <div className="space-y-2">
            <Button
              variant="secondary"
              className="inline-flex w-full items-center justify-center gap-1.5"
              onClick={() => {
                setRoleTarget(sheetTarget)
                setSheetTarget(null)
              }}
            >
              {sheetTarget.role === 'INSTRUCTOR' ? <UserMinus size={16} /> : <UserCog size={16} />}
              {sheetTarget.role === 'INSTRUCTOR' ? t('roles.toActor') : t('roles.toInstructor')}
            </Button>
            <Button
              variant="danger"
              className="inline-flex w-full items-center justify-center gap-1.5"
              onClick={() => {
                setRemoveTarget(sheetTarget)
                setSheetTarget(null)
              }}
            >
              <Trash2 size={16} /> {t('group.remove')}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
