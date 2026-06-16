// Session form shared by the create and edit pages (both routed, with their
// own URL and history entry). Fields ordered by importance: date + time +
// duration chips with a live range preview, location with suggestions from
// past sessions, multi-line notes, then participants.
//
// Participants default to included+required. Each row has ONE cyclic control:
// required (violet check) → optional (amber check + chip) → excluded (empty)
// → required. Bulk actions: all / none / only-available. A coverage summary
// replaces the loose warnings.

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatRange } from '../../lib/ranges'
import { isoDay, DAY_START_HOUR, DAY_END_HOUR, SLOT_MINUTES, SLOTS_PER_DAY, type HeatCell } from '../../lib/slots'
import { BackButton, Badge, Button, InitialsAvatar } from '../../components/ui'
import { tg } from '../../lib/glossary'
import type { GroupType, MembershipWithProfile, SessionWithParticipants } from '../../lib/types'

// latest end the time input can hold on a 30-min grid (sessions end same day)
const MAX_END_MIN = 23 * 60 + 30

interface Props {
  groupId: string
  groupType?: GroupType
  members: MembershipWithProfile[]
  /** ids included by default when creating (all required); ignored on edit */
  preselectedIds: string[]
  initialDay: Date
  initialStartMin: number
  initialDurationMin: number
  /** heatmap of the week containing the chosen day; null while loading */
  grid: HeatCell[][] | null
  weekMonday: Date
  /** the page reloads the grid when the chosen day moves to another week */
  onDayChange: (day: Date) => void
  onClose: () => void
  /** If provided, the form edits that session instead of creating a new one. */
  session?: SessionWithParticipants
}

interface ParticipantDraft {
  userId: string
  included: boolean
  required: boolean
}

export default function SessionForm({
  groupId,
  groupType,
  members,
  preselectedIds,
  initialDay,
  initialStartMin,
  initialDurationMin,
  grid,
  weekMonday,
  onDayChange,
  onClose,
  session,
}: Props) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const editing = !!session

  const [day, setDay] = useState(initialDay)
  const [startMin, setStartMin] = useState(initialStartMin)
  // end time is the source of truth; duration is derived (rehearsals are
  // thought as "from 13:00 to 21:00", and chips capped long sessions)
  const [endMin, setEndMin] = useState(
    Math.min(MAX_END_MIN, initialStartMin + Math.max(30, initialDurationMin)),
  )
  const durationMin = endMin - startMin
  const validRange = durationMin >= 30

  // moving the start shifts the end along, preserving the duration
  const moveStart = (newStart: number) => {
    const delta = newStart - startMin
    setStartMin(newStart)
    setEndMin((e) => Math.min(MAX_END_MIN, Math.max(newStart + 30, e + delta)))
  }

  // Up/Down on a time input steps the whole value by one slot WITH carry
  // (e.g. 9:00 → 9:30 → 10:00), unlike the native per-segment arrows that wrap
  // the minutes without touching the hour. Reuses the setters so the duration
  // shift and validation still run.
  const stepOnArrow =
    (current: number, apply: (v: number) => void, lo: number, hi: number) =>
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const next = current + (e.key === 'ArrowUp' ? SLOT_MINUTES : -SLOT_MINUTES)
      apply(Math.min(hi, Math.max(lo, next)))
    }
  const [comments, setComments] = useState(session?.comments ?? '')
  const [location, setLocation] = useState(session?.location ?? '')
  const [participants, setParticipants] = useState<ParticipantDraft[]>(
    members.map((m) => {
      const sp = session?.session_participants.find((p) => p.user_id === m.user_id)
      const included = editing ? !!sp : preselectedIds.includes(m.user_id)
      return {
        userId: m.user_id,
        included,
        // everyone defaults to required; optional is the marked exception
        required: editing ? (sp?.required ?? false) : included,
      }
    }),
  )

  const start = useMemo(() => {
    const d = new Date(day)
    d.setHours(0, 0, 0, 0)
    d.setMinutes(startMin)
    return d
  }, [day, startMin])
  const end = useMemo(() => new Date(start.getTime() + durationMin * 60_000), [start, durationMin])

  // dirty check (edit): snapshot of the initial state, compared on render
  const snap = () =>
    JSON.stringify({ c: comments, l: location, d: isoDay(day), s: startMin, m: durationMin, p: participants })
  const initialSnap = useRef<string | null>(null)
  if (initialSnap.current === null) initialSnap.current = snap()
  const dirty = !editing || snap() !== initialSnap.current

  // location suggestions: places used by this group before
  const { data: pastLocations } = useQuery({
    queryKey: ['session-locations', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('location')
        .eq('group_id', groupId)
        .not('location', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return [...new Set((data as { location: string }[]).map((r) => r.location.trim()).filter(Boolean))]
    },
  })

  // availability of each participant in the chosen range (via the slot grid)
  type Coverage = { state: 'full' | 'partial' | 'none'; label: string }
  const coverage = useMemo(() => {
    const map = new Map<string, Coverage>()
    if (!grid) return map
    const dayIndex = Math.round((stripTime(day).getTime() - stripTime(weekMonday).getTime()) / 86_400_000)
    const firstSlot = Math.floor((startMin - DAY_START_HOUR * 60) / SLOT_MINUTES)
    const lastSlot = Math.ceil((startMin + durationMin - DAY_START_HOUR * 60) / SLOT_MINUTES) - 1
    const inBounds = dayIndex >= 0 && dayIndex <= 6 && firstSlot >= 0 && lastSlot < SLOTS_PER_DAY
    for (const p of participants) {
      if (!inBounds) {
        map.set(p.userId, { state: 'none', label: '' })
        continue
      }
      const avail: boolean[] = []
      for (let s = firstSlot; s <= lastSlot; s++) avail.push(grid[dayIndex][s].available.includes(p.userId))
      const count = avail.filter(Boolean).length
      if (count === 0) {
        map.set(p.userId, { state: 'none', label: '' })
      } else if (count === avail.length) {
        map.set(p.userId, { state: 'full', label: '' })
      } else {
        const runs: string[] = []
        let runStart = -1
        for (let i = 0; i <= avail.length; i++) {
          if (i < avail.length && avail[i]) {
            if (runStart < 0) runStart = i
          } else if (runStart >= 0) {
            const sM = DAY_START_HOUR * 60 + (firstSlot + runStart) * SLOT_MINUTES
            const eM = DAY_START_HOUR * 60 + (firstSlot + i) * SLOT_MINUTES
            runs.push(`${toHHMM(sM)}–${toHHMM(eM)}`)
            runStart = -1
          }
        }
        map.set(p.userId, { state: 'partial', label: runs.join(', ') })
      }
    }
    return map
  }, [participants, day, weekMonday, startMin, durationMin, grid])

  const requiredOutside = participants.filter(
    (p) => p.included && p.required && coverage.get(p.userId)?.state !== 'full',
  )
  const optionalOutside = participants.filter(
    (p) => p.included && !p.required && coverage.get(p.userId)?.state !== 'full',
  )
  const includedCount = participants.filter((p) => p.included).length

  // stable ordering: by availability for the chosen range, then by name —
  // cycling a row's state never reshuffles the list
  const covRank = { full: 0, partial: 1, none: 2 } as const
  const ordered = useMemo(
    () =>
      [...participants].sort(
        (a, b) =>
          (covRank[coverage.get(a.userId)?.state ?? 'none'] ?? 2) -
            (covRank[coverage.get(b.userId)?.state ?? 'none'] ?? 2) ||
          nameOf(a.userId).localeCompare(nameOf(b.userId)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverage],
  )

  function nameOf(id: string) {
    const m = members.find((x) => x.user_id === id)
    return m?.profiles.name || m?.profiles.email || '?'
  }
  const profileOf = (id: string) => members.find((x) => x.user_id === id)?.profiles

  // one control, three states: required → optional → excluded → required
  const cycle = (userId: string) =>
    setParticipants((prev) =>
      prev.map((x) => {
        if (x.userId !== userId) return x
        if (x.included && x.required) return { ...x, required: false }
        if (x.included) return { ...x, included: false }
        return { ...x, included: true, required: true }
      }),
    )
  const stateOf = (p: ParticipantDraft) =>
    p.included ? (p.required ? 'required' : 'optional') : 'excluded'

  const setAll = (mode: 'all' | 'none' | 'available') =>
    setParticipants((prev) =>
      prev.map((p) => {
        if (mode === 'all') return { ...p, included: true, required: true }
        if (mode === 'none') return { ...p, included: false }
        const ok = coverage.get(p.userId)?.state === 'full'
        return { ...p, included: ok, required: ok ? true : p.required }
      }),
    )

  // reconcile session_participants: delete the removed ones, upsert the rest
  const syncParticipants = async (sessionId: string) => {
    const included = participants.filter((p) => p.included)
    const includedIds = included.map((p) => p.userId)
    const prevIds = (session?.session_participants ?? []).map((p) => p.user_id)
    const toRemove = prevIds.filter((id) => !includedIds.includes(id))
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', sessionId)
        .in('user_id', toRemove)
      if (error) throw error
    }
    if (included.length > 0) {
      const { error } = await supabase.from('session_participants').upsert(
        included.map((p) => ({ session_id: sessionId, user_id: p.userId, required: p.required })),
        { onConflict: 'session_id,user_id' },
      )
      if (error) throw error
    }
    // The convener is assumed to attend: when the creator adds themselves to
    // the list, default their response to ACCEPTED. Only on first inclusion,
    // so a later "can't go" from the creator is preserved across edits.
    const creatorNewlyIncluded = includedIds.includes(profile!.id) && !prevIds.includes(profile!.id)
    if (creatorNewlyIncluded) {
      const { error } = await supabase
        .from('session_participants')
        .update({ response: 'ACCEPTED' })
        .eq('session_id', sessionId)
        .eq('user_id', profile!.id)
      if (error) throw error
    }
  }

  const save = useMutation({
    mutationFn: async (status: 'DRAFT' | 'CONFIRMED') => {
      if (editing) {
        // Update: participants BEFORE confirming/changing the time, so the
        // notification triggers already include the correct list.
        await syncParticipants(session!.id)
        const { error } = await supabase
          .from('sessions')
          .update({
            comments: comments || null,
            location: location || null,
            time_range: formatRange(start, end),
            status, // keeps or promotes to CONFIRMED
            updated_at: new Date().toISOString(),
          })
          .eq('id', session!.id)
        if (error) throw error
        if (status === 'CONFIRMED') {
          supabase.functions.invoke('send-notifications', { body: {} }).catch(() => {})
        }
        return session!.id
      }

      const { data: created, error } = await supabase
        .from('sessions')
        .insert({
          group_id: groupId,
          comments: comments || null,
          location: location || null,
          time_range: formatRange(start, end),
          status: 'DRAFT', // born DRAFT; confirming notifies the inserted participants
          created_by: profile!.id,
        })
        .select()
        .single()
      if (error) throw error
      await syncParticipants(created.id)
      if (status === 'CONFIRMED') {
        const { error: cError } = await supabase
          .from('sessions')
          .update({ status: 'CONFIRMED' })
          .eq('id', created.id)
        if (cError) throw cError
        supabase.functions.invoke('send-notifications', { body: {} }).catch(() => {})
      }
      return created.id as string
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['sessions', groupId] })
      qc.invalidateQueries({ queryKey: ['week-sessions', groupId] })
      qc.invalidateQueries({ queryKey: ['session', id] })
      qc.invalidateQueries({ queryKey: ['pending-attendance'] })
      // edit: back to where we came from. create: return to the group's
      // sessions view (directors usually convene several in a row), replacing
      // the form so Back skips it.
      if (editing) onClose()
      else navigate(`/g/${groupId}`, { replace: true })
    },
  })

  const confirmIfOutside = () =>
    requiredOutside.length === 0 ||
    confirm(
      t('planner.requiredOutsideConfirm', {
        names: requiredOutside.map((p) => nameOf(p.userId)).join(', '),
      }),
    )

  const primaryLabel = save.isPending
    ? t('planner.creating')
    : editing
      ? session!.status === 'CONFIRMED'
        ? t('planner.saveChanges')
        : t('planner.confirmAndNotify')
      : t('planner.createAndNotify')
  const primaryDisabled =
    save.isPending || !validRange || (editing && session!.status === 'CONFIRMED' && !dirty)

  return (
    <form
      id="session-form"
      className="flex min-h-full flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!validRange || !confirmIfOutside()) return
        save.mutate('CONFIRMED')
      }}
    >
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton onBack={onClose} />
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
          {editing ? tg(t, 'planner.editSession', groupType) : tg(t, 'planner.newSession', groupType)}
        </h1>
        <Button
          type="submit"
          variant="ghost"
          className="p-2"
          title={primaryLabel}
          aria-label={primaryLabel}
          disabled={primaryDisabled}
        >
          <Check size={20} />
        </Button>
      </header>

      {/* date block + editable date and start time */}
      <div className="flex items-center gap-3">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-violet-600 py-2 text-white">
          <span className="text-[11px] font-semibold uppercase leading-none">
            {format(start, 'EEE', { locale: dateLocale() })}
          </span>
          <span className="text-2xl font-bold leading-none">{format(start, 'd')}</span>
          <span className="text-[11px] uppercase leading-none">
            {format(start, 'MMM', { locale: dateLocale() })}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <label className="col-span-2 block text-sm">
            {t('planner.dateField')}
            <input
              type="date"
              required
              value={isoDay(day)}
              onChange={(e) => {
                if (!e.target.value) return
                const d = new Date(`${e.target.value}T00:00`)
                setDay(d)
                onDayChange(d)
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            {t('planner.startTime')}
            <input
              type="time"
              required
              step={SLOT_MINUTES * 60}
              value={toHHMM(startMin)}
              onChange={(e) => moveStart(fromHHMM(e.target.value))}
              onKeyDown={stepOnArrow(startMin, moveStart, 0, MAX_END_MIN - SLOT_MINUTES)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            {t('planner.endTime')}
            <input
              type="time"
              required
              step={SLOT_MINUTES * 60}
              value={toHHMM(endMin)}
              onChange={(e) => setEndMin(fromHHMM(e.target.value))}
              onKeyDown={stepOnArrow(endMin, setEndMin, startMin + SLOT_MINUTES, MAX_END_MIN)}
              aria-invalid={!validRange}
              className={`mt-1 w-full rounded-lg border px-3 py-2 ${
                validRange ? '' : 'border-red-400'
              }`}
            />
          </label>
        </div>
      </div>

      {/* live range + derived duration */}
      {validRange ? (
        <div className="text-sm">
          <p className="text-base font-semibold text-violet-700">
            {fmtDuration(durationMin)} · {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
          </p>
          {endMin > DAY_END_HOUR * 60 && (
            <p className="mt-1 text-xs text-amber-700">{t('planner.endsOutsideGrid')}</p>
          )}
        </div>
      ) : (
        <p className="text-sm font-medium text-red-600">{t('planner.invalidEnd')}</p>
      )}

      <label className="block text-sm">
        {t('planner.locationField')}
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          list="session-locations"
          className="mt-1 w-full rounded-lg border px-3 py-2"
          placeholder={t('planner.locationPlaceholder')}
        />
        <datalist id="session-locations">
          {(pastLocations ?? []).map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>

      <label className="block text-sm">
        {t('planner.commentsField')}
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border px-3 py-2"
          placeholder={t('planner.commentsPlaceholder')}
        />
      </label>

      <fieldset>
        <div className="mb-1 flex items-center justify-between gap-2">
          <legend className="text-sm font-medium">
            {t('planner.participantsCount', { included: includedCount, total: members.length })}
          </legend>
          <span className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => setAll('all')} className="text-violet-700 hover:underline">
              {t('planner.selectAll')}
            </button>
            <span className="text-gray-300">·</span>
            <button type="button" onClick={() => setAll('none')} className="text-violet-700 hover:underline">
              {t('planner.selectNone')}
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={() => setAll('available')}
              className="text-violet-700 hover:underline"
            >
              {t('planner.selectAvailable')}
            </button>
          </span>
        </div>

        {/* coverage summary */}
        {grid &&
          (requiredOutside.length > 0 ? (
            <p className="mb-2 text-sm font-medium text-red-700">
              {t('planner.requiredOutside', { count: requiredOutside.length })}
            </p>
          ) : (
            <p className="mb-2 text-sm font-medium text-green-700">✓ {t('planner.coverageOk')}</p>
          ))}
        {grid && optionalOutside.length > 0 && requiredOutside.length === 0 && (
          <p className="mb-2 text-sm text-amber-700">
            {t('planner.optionalOutside', { count: optionalOutside.length })}
          </p>
        )}

        <ul className="space-y-1">
          {ordered.map((p) => {
            const cov = coverage.get(p.userId)
            const state = stateOf(p)
            const prof = profileOf(p.userId)
            const name = nameOf(p.userId)
            const stateLabel = t(`planner.state.${state}`)
            return (
              <li
                key={p.userId}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  state === 'excluded'
                    ? 'border-gray-200 bg-gray-50 opacity-60'
                    : cov?.state === 'full'
                      ? 'border-green-200 bg-green-50'
                      : cov?.state === 'partial'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {/* cyclic state control: required → optional → excluded */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={state === 'required' ? 'true' : state === 'optional' ? 'mixed' : 'false'}
                    aria-label={`${name}: ${stateLabel}`}
                    title={stateLabel}
                    onClick={() => cycle(p.userId)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
                      state === 'required'
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : state === 'optional'
                          ? 'border-amber-400 bg-amber-400 text-white'
                          : 'border-gray-300 bg-white'
                    }`}
                  >
                    {state !== 'excluded' && <Check size={14} strokeWidth={3} />}
                  </button>
                  {prof?.avatar_url ? (
                    <img src={prof.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full" />
                  ) : (
                    <InitialsAvatar name={name} size={24} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{name}</span>
                      {state === 'optional' && <Badge color="amber">{t('planner.optional')}</Badge>}
                    </span>
                    {state !== 'excluded' && cov?.state === 'partial' && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                        {cov.label}
                      </span>
                    )}
                    {state !== 'excluded' && cov?.state === 'none' && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-red-700">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" aria-hidden />
                        {t('planner.noAvailability')}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
        {!grid && <p className="mt-2 text-xs text-gray-600">{t('common.loading')}</p>}
      </fieldset>

      {save.isError && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}

      {/* sticky action bar: always reachable with long participant lists */}
      <div className="sticky bottom-0 -mx-4 mt-auto flex gap-2 border-t border-violet-100 bg-white/95 px-4 py-3 backdrop-blur">
        {(!editing || session!.status !== 'CONFIRMED') && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={save.isPending || !validRange || (editing && !dirty)}
            onClick={() => save.mutate('DRAFT')}
          >
            {editing ? t('planner.saveDraft') : t('planner.createDraft')}
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={primaryDisabled}>
          {primaryLabel}
        </Button>
      </div>
      {/* Spacer for the fixed bottom nav: the sticky bar pins above the nav
          (the scroll container's bottom padding shrinks its sticky
          rectangle), but trailing padding doesn't extend the scroll range, so
          without this element the bar's resting position stays behind the nav
          and the pinned bar covers the last participant row at max scroll.
          2.5rem + the form's gap-4 and pb-2 add up to the nav's 3.5rem, so
          the bar rests exactly where it pins. */}
      <div aria-hidden className="h-[calc(2.5rem+env(safe-area-inset-bottom))] shrink-0" />
    </form>
  )
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
function fromHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
function fmtDuration(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}
