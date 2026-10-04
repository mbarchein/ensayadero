// Edge Function: refreshes the users' imported calendars (calendar_sources)
// into busy blocks (external_busy), see _shared/calendarFeed.ts.
// Invoked by:
//  - pg_cron every hour with the service-role key (BOOTSTRAP §11): every
//    calendar not synced in the last 50 minutes, oldest first.
//  - the app with the user's JWT: that user's calendars, or one of them with
//    { source_id } — right after adding it, or from "Sync now".

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { busyFromFeed, checkFeedUrl, FeedError } from '../_shared/calendarFeed.ts'

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY)
// local development serves test feeds over plain http inside docker
const ALLOW_HTTP = Deno.env.get('CALENDAR_ALLOW_HTTP') === '1'

const DAY = 86_400_000
const WINDOW_BACK = 1 * DAY // keep today's earlier events
const WINDOW_AHEAD = 12 * 7 * DAY
const STALE_MS = 50 * 60_000 // cron: re-sync after this long
const USER_COOLDOWN_MS = 30_000 // app: ignore repeated taps on "Sync now"
const CRON_BATCH = 25
const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 3

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Source {
  id: string
  url: string
  include_all_day: boolean
  include_free: boolean
  last_synced_at: string | null
}

/** Downloads a feed: every hop (redirects too) must pass the link guard. */
async function fetchFeed(url: string): Promise<string> {
  let next = checkFeedUrl(url, ALLOW_HTTP)
  for (let hop = 0; ; hop++) {
    const res = await fetch(next, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Ensayadero calendar sync', Accept: 'text/calendar, */*' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel()
      if (hop >= MAX_REDIRECTS) throw new FeedError('FETCH_FAILED')
      next = checkFeedUrl(new URL(res.headers.get('location')!, next).toString(), ALLOW_HTTP)
      continue
    }
    if (res.status === 404 || res.status === 410) throw new FeedError('NOT_FOUND')
    if (res.status === 401 || res.status === 403) throw new FeedError('FORBIDDEN')
    if (!res.ok || !res.body) throw new FeedError('FETCH_FAILED')
    return await readCapped(res.body)
  }
}

async function readCapped(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new FeedError('TOO_BIG')
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

async function syncOne(src: Source): Promise<{ id: string; ok: boolean; events?: number; error?: string }> {
  try {
    const text = await fetchFeed(src.url)
    const now = Date.now()
    const events = busyFromFeed(text, {
      from: new Date(now - WINDOW_BACK),
      to: new Date(now + WINDOW_AHEAD),
      includeAllDay: src.include_all_day,
      includeFree: src.include_free,
    })
    const { error } = await admin.rpc('replace_external_busy', { sid: src.id, events })
    if (error) throw error
    return { id: src.id, ok: true, events: events.length }
  } catch (e) {
    // keep the last good blocks: a feed that is briefly down shouldn't free
    // everyone's calendar. The app shows the error next to the calendar.
    const code =
      e instanceof FeedError
        ? e.message
        : e instanceof DOMException && e.name === 'TimeoutError'
          ? 'TIMEOUT'
          : 'FETCH_FAILED'
    if (!(e instanceof FeedError)) console.error('sync-calendars', src.id, e)
    await admin.from('calendar_sources').update({ last_error: code }).eq('id', src.id)
    return { id: src.id, ok: false, error: code }
  }
}

/** Runs the syncs a few at a time. */
async function syncAll(sources: Source[]) {
  const results: Awaited<ReturnType<typeof syncOne>>[] = []
  for (let i = 0; i < sources.length; i += 5) {
    results.push(...(await Promise.all(sources.slice(i, i + 5).map(syncOne))))
  }
  return results
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS_HEADERS })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const body = await req.json().catch(() => ({}))
  let query = admin
    .from('calendar_sources')
    .select('id, url, include_all_day, include_free, last_synced_at')

  if (token && token === SERVICE_KEY) {
    // cron: the stale ones, oldest first
    query = query
      .or(`last_synced_at.is.null,last_synced_at.lt.${new Date(Date.now() - STALE_MS).toISOString()}`)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(CRON_BATCH)
  } else {
    const { data } = await admin.auth.getUser(token)
    if (!data.user) return json({ error: 'UNAUTHORIZED' }, 401)
    query = query.eq('user_id', data.user.id)
    if (typeof body.source_id === 'string') query = query.eq('id', body.source_id)
  }

  const { data: sources, error } = await query
  if (error) return json({ error: error.message }, 500)

  // a single calendar (just added, or its rules changed) always syncs
  const now = Date.now()
  const due = (sources as Source[]).filter(
    (s) =>
      token === SERVICE_KEY ||
      typeof body.source_id === 'string' ||
      !s.last_synced_at ||
      now - Date.parse(s.last_synced_at) > USER_COOLDOWN_MS,
  )
  return json({ results: await syncAll(due) })
})
