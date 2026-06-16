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
// Local dev only: when set, all emails go to the mailpit catcher instead of Resend.
const MAILPIT_URL = Deno.env.get('MAILPIT_URL')
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

type Lang = 'es' | 'en'

// Email copy per language; the user's language comes from auth user_metadata.lang.
const T: Record<Lang, Record<string, string>> = {
  es: {
    confirmed: 'Ensayo confirmado',
    cancelled: 'Ensayo cancelado',
    timeChange: 'Cambio de hora',
    placeChange: 'Cambio de lugar',
    timePlaceChange: 'Cambio de hora y lugar',
    reminder: 'Recordatorio',
    nudge: 'Te esperan: confirma tu asistencia',
    memberJoined: 'Nuevo miembro',
    memberJoinedBody: 'se ha unido al grupo',
    memberCta: 'Ver miembros',
    promoted: 'Ahora diriges el grupo',
    promotedBy: 'te ha dado el rol de dirección en',
    promotedBody: 'Tienes el rol de dirección en',
    promotedPerks: 'Ya puedes programar ensayos, convocar al grupo e invitar a nuevos miembros.',
    promotedCta: 'Abrir el grupo',
    when: 'Cuándo',
    where: 'Dónde',
    prevTime: 'Hora anterior',
    prevPlace: 'Lugar anterior',
    optional: 'Tu asistencia es <strong>opcional</strong>.',
    cta: 'Confirmar asistencia',
    comments: 'Comentarios',
    attendees: 'Convocados',
    optionalTag: 'opcional',
    footer:
      'Recibes este correo porque formas parte de un grupo en Ensayadero. Si no esperabas este aviso, puedes ignorarlo.',
  },
  en: {
    confirmed: 'Rehearsal confirmed',
    cancelled: 'Rehearsal cancelled',
    timeChange: 'Time change',
    placeChange: 'Location change',
    timePlaceChange: 'Time and location change',
    reminder: 'Reminder',
    nudge: 'They are waiting: confirm your attendance',
    memberJoined: 'New member',
    memberJoinedBody: 'has joined the group',
    memberCta: 'See members',
    promoted: 'You now direct the group',
    promotedBy: 'has given you the director role in',
    promotedBody: 'You have the director role in',
    promotedPerks: 'You can now plan rehearsals, summon the group and invite new members.',
    promotedCta: 'Open the group',
    when: 'When',
    where: 'Where',
    prevTime: 'Previous time',
    prevPlace: 'Previous location',
    optional: 'Your attendance is <strong>optional</strong>.',
    cta: 'Confirm attendance',
    comments: 'Comments',
    attendees: 'Summoned',
    optionalTag: 'optional',
    footer:
      'You receive this email because you belong to a group on Ensayadero. If you were not expecting this notice, you can ignore it.',
  },
}

// Sessions have no title: the label is "<group> · <short date/time>".
function sessionLabel(p: Record<string, unknown>, lang: Lang, group?: string): string {
  const en = lang === 'en'
  const when = p.starts_at
    ? new Date(String(p.starts_at)).toLocaleString(en ? 'en-US' : 'es-ES', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: en ? 'numeric' : '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
      })
    : ''
  return [group, when].filter(Boolean).join(' · ')
}

const SUBJECTS: Record<string, (p: Record<string, unknown>, lang: Lang, group?: string) => string> = {
  SESSION_CONFIRMED: (p, l, g) => `✅ ${T[l].confirmed}: ${sessionLabel(p, l, g)}`,
  SESSION_CANCELLED: (p, l, g) => `❌ ${T[l].cancelled}: ${sessionLabel(p, l, g)}`,
  SESSION_CHANGED: (p, l, g) => {
    const time = !!p.old_starts_at
    const loc = !!p.old_location
    const what = loc && time ? T[l].timePlaceChange : loc ? T[l].placeChange : T[l].timeChange
    return `🕐 ${what}: ${sessionLabel(p, l, g)}`
  },
  REMINDER: (p, l, g) => `⏰ ${T[l].reminder}: ${sessionLabel(p, l, g)}`,
  NUDGE: (p, l, g) => `📣 ${T[l].nudge}: ${sessionLabel(p, l, g)}`,
  MEMBER_JOINED: (p, l, g) => `🎭 ${T[l].memberJoined}: ${[g, p.member_name].filter(Boolean).join(' · ')}`,
  MEMBER_PROMOTED: (_p, l, g) => `🎬 ${T[l].promoted}${g ? `: ${g}` : ''}`,
}

// MEMBER_PROMOTED: who gave you the role (when known), what you can do now,
// and a link to the group.
function promotedBody(p: Record<string, unknown>, lang: Lang, groupId: unknown, group?: string): string {
  const t = T[lang]
  const intro = p.promoted_by
    ? `<strong>${p.promoted_by}</strong> ${t.promotedBy} "${group ?? ''}".`
    : `${t.promotedBody} "${group ?? ''}".`
  return [
    `<h2 style="color:#1f2937;font-size:18px;margin:0 0 12px">🎬 ${t.promoted}</h2>`,
    `<p style="color:#4b5563;font-size:15px;margin:0 0 8px">${intro}</p>`,
    `<p style="color:#4b5563;font-size:15px;margin:0 0 8px">${t.promotedPerks}</p>`,
    groupId
      ? `<p style="text-align:center;margin:20px 0 0"><a href="${APP_URL}/g/${groupId}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;padding:14px 28px;border-radius:12px;text-decoration:none">${t.promotedCta}</a></p>`
      : '',
  ].filter(Boolean).join('\n')
}

// MEMBER_JOINED has no session payload: simple "X joined <group>" card with a
// link to the group's members page instead of the generic session body.
function memberJoinedBody(p: Record<string, unknown>, lang: Lang, groupId: unknown, group?: string): string {
  const t = T[lang]
  return [
    `<h2 style="color:#1f2937;font-size:18px;margin:0 0 12px">🎭 ${t.memberJoined}</h2>`,
    `<p style="color:#4b5563;font-size:15px;margin:0 0 8px"><strong>${p.member_name ?? ''}</strong> ${t.memberJoinedBody}${group ? ` "${group}"` : ''}.</p>`,
    groupId
      ? `<p style="text-align:center;margin:20px 0 0"><a href="${APP_URL}/g/${groupId}/members" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;padding:14px 28px;border-radius:12px;text-decoration:none">${t.memberCta}</a></p>`
      : '',
  ].filter(Boolean).join('\n')
}

function fmtDate(iso: unknown, lang: Lang = 'es'): string {
  if (!iso) return ''
  const en = lang === 'en'
  // en-US conventions (month-day order, 12-hour clock) vs Spanish 24-hour.
  return new Date(String(iso)).toLocaleString(en ? 'en-US' : 'es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: en ? 'numeric' : '2-digit', minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

// Brand wrapper shared by every outgoing email: logo + app name header, white
// card with the content, and a small ignore-if-unexpected footer. Single
// column, inline styles only → renders well on mobile clients.
function layout(inner: string, lang: Lang): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:440px;margin:0 auto;padding:24px 16px">
    <div style="text-align:center;padding:8px 0 16px">
      <img src="${APP_URL}/icons/icon-192.png" width="56" height="56" alt="Ensayadero" style="border-radius:14px">
      <h1 style="color:#5b21b6;font-size:20px;margin:8px 0 0">Ensayadero</h1>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      ${inner}
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;line-height:1.5;margin:16px 8px">${T[lang].footer}</p>
  </div>
</body>
</html>`
}

function emailBody(type: string, p: Record<string, unknown>, lang: Lang, group?: string): string {
  const t = T[lang]
  const when = fmtDate(p.starts_at, lang)
  const lines = [
    `<h2 style="color:#1f2937;font-size:18px;margin:0 0 12px">${SUBJECTS[type]?.(p, lang, group) ?? type}</h2>`,
    `<p style="color:#4b5563;font-size:15px;margin:0 0 8px"><strong>${t.when}:</strong> ${when}</p>`,
    p.location
      ? `<p style="color:#4b5563;font-size:15px;margin:0 0 8px"><strong>${t.where}:</strong> ${p.location}</p>`
      : '',
    type === 'SESSION_CHANGED' && p.old_starts_at
      ? `<p style="color:#6b7280;font-size:14px;margin:0 0 8px">${t.prevTime}: <s>${fmtDate(p.old_starts_at, lang)}</s></p>`
      : '',
    type === 'SESSION_CHANGED' && p.old_location
      ? `<p style="color:#6b7280;font-size:14px;margin:0 0 8px">${t.prevPlace}: <s>${p.old_location}</s></p>`
      : '',
    p.required === false ? `<p style="color:#4b5563;font-size:15px;margin:0 0 8px">${t.optional}</p>` : '',
    type !== 'SESSION_CANCELLED' && p.session_id
      ? `<p style="text-align:center;margin:20px 0 0"><a href="${APP_URL}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;padding:14px 28px;border-radius:12px;text-decoration:none">${t.cta}</a></p>`
      : '',
  ]
  return lines.filter(Boolean).join('\n')
}

function fmtTime(iso: unknown, lang: Lang = 'es'): string {
  if (!iso) return ''
  const en = lang === 'en'
  return new Date(String(iso)).toLocaleTimeString(en ? 'en-US' : 'es-ES', {
    hour: en ? 'numeric' : '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  })
}

// Full rehearsal card for REMINDER emails: group avatar + name, session details
// and the list of summoned participants. Falls back to the generic body when
// the session no longer exists.
async function reminderBody(p: Record<string, unknown>, lang: Lang): Promise<string | null> {
  const { data: s } = await supabase
    .from('sessions')
    .select('comments, location, group_id, groups(name, avatar_seed), session_participants(required, profiles(name))')
    .eq('id', p.session_id)
    .single()
  if (!s) return null
  const t = T[lang]
  const group = s.groups as unknown as { name: string; avatar_seed: string | null }
  // Same DiceBear style/version as the GroupAvatar component, via their image API.
  const avatar = `https://api.dicebear.com/9.x/shapes/png?seed=${encodeURIComponent(group?.avatar_seed || String(s.group_id))}&size=96&radius=20`
  const when = `${fmtDate(p.starts_at, lang)}${p.ends_at ? ` – ${fmtTime(p.ends_at, lang)}` : ''}`
  const participants = (s.session_participants as unknown as {
    required: boolean
    profiles: { name: string } | null
  }[])
    .filter((sp) => sp.profiles?.name)
    .sort((a, b) => Number(b.required) - Number(a.required))
  const chips = participants
    .map(
      (sp) =>
        `<span style="display:inline-block;background:#f5f3ff;color:#5b21b6;font-size:13px;padding:4px 10px;border-radius:999px;margin:0 4px 6px 0">${sp.profiles!.name}${sp.required ? '' : ` · ${t.optionalTag}`}</span>`,
    )
    .join('')
  return [
    `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 16px"><tr>
       <td width="48" style="vertical-align:middle"><img src="${avatar}" width="48" height="48" alt="" style="border-radius:11px;display:block"></td>
       <td style="vertical-align:middle;padding-left:12px">
         <p style="color:#7c3aed;font-size:13px;font-weight:600;margin:0">${t.reminder}</p>
         <h2 style="color:#1f2937;font-size:18px;margin:2px 0 0">${group?.name ?? ''}</h2>
       </td>
     </tr></table>`,
    `<p style="color:#4b5563;font-size:15px;margin:0 0 8px"><strong>${t.when}:</strong> ${when}</p>`,
    s.location
      ? `<p style="color:#4b5563;font-size:15px;margin:0 0 8px"><strong>${t.where}:</strong> ${s.location}</p>`
      : '',
    s.comments
      ? `<p style="color:#4b5563;font-size:15px;margin:0 0 8px"><strong>${t.comments}:</strong> ${s.comments}</p>`
      : '',
    participants.length
      ? `<p style="color:#4b5563;font-size:15px;margin:12px 0 6px"><strong>${t.attendees}</strong> (${participants.length}):</p><p style="margin:0;line-height:1.8">${chips}</p>`
      : '',
    `<p style="text-align:center;margin:20px 0 0"><a href="${APP_URL}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;padding:14px 28px;border-radius:12px;text-decoration:none">${t.cta}</a></p>`,
  ]
    .filter(Boolean)
    .join('\n')
}

// Per-run cache of user language (auth admin lookup per user).
const langCache = new Map<string, Lang>()
async function userLang(userId: string): Promise<Lang> {
  const cached = langCache.get(userId)
  if (cached) return cached
  const { data } = await supabase.auth.admin.getUserById(userId)
  const lang: Lang = data?.user?.user_metadata?.lang === 'en' ? 'en' : 'es'
  langCache.set(userId, lang)
  return lang
}

/** Like sendEmail but keeps the failure reason (stored with invitations). */
async function sendEmailDetailed(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (MAILPIT_URL) {
    const m = EMAIL_FROM.match(/^(.*?)\s*<(.+)>$/)
    const res = await fetch(`${MAILPIT_URL}/api/v1/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: { Name: m?.[1] ?? '', Email: m?.[2] ?? EMAIL_FROM },
        To: [{ Email: to }],
        Subject: subject,
        HTML: html,
      }),
    })
    return { ok: res.ok, error: res.ok ? null : `mailpit HTTP ${res.status}` }
  }
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY is not set' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  })
  return {
    ok: res.ok,
    error: res.ok ? null : `Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  return (await sendEmailDetailed(to, subject, html)).ok
}

// Deep-link a push to the relevant page (mirrors the in-app click routing):
// session events → the rehearsal detail; member events → the group.
function notificationUrl(
  type: string,
  payload: Record<string, unknown>,
  groupId: string | null,
): string {
  let path = '/'
  if (groupId && payload.session_id) path = `/g/${groupId}/sessions/${payload.session_id}`
  else if (groupId && type === 'MEMBER_JOINED') path = `/g/${groupId}/members`
  else if (groupId && type === 'MEMBER_PROMOTED') path = `/g/${groupId}`
  return (APP_URL || '') + path
}

async function sendPush(
  userId: string,
  title: string,
  body: string,
  url: string,
): Promise<boolean> {
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
        JSON.stringify({ title, body, url }),
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

async function processInvitation(invitationId: string): Promise<boolean> {
  const { data: inv } = await supabase
    .from('invitations')
    .select('email, groups(name)')
    .eq('id', invitationId)
    .single()
  if (!inv) return false
  const groupName = (inv.groups as unknown as { name: string })?.name ?? 'un grupo'
  // Invitee has no account yet, so no stored language: Spanish by default.
  let result: { ok: boolean; error: string | null }
  try {
    result = await sendEmailDetailed(
      inv.email,
      `🎭 Invitación a "${groupName}" en Ensayadero`,
      layout(
        `<h2 style="color:#1f2937;font-size:18px;margin:0 0 12px">Te han invitado a "${groupName}"</h2>
         <p style="color:#4b5563;font-size:15px;margin:0 0 8px">Entra con tu cuenta usando este mismo email (${inv.email}):</p>
         <p style="text-align:center;margin:20px 0 0"><a href="${APP_URL}/login" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;padding:14px 28px;border-radius:12px;text-decoration:none">Aceptar invitación</a></p>
         <p style="color:#9ca3af;font-size:13px;margin:16px 0 0;text-align:center">La invitación caduca en 7 días.</p>`,
        'es',
      ),
    )
  } catch (e) {
    result = { ok: false, error: String(e).slice(0, 300) }
  }
  // record the attempt so the DB shows delivery state per invitation
  await supabase
    .from('invitations')
    .update(
      result.ok
        ? { email_sent_at: new Date().toISOString(), email_send_error: null }
        : { email_send_error: result.error ?? 'unknown error' },
    )
    .eq('id', invitationId)
  return result.ok
}

// The function is invoked from the browser (supabase.functions.invoke) after
// session changes and for invitations, so it must answer the CORS preflight;
// auth is still enforced by the platform's JWT check. The cron path (pg_net)
// is server-side and ignores CORS.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  // delivery of a specific invitation
  try {
    const body = await req.json().catch(() => ({}))
    if (body.invitation_id) {
      const ok = await processInvitation(body.invitation_id)
      // non-2xx → functions.invoke reports an error → the resend UI shows it
      return Response.json(
        { ok, invitation: true },
        { status: ok ? 200 : 502, headers: CORS_HEADERS },
      )
    }
  } catch { /* no body → process queue */ }

  // process the pending notifications queue
  langCache.clear() // metadata may change between runs
  const { data: pending, error } = await supabase
    .from('notifications')
    .select('id, user_id, group_id, type, payload, sent_email_at, sent_push_at, profiles!inner(email, name), groups(name)')
    .or('sent_email_at.is.null,sent_push_at.is.null')
    .limit(50)

  if (error) return new Response(error.message, { status: 500, headers: CORS_HEADERS })

  let emails = 0
  let pushes = 0
  for (const n of pending ?? []) {
    const payload = n.payload as Record<string, unknown>
    const lang = await userLang(n.user_id)
    const groupName = (n.groups as unknown as { name: string } | null)?.name
    const subject = SUBJECTS[n.type]?.(payload, lang, groupName) ?? n.type
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
        const inner =
          n.type === 'MEMBER_JOINED'
            ? memberJoinedBody(payload, lang, n.group_id, groupName)
            : n.type === 'MEMBER_PROMOTED'
              ? promotedBody(payload, lang, n.group_id, groupName)
              : ((n.type === 'REMINDER' ? await reminderBody(payload, lang) : null) ??
                emailBody(n.type, payload, lang, groupName))
        if (await sendEmail(profile.email, subject, layout(inner, lang))) emails++
      }
      updates.sent_email_at = new Date().toISOString() // also mark even if the channel excludes it
    }
    if (!n.sent_push_at) {
      if (channel === 'PUSH' || channel === 'BOTH') {
        const pushBody =
          n.type === 'MEMBER_JOINED'
            ? String(payload.member_name ?? '')
            : n.type === 'MEMBER_PROMOTED'
              ? (groupName ?? '')
              : fmtDate(payload.starts_at, lang)
        const url = notificationUrl(n.type, payload, n.group_id)
        if (await sendPush(n.user_id, subject, pushBody, url)) pushes++
      }
      updates.sent_push_at = new Date().toISOString()
    }
    await supabase.from('notifications').update(updates).eq('id', n.id)
  }

  return Response.json({ processed: pending?.length ?? 0, emails, pushes }, { headers: CORS_HEADERS })
})
