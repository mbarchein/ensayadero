// Summon one member to upcoming sessions in bulk
// (/g/:groupId/members/:memberId/sessions). Reached from the MEMBER_JOINED
// notification or the "new member" banner on the members page: lists the
// future sessions the member is NOT part of, all preselected, with the
// member's availability per session, and inserts the chosen ones via the
// add_member_to_future_sessions RPC (required by default).

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Check } from 'lucide-react'
import { dateLocale } from '../../lib/dateLocale'
import { supabase } from '../../lib/supabase'
import { expandAvailability } from '../../lib/slots'
import { parseRange, type TimeRange } from '../../lib/ranges'
import { Badge, BackButton, Button, InitialsAvatar, Spinner } from '../../components/ui'
import { useGroup } from './useGroup'
import { tg } from '../../lib/glossary'
import type { Availability, Session } from '../../lib/types'

type SessionWithIds = Session & { session_participants: { user_id: string }[] }

// member's availability against one session range: merged available time
// minus busy time, clipped to the session
type Coverage = { state: 'full' | 'partial' | 'none'; label: string }
function coverageOf(range: TimeRange, avail: TimeRange[], busy: TimeRange[]): Coverage {
  const clip = (iv: TimeRange): TimeRange | null => {
    const start = new Date(Math.max(iv.start.getTime(), range.start.getTime()))
    const end = new Date(Math.min(iv.end.getTime(), range.end.getTime()))
    return end > start ? { start, end } : null
  }
  const merge = (ivs: TimeRange[]): TimeRange[] => {
    const sorted = [...ivs].sort((a, b) => a.start.getTime() - b.start.getTime())
    const out: TimeRange[] = []
    for (const iv of sorted) {
      const last = out[out.length - 1]
      if (last && iv.start <= last.end) {
        if (iv.end > last.end) last.end = iv.end
      } else out.push({ ...iv })
    }
    return out
  }
  const subtract = (segs: TimeRange[], holes: TimeRange[]): TimeRange[] =>
    segs.flatMap((seg) => {
      let pieces: TimeRange[] = [seg]
      for (const h of holes) {
        pieces = pieces.flatMap((p) => {
          if (h.end <= p.start || h.start >= p.end) return [p]
          const out: TimeRange[] = []
          if (h.start > p.start) out.push({ start: p.start, end: h.start })
          if (h.end < p.end) out.push({ start: h.end, end: p.end })
          return out
        })
      }
      return pieces
    })

  const free = subtract(
    merge(avail.map(clip).filter((x): x is TimeRange => x !== null)),
    merge(busy.map(clip).filter((x): x is TimeRange => x !== null)),
  )
  const covered = free.reduce((ms, iv) => ms + iv.end.getTime() - iv.start.getTime(), 0)
  const total = range.end.getTime() - range.start.getTime()
  if (covered === 0) return { state: 'none', label: '' }
  if (covered >= total) return { state: 'full', label: '' }
  return {
    state: 'partial',
    label: free.map((iv) => `${format(iv.start, 'HH:mm')}–${format(iv.end, 'HH:mm')}`).join(', '),
  }
}

export default function ConvokeMemberPage() {
  const { t } = useTranslation()
  const { memberId } = useParams<{ memberId: string }>()
  const { groupId, group, members, isInstructor, loading } = useGroup()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const member = members.find((m) => m.user_id === memberId)
  const name = member?.profiles.name || member?.profiles.email || '?'

  const { data: sessions } = useQuery({
    queryKey: ['future-sessions', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, session_participants(user_id)')
        .eq('group_id', groupId)
        .neq('status', 'CANCELLED')
      if (error) throw error
      return data as SessionWithIds[]
    },
  })

  // future sessions the member is not part of, soonest first
  const candidates = useMemo(() => {
    const now = new Date()
    return (sessions ?? [])
      .map((s) => ({ ...s, range: parseRange(s.time_range) }))
      .filter(
        (s) =>
          s.range.start > now && !s.session_participants.some((p) => p.user_id === memberId),
      )
      .sort((a, b) => a.range.start.getTime() - b.range.start.getTime())
  }, [sessions, memberId])

  const windowEnd = candidates.length ? candidates[candidates.length - 1].range.end : null

  const { data: avail } = useQuery({
    queryKey: ['member-availabilities', memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availabilities')
        .select('*')
        .eq('user_id', memberId!)
      if (error) throw error
      return data as Availability[]
    },
    enabled: !!memberId && candidates.length > 0,
  })

  const { data: busyRows } = useQuery({
    queryKey: ['member-busy', groupId, memberId, windowEnd?.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('group_busy_ranges', {
        gid: groupId,
        search: `[${new Date().toISOString()},${windowEnd!.toISOString()})`,
      })
      if (error) throw error
      return (data as { user_id: string; busy: string }[]).filter((r) => r.user_id === memberId)
    },
    enabled: !!windowEnd,
  })

  const coverage = useMemo(() => {
    const map = new Map<string, Coverage>()
    if (!avail || !windowEnd) return map
    const intervals = avail.flatMap((a) => expandAvailability(a, new Date(), windowEnd))
    const busy = (busyRows ?? []).map((r) => parseRange(r.busy))
    for (const s of candidates) map.set(s.id, coverageOf(s.range, intervals, busy))
    return map
  }, [avail, busyRows, candidates, windowEnd])

  // selection: everything in by default; track the exceptions
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [required, setRequired] = useState(true)
  const selected = candidates.filter((s) => !deselected.has(s.id))
  const confirmedCount = selected.filter((s) => s.status === 'CONFIRMED').length

  const toggle = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const convoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('add_member_to_future_sessions', {
        gid: groupId,
        uid: memberId,
        req: required,
        sids: selected.map((s) => s.id),
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', groupId] })
      qc.invalidateQueries({ queryKey: ['week-sessions', groupId] })
      qc.invalidateQueries({ queryKey: ['future-sessions', groupId] })
      // immediate delivery of the summons for already-confirmed sessions
      if (confirmedCount > 0) {
        supabase.functions.invoke('send-notifications', { body: {} }).catch(() => {})
      }
      navigate(`/g/${groupId}/members`, { replace: true })
    },
  })

  if (loading || !sessions) return <Spinner />
  if (!isInstructor) {
    return <p className="py-10 text-center text-sm text-gray-600">{t('planner.directorsOnly')}</p>
  }
  if (!member) {
    return <p className="py-10 text-center text-sm text-gray-600">{t('convoke.memberGone')}</p>
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${groupId}/members`} />
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
          {t('convoke.title', { name })}
        </h1>
      </header>

      {candidates.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-600">
          <p>{tg(t, 'convoke.allDone', group?.group_type, { name })}</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => navigate(`/g/${groupId}/members`)}
          >
            {t('convoke.backToMembers')}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {member.profiles.avatar_url ? (
                <img src={member.profiles.avatar_url} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <InitialsAvatar name={name} size={24} />
              )}
              {tg(t, 'convoke.futureCount', group?.group_type, { count: candidates.length })}
            </div>
            <span className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDeselected(new Set())}
                className="text-violet-700 hover:underline"
              >
                {t('planner.selectAll')}
              </button>
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={() => setDeselected(new Set(candidates.map((s) => s.id)))}
                className="text-violet-700 hover:underline"
              >
                {t('planner.selectNone')}
              </button>
            </span>
          </div>

          <ul className="space-y-1">
            {candidates.map((s) => {
              const cov = coverage.get(s.id)
              const checked = !deselected.has(s.id)
              return (
                <li
                  key={s.id}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    !checked
                      ? 'border-gray-200 bg-gray-50 opacity-60'
                      : cov?.state === 'full'
                        ? 'border-green-200 bg-green-50'
                        : cov?.state === 'partial'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-red-200 bg-red-50'
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      className="h-5 w-5 shrink-0 accent-violet-600"
                    />
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-violet-600 py-1 text-white">
                      <span className="text-[11px] font-semibold uppercase leading-tight">
                        {format(s.range.start, 'EEE', { locale: dateLocale() })}
                      </span>
                      <span className="text-lg font-bold leading-tight">
                        {format(s.range.start, 'd')}
                      </span>
                      <span className="text-[11px] uppercase leading-tight">
                        {format(s.range.start, 'MMM', { locale: dateLocale() })}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate">
                          {format(s.range.start, 'HH:mm')}–{format(s.range.end, 'HH:mm')}
                          {s.location ? ` · ${s.location}` : ''}
                        </span>
                        <Badge color={s.status === 'CONFIRMED' ? 'violet' : 'gray'}>
                          {t(`sessions.status.${s.status}`)}
                        </Badge>
                      </span>
                      {cov?.state === 'partial' && (
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                          {cov.label}
                        </span>
                      )}
                      {cov?.state === 'none' && (
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-red-700">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" aria-hidden />
                          {t('planner.noAvailability')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          {convoke.isError && (
            <p className="text-sm text-red-600">{(convoke.error as Error).message}</p>
          )}

          <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t border-violet-100 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-4 text-sm">
              <span>{t('convoke.convokeAs')}</span>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="convoke-role"
                  checked={required}
                  onChange={() => setRequired(true)}
                  className="accent-violet-600"
                />
                {t('convoke.asRequired')}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="convoke-role"
                  checked={!required}
                  onChange={() => setRequired(false)}
                  className="accent-violet-600"
                />
                {t('convoke.asOptional')}
              </label>
            </div>
            <Button
              className="inline-flex w-full items-center justify-center gap-1.5"
              disabled={selected.length === 0 || convoke.isPending}
              onClick={() => convoke.mutate()}
            >
              <Check size={16} />
              {tg(t, 'convoke.submit', group?.group_type, { count: selected.length })}
            </Button>
            {confirmedCount > 0 && (
              <p className="text-center text-xs text-gray-600">
                {tg(t, 'convoke.confirmedNote', group?.group_type, { count: confirmedCount })}
              </p>
            )}
          </div>
          {/* Spacer for the fixed bottom nav — same reasoning as SessionForm:
              keeps the sticky bar's resting position clear of the nav. */}
          <div aria-hidden className="h-[calc(2.5rem+env(safe-area-inset-bottom))] shrink-0" />
        </>
      )}
    </div>
  )
}
