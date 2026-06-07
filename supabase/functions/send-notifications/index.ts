// Edge Function: delivers pending notifications via email (Resend) and Web Push (VAPID).
// Invoked by: pg_cron every minute (BOOTSTRAP §11), or directly from the app
// after confirming/cancelling a session for immediate delivery.
// Also sends invitation emails when it receives { invitation_id }.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'Ensayadero <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? ''

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  )
}

const SUBJECTS: Record<string, (p: Record<string, unknown>) => string> = {
  SESSION_CONFIRMED: (p) => `✅ Ensayo confirmado: ${p.title}`,
  SESSION_CANCELLED: (p) => `❌ Ensayo cancelado: ${p.title}`,
  SESSION_CHANGED: (p) => {
    const time = !!p.old_starts_at
    const loc = !!p.old_location
    const what = loc && time ? 'Cambio de hora y lugar' : loc ? 'Cambio de lugar' : 'Cambio de hora'
    return `🕐 ${what}: ${p.title}`
  },
  REMINDER: (p) => `⏰ Recordatorio: ${p.title}`,
}

function fmtDate(iso: unknown): string {
  if (!iso) return ''
  return new Date(String(iso)).toLocaleString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

function emailBody(type: string, p: Record<string, unknown>): string {
  const when = fmtDate(p.starts_at)
  const lines = [
    `<h2 style="color:#7c3aed">${SUBJECTS[type]?.(p) ?? type}</h2>`,
    `<p><strong>Cuándo:</strong> ${when}</p>`,
    p.location ? `<p><strong>Dónde:</strong> ${p.location}</p>` : '',
    type === 'SESSION_CHANGED' && p.old_starts_at
      ? `<p>Hora anterior: <s>${fmtDate(p.old_starts_at)}</s></p>`
      : '',
    type === 'SESSION_CHANGED' && p.old_location
      ? `<p>Lugar anterior: <s>${p.old_location}</s></p>`
      : '',
    p.required === false ? '<p>Tu asistencia es <strong>opcional</strong>.</p>' : '',
    type !== 'SESSION_CANCELLED' && p.session_id
      ? `<p><a href="${APP_URL}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Confirmar asistencia</a></p>`
      : '',
  ]
  return lines.filter(Boolean).join('\n')
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  })
  return res.ok
}

async function sendPush(userId: string, title: string, body: string): Promise<boolean> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', userId)
  if (!subs?.length) return false
  let any = false
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
        JSON.stringify({ title, body, url: APP_URL }),
      )
      any = true
    } catch (err: unknown) {
      // 404/410 → dead subscription, clean up
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }
  return any
}

async function processInvitation(invitationId: string): Promise<void> {
  const { data: inv } = await supabase
    .from('invitations')
    .select('email, role, groups(name)')
    .eq('id', invitationId)
    .single()
  if (!inv) return
  const groupName = (inv.groups as unknown as { name: string })?.name ?? 'un grupo'
  await sendEmail(
    inv.email,
    `🎭 Invitación a "${groupName}" en Ensayadero`,
    `<h2 style="color:#7c3aed">Te han invitado a "${groupName}"</h2>
     <p>Rol: ${inv.role === 'INSTRUCTOR' ? 'Instructor' : 'Actor'}.</p>
     <p>Entra con tu cuenta de Google usando este mismo email (${inv.email}):</p>
     <p><a href="${APP_URL}/login" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Aceptar invitación</a></p>
     <p style="color:#888;font-size:12px">La invitación caduca en 7 días.</p>`,
  )
}

Deno.serve(async (req) => {
  // delivery of a specific invitation
  try {
    const body = await req.json().catch(() => ({}))
    if (body.invitation_id) {
      await processInvitation(body.invitation_id)
      return Response.json({ ok: true, invitation: true })
    }
  } catch { /* no body → process queue */ }

  // process the pending notifications queue
  const { data: pending, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, payload, sent_email_at, sent_push_at, profiles!inner(email, name)')
    .or('sent_email_at.is.null,sent_push_at.is.null')
    .limit(50)

  if (error) return new Response(error.message, { status: 500 })

  let emails = 0
  let pushes = 0
  for (const n of pending ?? []) {
    const payload = n.payload as Record<string, unknown>
    const subject = SUBJECTS[n.type]?.(payload) ?? n.type
    const profile = n.profiles as unknown as { email: string; name: string }
    const updates: Record<string, string> = {}

    // user preferences (default BOTH)
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('channel')
      .eq('user_id', n.user_id)
      .eq('event_type', n.type)
      .maybeSingle()
    const channel = pref?.channel ?? 'BOTH'

    if (!n.sent_email_at) {
      if (channel === 'EMAIL' || channel === 'BOTH') {
        if (await sendEmail(profile.email, subject, emailBody(n.type, payload))) emails++
      }
      updates.sent_email_at = new Date().toISOString() // also mark even if the channel excludes it
    }
    if (!n.sent_push_at) {
      if (channel === 'PUSH' || channel === 'BOTH') {
        if (await sendPush(n.user_id, subject, fmtDate(payload.starts_at))) pushes++
      }
      updates.sent_push_at = new Date().toISOString()
    }
    await supabase.from('notifications').update(updates).eq('id', n.id)
  }

  return Response.json({ processed: pending?.length ?? 0, emails, pushes })
})
