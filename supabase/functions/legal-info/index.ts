// Edge Function: returns the legal/contact data ONLY after a valid Cloudflare
// Turnstile check. Keeps the data out of the static bundle so HTML/JS scrapers
// (and email harvesters) can't read it; only a human that solves the captcha can.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  let token = ''
  try {
    token = ((await req.json()) as { token?: string }).token ?? ''
  } catch {
    /* no body */
  }

  // Verify the Turnstile token server-side. If no secret is configured the gate
  // is effectively disabled (returns the data) — same posture as the rest of the app.
  if (secret) {
    const form = new FormData()
    form.append('secret', secret)
    form.append('response', token)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const out = (await res.json()) as { success?: boolean }
    if (!out.success) return json({ error: 'captcha' }, 403)
  }

  return json({
    entity: Deno.env.get('LEGAL_ENTITY') ?? '',
    taxId: Deno.env.get('LEGAL_TAX_ID') ?? '',
    address: Deno.env.get('LEGAL_ADDRESS') ?? '',
    privacyEmail: Deno.env.get('PRIVACY_EMAIL') ?? '',
    contactEmail: Deno.env.get('CONTACT_EMAIL') ?? '',
  })
})
