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
      <h2 className="font-semibold text-violet-900">{t('invite.title')}</h2>

      {group.join_enabled ? (
        <>
          <div>
            <p className="text-xs text-violet-700">{t('invite.code')}</p>
            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-violet-900">
              {group.join_code}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={share} className="inline-flex items-center gap-1.5">
              <Share2 size={16} /> {t('invite.share')}
            </Button>
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
        <p className="text-sm text-gray-600">{t('invite.disabledNote')}</p>
      )}

      <div className="flex gap-4 text-xs text-violet-700">
        {group.join_enabled && (
          <button
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <RefreshCw size={13} /> {t('invite.regenerate')}
          </button>
        )}
        <button
          onClick={() => toggleEnabled.mutate()}
          disabled={toggleEnabled.isPending}
          className="inline-flex items-center gap-1 hover:underline"
        >
          <Power size={13} /> {group.join_enabled ? t('invite.disable') : t('invite.enable')}
        </button>
      </div>

      {qrOpen && <QrModal link={link} code={group.join_code} onClose={() => setQrOpen(false)} />}

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
