// Calendar import parser (supabase/functions/_shared/calendarFeed.ts): feeds
// shaped like Google's and Outlook's, recurrences with exceptions, the
// per-calendar rules and the link guard.
import { describe, expect, it } from 'vitest'
import { busyFromFeed, checkFeedUrl, zonedToUtc } from '../../../supabase/functions/_shared/calendarFeed'

const cal = (body: string, head = '') =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', head, body, 'END:VCALENDAR']
    .filter(Boolean)
    .join('\r\n')

const MADRID_TZ = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Madrid',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n')

const event = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')

const window = { from: new Date('2030-10-01T00:00:00Z'), to: new Date('2030-12-31T00:00:00Z') }
const opts = { ...window, includeAllDay: false, includeFree: false }

describe('busyFromFeed', () => {
  it('reads a zoned event (Google style, VTIMEZONE in the file)', () => {
    const out = busyFromFeed(
      cal(
        event(['UID:a@google.com', 'SUMMARY:Dentista', 'DTSTART;TZID=Europe/Madrid:20301007T190000', 'DTEND;TZID=Europe/Madrid:20301007T210000']),
        MADRID_TZ,
      ),
      opts,
    )
    expect(out).toEqual([
      {
        uid: 'a@google.com',
        starts_at: '2030-10-07T17:00:00.000Z', // CEST, UTC+2
        ends_at: '2030-10-07T19:00:00.000Z',
        summary: 'Dentista',
        all_day: false,
        recurring: false,
      },
    ])
  })

  it('applies the winter offset after the DST change', () => {
    const [e] = busyFromFeed(
      cal(event(['UID:b', 'DTSTART;TZID=Europe/Madrid:20301104T190000', 'DTEND;TZID=Europe/Madrid:20301104T200000']), MADRID_TZ),
      opts,
    )
    expect(e.starts_at).toBe('2030-11-04T18:00:00.000Z') // CET, UTC+1
  })

  it('reads an Outlook zone defined in the file under its Windows name', () => {
    const outlookTz = MADRID_TZ.replace('TZID:Europe/Madrid', 'TZID:Romance Standard Time')
    const [e] = busyFromFeed(
      cal(event(['UID:c@outlook', 'DTSTART;TZID=Romance Standard Time:20301008T100000', 'DTEND;TZID=Romance Standard Time:20301008T110000']), outlookTz),
      opts,
    )
    expect(e.starts_at).toBe('2030-10-08T08:00:00.000Z')
  })

  it('resolves a zone the feed names but does not define', () => {
    const [e] = busyFromFeed(
      cal(event(['UID:d', 'DTSTART;TZID=Europe/Madrid:20301009T100000', 'DTEND;TZID=Europe/Madrid:20301009T113000'])),
      opts,
    )
    expect([e.starts_at, e.ends_at]).toEqual(['2030-10-09T08:00:00.000Z', '2030-10-09T09:30:00.000Z'])
  })

  it('reads UTC and floating times (floating in the calendar zone)', () => {
    const out = busyFromFeed(
      cal(
        [
          event(['UID:utc', 'DTSTART:20301010T120000Z', 'DTEND:20301010T130000Z']),
          event(['UID:float', 'DTSTART:20301010T120000', 'DTEND:20301010T130000']),
        ].join('\r\n'),
        'X-WR-TIMEZONE:Europe/Madrid',
      ),
      opts,
    )
    const byUid = Object.fromEntries(out.map((e) => [e.uid, e.starts_at]))
    expect(byUid).toEqual({ utc: '2030-10-10T12:00:00.000Z', float: '2030-10-10T10:00:00.000Z' })
  })

  it('expands a weekly series with an EXDATE, a moved and a cancelled occurrence', () => {
    const out = busyFromFeed(
      cal(
        [
          event([
            'UID:gym',
            'SUMMARY:Gimnasio',
            'DTSTART;TZID=Europe/Madrid:20301007T180000',
            'DTEND;TZID=Europe/Madrid:20301007T190000',
            'RRULE:FREQ=WEEKLY;COUNT=5',
            'EXDATE;TZID=Europe/Madrid:20301014T180000',
          ]),
          // 3rd one moved an hour later
          event([
            'UID:gym',
            'RECURRENCE-ID;TZID=Europe/Madrid:20301021T180000',
            'SUMMARY:Gimnasio (tarde)',
            'DTSTART;TZID=Europe/Madrid:20301021T190000',
            'DTEND;TZID=Europe/Madrid:20301021T200000',
          ]),
          // 4th one cancelled
          event(['UID:gym', 'RECURRENCE-ID;TZID=Europe/Madrid:20301028T180000', 'STATUS:CANCELLED', 'DTSTART;TZID=Europe/Madrid:20301028T180000', 'DTEND;TZID=Europe/Madrid:20301028T190000']),
        ].join('\r\n'),
        MADRID_TZ,
      ),
      opts,
    )
    expect(out.map((e) => [e.starts_at, e.summary])).toEqual([
      ['2030-10-07T16:00:00.000Z', 'Gimnasio'],
      ['2030-10-21T17:00:00.000Z', 'Gimnasio (tarde)'],
      ['2030-11-04T17:00:00.000Z', 'Gimnasio'], // after DST: 18:00 CET = 17:00Z
    ])
    expect(out.every((e) => e.uid === 'gym' && e.recurring)).toBe(true)
  })

  it('reaches the window for a long-running series started years ago', () => {
    const out = busyFromFeed(
      cal(event(['UID:weekly-since-2015', 'DTSTART:20150105T170000Z', 'DTEND:20150105T180000Z', 'RRULE:FREQ=WEEKLY']), MADRID_TZ),
      { ...opts, to: new Date('2030-10-15T00:00:00Z') },
    )
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((e) => e.starts_at >= '2030-09-30')).toBe(true)
  })

  it('keeps only what overlaps the window', () => {
    const out = busyFromFeed(
      cal(
        [
          event(['UID:before', 'DTSTART:20300901T100000Z', 'DTEND:20300901T110000Z']),
          event(['UID:inside', 'DTSTART:20301101T100000Z', 'DTEND:20301101T110000Z']),
          event(['UID:after', 'DTSTART:20310301T100000Z', 'DTEND:20310301T110000Z']),
        ].join('\r\n'),
      ),
      opts,
    )
    expect(out.map((e) => e.uid)).toEqual(['inside'])
  })

  it('skips all-day events unless asked, as whole local days', () => {
    const feed = cal(event(['UID:holiday', 'SUMMARY:Vacaciones', 'DTSTART;VALUE=DATE:20301012', 'DTEND;VALUE=DATE:20301013']), 'X-WR-TIMEZONE:Europe/Madrid')
    expect(busyFromFeed(feed, opts)).toEqual([])
    const [e] = busyFromFeed(feed, { ...opts, includeAllDay: true })
    expect([e.starts_at, e.ends_at, e.all_day]).toEqual(['2030-10-11T22:00:00.000Z', '2030-10-12T22:00:00.000Z', true])
  })

  it('skips events marked free unless asked, and cancelled ones always', () => {
    const feed = cal(
      [
        event(['UID:free', 'TRANSP:TRANSPARENT', 'DTSTART:20301015T100000Z', 'DTEND:20301015T110000Z']),
        event(['UID:gone', 'STATUS:CANCELLED', 'DTSTART:20301015T120000Z', 'DTEND:20301015T130000Z']),
      ].join('\r\n'),
    )
    expect(busyFromFeed(feed, opts)).toEqual([])
    expect(busyFromFeed(feed, { ...opts, includeFree: true }).map((e) => e.uid)).toEqual(['free'])
  })

  it("skips the rehearsals the user exported from Ensayadero", () => {
    const feed = cal(event(['UID:3800b734-9636@ensayadero', 'DTSTART:20301016T100000Z', 'DTEND:20301016T110000Z']))
    expect(busyFromFeed(feed, opts)).toEqual([])
  })

  it('rejects something that is not a calendar', () => {
    expect(() => busyFromFeed('<html>login</html>', opts)).toThrow('NOT_ICAL')
  })
})

describe('zonedToUtc', () => {
  it('converts across both DST changes', () => {
    expect(zonedToUtc(2030, 7, 1, 12, 0, 0, 'Europe/Madrid').toISOString()).toBe('2030-07-01T10:00:00.000Z')
    expect(zonedToUtc(2030, 1, 15, 12, 0, 0, 'Europe/Madrid').toISOString()).toBe('2030-01-15T11:00:00.000Z')
  })
})

describe('checkFeedUrl', () => {
  it('turns webcal links into https', () => {
    expect(checkFeedUrl(' webcal://p01-caldav.icloud.com/published/2/abc ')).toBe('https://p01-caldav.icloud.com/published/2/abc')
  })

  it('rejects other schemes, plain http and private hosts', () => {
    for (const bad of [
      'ftp://example.com/a.ics',
      'http://calendar.example.com/a.ics',
      'https://localhost/a.ics',
      'https://127.0.0.1/a.ics',
      'https://10.0.0.5/a.ics',
      'https://192.168.1.10/a.ics',
      'https://169.254.169.254/latest',
      'https://[::1]/a.ics',
      'https://db.internal/a.ics',
      'not a url',
    ]) {
      expect(() => checkFeedUrl(bad), bad).toThrow('BAD_URL')
    }
  })

  it('allows plain http only when enabled (local development)', () => {
    expect(checkFeedUrl('http://fixtures/feed.ics', true)).toBe('http://fixtures/feed.ics')
  })
})
