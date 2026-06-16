// Dedicated invite page (instructor only): toggle group join on/off, share the
// code/link with an always-visible QR, invite by email, and manage pending
// invitations. Reached from the members page "Invite" action.

import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import {
  AlertCircle,
  Check,
  Loader2,
  Mail,
  Power,
  RefreshCw,
  Share2,
  Trash2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { BackButton, Button, Modal, Spinner, Toggle } from '../../components/ui'
import { useGroup } from './useGroup'
import type { Group, Invitation } from '../../lib/types'

export default function InvitePage() {
  const { group, isInstructor, loading } = useGroup()

  if (loading || !group) return <Spinner />
  if (!isInstructor) return <Navigate to={`/g/${group.id}`} replace />
  return <InviteForm group={group} />
}

function InviteForm({ group }: { group: Group }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [regenerateOpen, setRegenerateOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  // per-invitation resend feedback (cleared after a few seconds)
  const [resendState, setResendState] = useState<Record<string, 'ok' | 'error'>>({})

  const link = `${import.meta.env.VITE_APP_URL}/join/${group.join_code}`
  const refreshGroup = () => qc.invalidateQueries({ queryKey: ['group', group.id] })

  const { data: invitations } = useQuery({
    queryKey: ['invitations', group.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('group_id', group.id)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
      if (error) throw error
      return data as Invitation[]
    },
  })

  const toggleEnabled = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_join_enabled', {
        gid: group.id,
        enabled: !group.join_enabled,
      })
      if (error) throw error
    },
    onSuccess: refreshGroup,
  })

  const regenerate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('regenerate_join_code', { gid: group.id })
      if (error) throw error
    },
    onSuccess: refreshGroup,
  })

  const bulkInvite = useMutation({
    mutationFn: async () => {
      const list = [
        ...new Set(emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)),
      ]
      if (list.length === 0) return 0
      const { error } = await supabase
        .from('invitations')
        .insert(list.map((email) => ({ group_id: group.id, email, created_by: profile!.id })))
      if (error) throw error
      const { data: created } = await supabase
        .from('invitations')
        .select('id, email')
        .eq('group_id', group.id)
        .is('accepted_at', null)
        .in('email', list)
      // send the emails right away (awaited so failures surface to the user)
      await Promise.all(
        (created ?? []).map((inv) =>
          supabase.functions.invoke('send-notifications', { body: { invitation_id: inv.id } }),
        ),
      )
      return list.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations', group.id] })
      setEmails('')
    },
  })

  const flashResend = (id: string, state: 'ok' | 'error') => {
    setResendState((s) => ({ ...s, [id]: state }))
    setTimeout(() => setResendState(({ [id]: _, ...rest }) => rest), 4000)
  }

  const resendInvite = useMutation({
    mutationFn: async (inv: Invitation) => {
      const { error } = await supabase.functions.invoke('send-notifications', {
        body: { invitation_id: inv.id },
      })
      if (error) throw error
    },
    onSuccess: (_, inv) => {
      flashResend(inv.id, 'ok')
      qc.invalidateQueries({ queryKey: ['invitations', group.id] })
    },
    onError: (_, inv) => {
      flashResend(inv.id, 'error')
      qc.invalidateQueries({ queryKey: ['invitations', group.id] })
    },
  })

  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invitations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', group.id] }),
  })

  const share = async () => {
    setShareError(null)
    const payload = { title: group.name, text: t('invite.shareText', { group: group.name }), url: link }
    if (navigator.share) {
      try {
        await navigator.share(payload)
      } catch {
        /* cancelled by the user */
      }
    } else {
      copy()
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      setShareError(link)
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${group.id}/members`} />
        <h1 className="text-xl font-bold">{t('group.inviteTitle')}</h1>
      </header>

      {/* group-join toggle */}
      <div className="flex items-start justify-between gap-3 rounded-xl border bg-white p-4">
        <div>
          <p className="font-medium">{t('invite.joinLabel')}</p>
          {group.join_enabled && (
            <p className="text-sm text-gray-600">{t('invite.joinHint')}</p>
          )}
        </div>
        <Toggle
          checked={group.join_enabled}
          onChange={() => toggleEnabled.mutate()}
          disabled={toggleEnabled.isPending}
          ariaLabel={t('invite.joinLabel')}
        />
      </div>

      {!group.join_enabled && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Power size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>{t('invite.disabledNote')}</p>
        </div>
      )}

      {/* share code + link + QR (only when join is on) */}
      {group.join_enabled && (
        <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-violet-900">{t('invite.shareTitle')}</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                className="p-2"
                title={t('invite.regenerate')}
                aria-label={t('invite.regenerate')}
                disabled={regenerate.isPending}
                onClick={() => setRegenerateOpen(true)}
              >
                <RefreshCw size={18} />
              </Button>
              <Button
                variant="primary"
                className="p-2"
                title={t('invite.share')}
                aria-label={t('invite.share')}
                onClick={share}
              >
                <Share2 size={18} />
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <Qr link={link} />
            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-violet-900">
              {group.join_code}
            </p>
          </div>

          {shareError && (
            <p className="break-all text-xs text-gray-600">
              {t('invite.copyManually')}: {shareError}
            </p>
          )}
        </section>
      )}

      {/* invite by email (independent of the join code) */}
      <section className="space-y-3">
        <h2 className="font-semibold">{t('invite.byEmailTitle')}</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            bulkInvite.mutate()
          }}
        >
          <label className="block text-sm">
            {t('invite.emailsLabel')}
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="ana@x.com, benito@y.com…"
            />
          </label>
          {bulkInvite.isError && (
            <p className="text-sm text-red-600">{(bulkInvite.error as Error).message}</p>
          )}
          <Button
            type="submit"
            disabled={bulkInvite.isPending}
            className="inline-flex w-full items-center justify-center gap-1.5"
          >
            <Mail size={16} /> {bulkInvite.isPending ? t('group.sending') : t('invite.sendEmails')}
          </Button>
        </form>
      </section>

      {/* pending invitations */}
      {(invitations?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">{t('group.pendingInvites')}</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {invitations!.map((i) => (
              <li key={i.id} className="space-y-1 rounded-lg bg-gray-50 px-3 py-2">
                <p className="break-all font-medium text-gray-800">{i.email}</p>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0 text-xs">
                    {i.email_send_error ? (
                      <p className="text-red-600" title={i.email_send_error}>
                        {t('invite.lastSendFailed')}
                      </p>
                    ) : i.email_sent_at ? (
                      <p className="text-gray-500">
                        {t('invite.sentAt', {
                          date: new Date(i.email_sent_at).toLocaleString(undefined, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }),
                        })}
                      </p>
                    ) : (
                      <p className="text-amber-600">{t('invite.neverSent')}</p>
                    )}
                    <p className="text-gray-500">
                      {t('group.expires', { date: new Date(i.expires_at).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={regenerateOpen} onClose={() => setRegenerateOpen(false)} title={t('invite.regenerate')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('invite.regenerateConfirm')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRegenerateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="warning"
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={regenerate.isPending}
              onClick={() => {
                regenerate.mutate()
                setRegenerateOpen(false)
              }}
            >
              <RefreshCw size={16} /> {t('invite.regenerate')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Qr({ link }: { link: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, link, { width: 200, margin: 1 }).catch(() => {})
    }
  }, [link])
  return <canvas ref={canvasRef} className="rounded-lg bg-white p-2" />
}
