// Calendar import: connect external calendars by their secret iCal link so
// their events count as busy (the group only ever sees "busy"). Lists the
// connected calendars with their sync state and rules, the add form with
// per-provider help, and the events the user chose to ignore.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertCircle, CalendarSync, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { dateLocale } from '../../lib/dateLocale'
import { BackButton, Button, Modal, Spinner, Toggle } from '../../components/ui'
import { useCalendars, type CalendarSource } from './useCalendars'

const MAX_CALENDARS = 5 // keep in sync with calendar_source_prepare()

export default function CalendarsPage() {
  const { t } = useTranslation()
  const cal = useCalendars()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<CalendarSource | null>(null)

  if (cal.sources.isLoading) return <Spinner />
  const sources = cal.sources.data ?? []
  const ignored = cal.ignores.data ?? []
  const nameOf = (id: string) => sources.find((s) => s.id === id)?.name ?? ''

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to="/profile" />
        <h1 className="text-xl font-bold">{t('calendars.title')}</h1>
      </header>

      <p className="text-sm text-gray-600">{t('calendars.intro')}</p>

      {sources.length === 0 && !adding && (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          {t('calendars.empty')}
        </p>
      )}

      <ul className="space-y-3">
        {sources.map((s) => (
          <SourceCard key={s.id} source={s} cal={cal} onRemove={() => setRemoving(s)} />
        ))}
      </ul>

      {adding ? (
        <AddForm cal={cal} onDone={() => setAdding(false)} />
      ) : sources.length < MAX_CALENDARS ? (
        <Button variant="secondary" className="inline-flex w-full items-center justify-center gap-1.5" onClick={() => setAdding(true)}>
          <Plus size={16} /> {sources.length === 0 ? t('calendars.addFirst') : t('calendars.addAnother')}
        </Button>
      ) : (
        <p className="text-center text-xs text-gray-500">{t('calendars.errors.TOO_MANY_CALENDARS')}</p>
      )}

      {ignored.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">{t('calendars.ignoredTitle')}</h2>
          <p className="text-xs text-gray-600">{t('calendars.ignoredHint')}</p>
          <ul className="divide-y rounded-xl border bg-white">
            {ignored.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.summary || t('calendars.untitled')}</p>
                  <p className="text-xs text-gray-500">
                    {nameOf(i.source_id)} ·{' '}
                    {i.occurrence
                      ? format(new Date(i.occurrence), 'EEE d MMM · HH:mm', { locale: dateLocale() })
                      : t('calendars.wholeSeries')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="shrink-0 !px-2 text-violet-700"
                  disabled={cal.unignore.isPending}
                  onClick={() => cal.unignore.mutate(i.id)}
                >
                  {t('calendars.restore')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('calendars.removeTitle', { name: removing?.name ?? '' })}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('calendars.removeBody')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={cal.remove.isPending}
              onClick={() => {
                if (removing) cal.remove.mutate(removing.id)
                setRemoving(null)
              }}
            >
              <Trash2 size={16} /> {t('calendars.remove')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function SourceCard({
  source: s,
  cal,
  onRemove,
}: {
  source: CalendarSource
  cal: ReturnType<typeof useCalendars>
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const syncing = cal.sync.isPending && (cal.sync.variables === s.id || cal.sync.variables === undefined)
  const count = (cal.busyRows.data ?? []).filter((b) => b.source_id === s.id).length
  return (
    <li className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold">
            <CalendarSync size={16} className="shrink-0 text-violet-600" aria-hidden />
            <span className="truncate">{s.name}</span>
          </p>
          <p className="truncate text-xs text-gray-500">{s.url_hint}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            className="!p-2"
            aria-label={t('calendars.syncNow')}
            title={t('calendars.syncNow')}
            disabled={syncing}
            onClick={() => cal.sync.mutate(s.id)}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          </Button>
          <Button
            variant="ghost"
            className="!p-2 text-red-600"
            aria-label={t('calendars.remove')}
            title={t('calendars.remove')}
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {s.last_error ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {t(`calendars.errors.${s.last_error}`, { defaultValue: t('calendars.errors.FETCH_FAILED') })}
        </p>
      ) : (
        <p className="text-xs text-gray-600">
          {syncing || !s.last_synced_at
            ? t('calendars.syncing')
            : t('calendars.synced', {
                when: formatDistanceToNow(new Date(s.last_synced_at), { addSuffix: true, locale: dateLocale() }),
                count,
              })}
        </p>
      )}

      <div className="space-y-2 border-t pt-3">
        <RuleRow
          label={t('calendars.includeAllDay')}
          hint={t('calendars.includeAllDayHint')}
          checked={s.include_all_day}
          onChange={(v) => cal.update.mutate({ id: s.id, include_all_day: v })}
        />
        <RuleRow
          label={t('calendars.includeFree')}
          hint={t('calendars.includeFreeHint')}
          checked={s.include_free}
          onChange={(v) => cal.update.mutate({ id: s.id, include_free: v })}
        />
      </div>
    </li>
  )
}

function RuleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  )
}

function AddForm({ cal, onDone }: { cal: ReturnType<typeof useCalendars>; onDone: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [includeAllDay, setIncludeAllDay] = useState(false)
  const [includeFree, setIncludeFree] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const urlOk = /^(https?|webcal):\/\/[^/\s]+/i.test(url.trim())

  return (
    <form
      className="space-y-3 rounded-xl border bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        cal.add.mutate(
          { name: name.trim(), url: url.trim(), include_all_day: includeAllDay, include_free: includeFree },
          {
            onSuccess: onDone,
            onError: (err) => {
              const msg = (err as { message?: string }).message ?? ''
              setError(
                msg.includes('TOO_MANY_CALENDARS')
                  ? t('calendars.errors.TOO_MANY_CALENDARS')
                  : msg.includes('url_check') || msg.includes('check constraint')
                    ? t('calendars.errors.BAD_URL')
                    : t('calendars.errors.generic'),
              )
            },
          },
        )
      }}
    >
      <h2 className="font-semibold">{t('calendars.addTitle')}</h2>
      <label className="block text-sm">
        {t('calendars.nameLabel')}
        <input
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('calendars.namePlaceholder')}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        {t('calendars.urlLabel')}
        <input
          required
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…  ·  webcal://…"
          className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
        />
        <span className="mt-1 block text-xs text-gray-500">{t('calendars.urlHelp')}</span>
      </label>

      <details className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">
        <summary className="cursor-pointer font-medium">{t('calendars.howTo.title')}</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-4">
          <li>{t('calendars.howTo.google')}</li>
          <li>{t('calendars.howTo.outlook')}</li>
          <li>{t('calendars.howTo.icloud')}</li>
        </ul>
      </details>

      <RuleRow
        label={t('calendars.includeAllDay')}
        hint={t('calendars.includeAllDayHint')}
        checked={includeAllDay}
        onChange={setIncludeAllDay}
      />
      <RuleRow
        label={t('calendars.includeFree')}
        hint={t('calendars.includeFreeHint')}
        checked={includeFree}
        onChange={setIncludeFree}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" disabled={!name.trim() || !urlOk || cal.add.isPending}>
          {cal.add.isPending ? t('calendars.adding') : t('calendars.add')}
        </Button>
      </div>
    </form>
  )
}
