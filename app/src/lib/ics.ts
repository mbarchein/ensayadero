// Build and download an .ics calendar event for a rehearsal, so users can add
// it to their phone/desktop calendar with one tap.

import type { TimeRange } from './ranges'

const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export function downloadIcs(opts: {
  uid: string
  range: TimeRange
  summary: string
  location?: string | null
  description?: string | null
  url?: string
}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ensayadero//EN',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@ensayadero`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.range.start)}`,
    `DTEND:${icsDate(opts.range.end)}`,
    `SUMMARY:${escapeText(opts.summary)}`,
    opts.location ? `LOCATION:${escapeText(opts.location)}` : null,
    opts.description || opts.url
      ? `DESCRIPTION:${escapeText([opts.description, opts.url].filter(Boolean).join('\n'))}`
      : null,
    opts.url ? `URL:${opts.url}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'ensayo.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
