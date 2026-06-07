// Director's invite panel: group code, shareable link
// (Web Share + copy), QR, regenerate/enable code, and invite by email
// (one or several in bulk).

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { Share2, Copy, QrCode, Mail, RefreshCw, Power } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { Button, Modal } from '../../components/ui'
import type { Group, GroupRole } from '../../lib/types'

export default function InvitePanel({ group }: { group: Group }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [qrOpen, setQrOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [enableOpen, setEnableOpen] = useState(false)
  const [regenerateOpen, setRegenerateOpen] = useState(false)
  const [emailsOpen, setEmailsOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState<GroupRole>('ACTOR')
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const link = `${import.meta.env.VITE_APP_URL}/join/${group.join_code}`

  const refresh = () => qc.invalidateQueries({ queryKey: ['group', group.id] })

  const regenerate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('regenerate_join_code', { gid: group.id })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const toggleEnabled = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_join_enabled', {
        gid: group.id,
        enabled: !group.join_enabled,
      })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const bulkInvite = useMutation({
    mutationFn: async () => {
      const list = [...new Set(emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
      if (list.length === 0) return 0
      const { error } = await supabase
        .from('invitations')
        .insert(list.map((email) => ({ group_id: group.id, email, role, created_by: profile!.id })))
      if (error) throw error
      // send emails (best-effort)
      const { data: created } = await supabase
        .from('invitations')
        .select('id, email')
        .eq('group_id', group.id)
        .is('accepted_at', null)
        .in('email', list)
      for (const inv of created ?? []) {
        supabase.functions.invoke('send-notifications', { body: { invitation_id: inv.id } }).catch(() => {})
      }
      return list.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations', group.id] })
      setEmailsOpen(false)
      setEmails('')
    },
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
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShareError(link)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-violet-900">{t('invite.title')}</h2>
        {group.join_enabled && (
          <Button variant="primary" className="p-2" title={t('invite.share')} aria-label={t('invite.share')} onClick={share}>
            <Share2 size={18} />
          </Button>
        )}
      </div>

      {group.join_enabled ? (
        <>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-violet-700">{t('invite.code')}</p>
              <p className="font-mono text-2xl font-bold tracking-[0.2em] text-violet-900">
                {group.join_code}
              </p>
            </div>
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
                variant="ghost"
                className="p-2"
                title={t('invite.disable')}
                aria-label={t('invite.disable')}
                disabled={toggleEnabled.isPending}
                onClick={() => setDisableOpen(true)}
              >
                <Power size={18} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copy} className="inline-flex items-center gap-1.5">
              <Copy size={16} /> {copied ? t('invite.copied') : t('invite.copyLink')}
            </Button>
            <Button variant="secondary" onClick={() => setQrOpen(true)} className="inline-flex items-center gap-1.5">
              <QrCode size={16} /> {t('invite.qr')}
            </Button>
            <Button variant="secondary" onClick={() => setEmailsOpen(true)} className="inline-flex items-center gap-1.5">
              <Mail size={16} /> {t('invite.byEmail')}
            </Button>
          </div>
          {shareError && (
            <p className="break-all text-xs text-gray-600">
              {t('invite.copyManually')}: {shareError}
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600">{t('invite.disabledNote')}</p>
          <Button
            variant="primary"
            className="inline-flex items-center gap-1.5"
            title={t('invite.enable')}
            disabled={toggleEnabled.isPending}
            onClick={() => setEnableOpen(true)}
          >
            <Power size={16} /> {t('invite.enable')}
          </Button>
        </div>
      )}

      {qrOpen && <QrModal link={link} code={group.join_code} onClose={() => setQrOpen(false)} />}

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

      <Modal open={enableOpen} onClose={() => setEnableOpen(false)} title={t('invite.enable')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('invite.enableConfirm')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEnableOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={toggleEnabled.isPending}
              onClick={() => {
                toggleEnabled.mutate()
                setEnableOpen(false)
              }}
            >
              <Power size={16} /> {t('invite.enable')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title={t('invite.disable')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('invite.disableConfirm')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDisableOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="warning"
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={toggleEnabled.isPending}
              onClick={() => {
                toggleEnabled.mutate()
                setDisableOpen(false)
              }}
            >
              <Power size={16} /> {t('invite.disable')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={emailsOpen} onClose={() => setEmailsOpen(false)} title={t('invite.byEmailTitle')}>
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
              rows={4}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="ana@x.com, benito@y.com…"
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
          {bulkInvite.isError && <p className="text-sm text-red-600">{(bulkInvite.error as Error).message}</p>}
          <Button type="submit" disabled={bulkInvite.isPending} className="w-full">
            {bulkInvite.isPending ? t('group.sending') : t('invite.sendEmails')}
          </Button>
        </form>
      </Modal>
    </section>
  )
}

function QrModal({ link, code, onClose }: { link: string; code: string; onClose: () => void }) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, link, { width: 240, margin: 1 }).catch(() => {})
    }
  }, [link])
  return (
    <Modal open onClose={onClose} title={t('invite.qrTitle')}>
      <div className="flex flex-col items-center gap-3">
        <canvas ref={canvasRef} />
        <p className="font-mono text-xl font-bold tracking-[0.2em]">{code}</p>
        <p className="text-center text-sm text-gray-600">{t('invite.qrHint')}</p>
      </div>
    </Modal>
  )
}
