// Calendar import pieces of "My agenda": the imported-event sheet (ignore it),
// the clash warning against rehearsals I'm going to, and the "fill in
// availability" sheet.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { AlertTriangle, CircleCheck, RefreshCw } from 'lucide-react'
import { dateLocale } from '../../lib/dateLocale'
import { parseRange } from '../../lib/ranges'
import { DAY_START_HOUR, SLOT_MINUTES, SLOTS_PER_DAY } from '../../lib/slots'
import { Button, Modal } from '../../components/ui'
import type { MyParticipation } from '../agenda/useMyAgenda'
import type { CalendarSource, ExternalBusy } from './useCalendars'

const when = (b: ExternalBusy) =>
  b.all_day
    ? format(b.start, 'EEE d MMM', { locale: dateLocale() })
    : `${format(b.start, 'EEE d MMM · HH:mm', { locale: dateLocale() })}–${format(b.end, 'HH:mm')}`

/** Tapped an imported event in the agenda: what it is, mark it as free, or
 *  re-download its calendar. */
export function CalendarEventModal({
  events,
  sources,
  onClose,
  onIgnore,
  pending,
  onResync,
  resyncing,
}: {
  events: ExternalBusy[] | null
  sources: CalendarSource[]
  onClose: () => void
  onIgnore: (ev: ExternalBusy, series: boolean) => void
  pending: boolean
  onResync: () => void
  resyncing: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const names = [...new Set((events ?? []).map((ev) => ev.source_id))]
    .map((id) => sources.find((s) => s.id === id)?.name)
    .filter(Boolean)
    .join(', ')
  return (
    <Modal open={!!events} onClose={onClose} title={t('calendars.agenda.eventTitle', { name: names })}>
      <div className="space-y-4">
        {(events ?? []).map((ev) => (
          <div key={ev.id} className="space-y-2 rounded-lg border p-3">
            <p className="font-semibold">{ev.summary || t('calendars.untitled')}</p>
            <p className="text-sm text-gray-600">{when(ev)}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="secondary"
                className="inline-flex items-center gap-1.5 !px-3 !py-1.5"
                disabled={pending}
                onClick={() => onIgnore(ev, false)}
              >
                <CircleCheck size={15} /> {t('calendars.agenda.ignoreOne')}
              </Button>
              {ev.recurring && (
                <Button
                  variant="secondary"
                  className="inline-flex items-center gap-1.5 !px-3 !py-1.5"
                  disabled={pending}
                  onClick={() => onIgnore(ev, true)}
                >
                  <CircleCheck size={15} /> {t('calendars.agenda.ignoreSeries')}
                </Button>
              )}
            </div>
          </div>
        ))}
        <p className="text-xs text-gray-600">{t('calendars.agenda.ignoreBody')}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="inline-flex flex-1 items-center justify-center gap-1.5"
            disabled={resyncing}
            onClick={onResync}
          >
            <RefreshCw size={15} className={resyncing ? 'animate-spin' : ''} /> {t('calendars.agenda.resync')}
          </Button>
          <Button variant="ghost" className="flex-1 text-violet-700" onClick={() => navigate('/calendars')}>
            {t('calendars.agenda.manage')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Rehearsals I said I'd go to that overlap something in my calendars. */
export function ConflictsBanner({
  conflicts,
  onOpen,
}: {
  conflicts: { p: MyParticipation; events: ExternalBusy[] }[]
  onOpen: (p: MyParticipation) => void
}) {
  const { t } = useTranslation()
  if (conflicts.length === 0) return null
  const shown = conflicts.slice(0, 3)
  return (
    <div className="shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="mb-1 flex items-center gap-1 font-semibold">
        <AlertTriangle size={14} aria-hidden /> {t('calendars.agenda.conflictsTitle')}
      </p>
      <ul className="space-y-0.5">
        {shown.map(({ p, events }) => (
          <li key={p.session_id}>
            <button type="button" onClick={() => onOpen(p)} className="text-left underline-offset-2 hover:underline">
              {p.sessions.groups.name} ·{' '}
              {format(parseRange(p.sessions.time_range).start, 'EEE d · HH:mm', { locale: dateLocale() })} —{' '}
              <span className="font-medium">{events.map((e) => e.summary || t('calendars.untitled')).join(', ')}</span>
            </button>
          </li>
        ))}
      </ul>
      {conflicts.length > shown.length && (
        <p className="mt-0.5">{t('calendars.agenda.conflictsMore', { count: conflicts.length - shown.length })}</p>
      )}
    </div>
  )
}

export interface AutofillOptions {
  days: number[] // 0 = Monday
  fromSlot: number
  toSlot: number // exclusive
  weeks: number
  skipBusy: boolean
}

const slotTime = (i: number) => {
  const mins = DAY_START_HOUR * 60 + i * SLOT_MINUTES
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/** "My usual hours minus what's busy": the days/hours to mark available. */
export function AutofillModal({
  open,
  onClose,
  onApply,
  pending,
  hasCalendars,
}: {
  open: boolean
  onClose: () => void
  onApply: (o: AutofillOptions) => void
  pending: boolean
  hasCalendars: boolean
}) {
  const { t } = useTranslation()
  const letters = (dateLocale().code ?? 'en').startsWith('es')
    ? ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4])
  const [fromSlot, setFromSlot] = useState(Math.min(18 - DAY_START_HOUR, SLOTS_PER_DAY) * (60 / SLOT_MINUTES))
  const [toSlot, setToSlot] = useState(SLOTS_PER_DAY)
  const [weeks, setWeeks] = useState(1)
  const [skipBusy, setSkipBusy] = useState(true)
  const valid = days.length > 0 && toSlot > fromSlot

  return (
    <Modal open={open} onClose={onClose} title={t('calendars.autofill.title')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          onApply({ days, fromSlot, toSlot, weeks, skipBusy: hasCalendars && skipBusy })
        }}
      >
        <p className="text-sm text-gray-600">{t('calendars.autofill.body')}</p>
        <div>
          <p className="mb-1 text-sm">{t('calendars.autofill.days')}</p>
          <div className="flex gap-1">
            {letters.map((l, d) => {
              const on = days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d].sort()))}
                  className={`h-9 flex-1 rounded-lg text-sm font-semibold ${on ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {l}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-sm">
            {t('calendars.autofill.from')}
            <select
              value={fromSlot}
              onChange={(e) => setFromSlot(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
            >
              {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
                <option key={i} value={i}>
                  {slotTime(i)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-sm">
            {t('calendars.autofill.to')}
            <select
              value={toSlot}
              onChange={(e) => setToSlot(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
            >
              {Array.from({ length: SLOTS_PER_DAY }, (_, i) => i + 1).map((i) => (
                <option key={i} value={i} disabled={i <= fromSlot}>
                  {slotTime(i)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          {t('calendars.autofill.weeks')}
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? t('calendars.autofill.weeksThis') : t('calendars.autofill.weeksMore', { count: n - 1 })}
              </option>
            ))}
          </select>
        </label>
        {hasCalendars && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={skipBusy} onChange={(e) => setSkipBusy(e.target.checked)} />
            {t('calendars.autofill.skipBusy')}
          </label>
        )}
        <Button type="submit" className="w-full" disabled={!valid || pending}>
          {pending ? t('calendars.autofill.applying') : t('calendars.autofill.apply')}
        </Button>
      </form>
    </Modal>
  )
}
