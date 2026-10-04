// Calendar import: turns an iCal feed into busy blocks for the coming weeks
// (used by the sync-calendars Edge Function). Pure TypeScript with no Deno or
// DOM APIs, so the app's vitest suite covers it (app/src/lib/calendarFeed.test.ts).

import ICAL from 'ical.js'

export interface BusyEvent {
  uid: string
  starts_at: string // ISO, UTC
  ends_at: string
  summary: string | null
  all_day: boolean
  recurring: boolean
}

export interface FeedOptions {
  from: Date
  to: Date
  includeAllDay: boolean
  includeFree: boolean
  /** zone for floating times and all-day events when the feed names none */
  defaultTz?: string
}

// Rehearsals exported from Ensayadero (app/src/lib/ics.ts) end their UID with
// this; importing them back would count each rehearsal twice.
const OWN_UID = /@ensayadero$/i
// guards against huge or endless feeds
const MAX_STEPS_PER_EVENT = 5000
const MAX_EVENTS = 3000

// Outlook may name Windows zones without defining them in the file
const WINDOWS_ZONES: Record<string, string> = {
  'Romance Standard Time': 'Europe/Paris',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  UTC: 'UTC',
}

export class FeedError extends Error {}

/** Parses the feed and returns its busy blocks overlapping [from, to). */
export function busyFromFeed(text: string, opts: FeedOptions): BusyEvent[] {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(text))
  } catch {
    throw new FeedError('NOT_ICAL')
  }
  if (root.name !== 'vcalendar') throw new FeedError('NOT_ICAL')

  const calTz = validZone(String(root.getFirstPropertyValue('x-wr-timezone') ?? ''))
  const defaultTz = calTz ?? validZone(opts.defaultTz ?? '') ?? 'Europe/Madrid'

  // masters and their moved/cancelled occurrences (RECURRENCE-ID), by UID
  const masters = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(vevent)
    if (!ev.uid) continue
    if (ev.isRecurrenceException()) exceptions.push(ev)
    else masters.set(ev.uid, ev)
  }
  const orphans: ICAL.Event[] = []
  for (const ex of exceptions) {
    const master = masters.get(ex.uid)
    if (master) master.relateException(ex)
    else orphans.push(ex) // occurrence without its series: a plain event
  }

  const out: BusyEvent[] = []
  const push = (master: ICAL.Event, item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (!counts(item, opts)) return
    const allDay = start.isDate
    if (allDay && !opts.includeAllDay) return
    const s = toUtc(start, tzidOf(item, 'dtstart'), defaultTz)
    const e = toUtc(end, tzidOf(item, 'dtend') ?? tzidOf(item, 'dtstart'), defaultTz)
    if (e <= s || e <= opts.from || s >= opts.to) return
    out.push({
      uid: master.uid,
      starts_at: s.toISOString(),
      ends_at: e.toISOString(),
      summary: item.summary || master.summary || null,
      all_day: allDay,
      recurring: master.isRecurring(),
    })
  }

  for (const master of [...masters.values(), ...orphans]) {
    if (out.length >= MAX_EVENTS) break
    if (OWN_UID.test(master.uid)) continue
    if (!master.isRecurring()) {
      push(master, master, master.startDate, master.endDate)
      continue
    }
    const it = master.iterator()
    let next: ICAL.Time | null
    for (let step = 0; step < MAX_STEPS_PER_EVENT && (next = it.next()); step++) {
      const occ = master.getOccurrenceDetails(next)
      // occurrences come in order of their original start: stop past the window
      if (toUtc(next, tzidOf(master, 'dtstart'), defaultTz) >= opts.to && occ.item === master) break
      push(master, occ.item, occ.startDate, occ.endDate)
      if (out.length >= MAX_EVENTS) break
    }
  }
  return out
}

/** Whether an event makes its owner busy under the source's rules. */
function counts(ev: ICAL.Event, opts: FeedOptions): boolean {
  const status = String(ev.component.getFirstPropertyValue('status') ?? '').toUpperCase()
  if (status === 'CANCELLED') return false
  const transp = String(ev.component.getFirstPropertyValue('transp') ?? '').toUpperCase()
  if (transp === 'TRANSPARENT' && !opts.includeFree) return false
  return true
}

function tzidOf(ev: ICAL.Event, prop: 'dtstart' | 'dtend'): string | null {
  const p = ev.component.getFirstProperty(prop)
  const tzid = p?.getParameter('tzid')
  return typeof tzid === 'string' ? tzid : null
}

/** A time from the feed as a real instant. Zones defined in the file (and
 *  UTC) are resolved by ical.js; anything else is read as wall-clock time in
 *  the named zone, or in the calendar's default zone. */
function toUtc(t: ICAL.Time, tzid: string | null, defaultTz: string): Date {
  if (!t.isDate && t.zone && t.zone.tzid !== 'floating') return t.toJSDate()
  const zone = (tzid && (validZone(tzid) ?? validZone(WINDOWS_ZONES[tzid] ?? ''))) || defaultTz
  return zonedToUtc(t.year, t.month, t.day, t.isDate ? 0 : t.hour, t.isDate ? 0 : t.minute, t.isDate ? 0 : t.second, zone)
}

function validZone(tz: string): string | null {
  if (!tz) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return null
  }
}

/** Wall-clock time in an IANA zone → UTC instant (DST-aware via Intl). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let utc = guess - offsetMs(tz, guess)
  // second pass settles the instants right around a DST change
  utc = guess - offsetMs(tz, utc)
  return new Date(utc)
}

function offsetMs(tz: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** Normalizes a feed link and rejects what the server must not fetch:
 *  non-web schemes, and hosts on the local machine or a private network. */
export function checkFeedUrl(raw: string, allowHttp = false): string {
  const url = raw.trim().replace(/^webcal:\/\//i, 'https://')
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new FeedError('BAD_URL')
  }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) throw new FeedError('BAD_URL')
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIp(host)
  ) {
    throw new FeedError('BAD_URL')
  }
  return u.toString()
}

function isPrivateIp(host: string): boolean {
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  if (host.includes(':')) {
    return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')
  }
  return false
}
