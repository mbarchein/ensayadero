import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import {
  CalendarDays,
  CalendarPlus,
  MapPin,
  Megaphone,
  NotebookPen,
  Phone,
  Share2,
  Check,
  X,
  Pencil,
} from 'lucide-react'
import GroupAvatar from '../groups/GroupAvatar'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { tg } from '../../lib/glossary'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'
import { expandAvailability, isoDay } from '../../lib/slots'
import { downloadIcs } from '../../lib/ics'
import { roleLabel } from '../../lib/roleLabel'
import { celebrate, commiserate } from '../../lib/confetti'
import { Badge, BackButton, Button, InitialsAvatar, Modal, Spinner } from '../../components/ui'
import Tip from '../../components/Tip'
import type { Availability, GroupType, ParticipantResponse, SessionWithParticipants } from '../../lib/types'

/** A user's available (painted) sub-intervals within range `r`, merged. */
function availableWithin(avails: Availability[], r: TimeRange): TimeRange[] {
  const clamped: TimeRange[] = []
  for (const a of avails) {
    for (const iv of expandAvailability(a, r.start, r.end)) {
      if (!overlaps(iv, r)) continue
      clamped.push({
        start: new Date(Math.max(iv.start.getTime(), r.start.getTime())),
        end: new Date(Math.min(iv.end.getTime(), r.end.getTime())),
      })
    }
  }
  clamped.sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: TimeRange[] = []
  for (const iv of clamped) {
    const last = merged[merged.length - 1]
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end > last.end) last.end = iv.end
    } else {
      merged.push({ ...iv })
    }
  }
  return merged
}

export default function SessionDetailPage() {
  const { t } = useTranslation()
  const { sessionId } = useParams<{ sessionId: string }>()
  const { groupId, group, members, isInstructor } = useGroup()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  // set by the short-link landing: explain what a shared rehearsal is
  const viaShare = !!(useLocation().state as { shared?: boolean } | null)?.shared
  const [shareCopied, setShareCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const [nudgedCount, setNudgedCount] = useState<number | null>(null)

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, session_participants(*, profiles(*))')
        .eq('id', sessionId!)
        .single()
      if (error) throw error
      return data as SessionWithParticipants
    },
  })

  // participants' availability (to detect partial availability)
  const participantIds = session?.session_participants.map((p) => p.user_id) ?? []
  const { data: avails } = useQuery({
    queryKey: ['session-avail', sessionId, participantIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availabilities')
        .select('*')
        .in('user_id', participantIds)
      if (error) throw error
      return data as Availability[]
    },
    enabled: !!session && participantIds.length > 0,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['session', sessionId] })
    qc.invalidateQueries({ queryKey: ['sessions', groupId] })
    qc.invalidateQueries({ queryKey: ['my-pending'] })
    qc.invalidateQueries({ queryKey: ['pending-attendance'] })
  }

  const respond = useMutation({
    mutationFn: async (response: ParticipantResponse) => {
      const { error } = await supabase
        .from('session_participants')
        .update({ response })
        .eq('session_id', sessionId!)
        .eq('user_id', profile!.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setStatus = useMutation({
    mutationFn: async (status: 'CONFIRMED' | 'CANCELLED') => {
      const { error } = await supabase.from('sessions').update({ status }).eq('id', sessionId!)
      if (error) throw error
      // triggers immediate delivery (the trigger already created the notifications)
      supabase.functions.invoke('send-notifications', { body: {} }).catch(() => {})
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sessions').delete().eq('id', sessionId!)
      if (error) throw error
    },
    onSuccess: () => navigate(`/g/${groupId}`),
  })

  // queue a NUDGE for everyone still pending, then trigger immediate delivery
  const nudge = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('nudge_pending_participants', { sid: sessionId! })
      if (error) throw error
      supabase.functions.invoke('send-notifications', { body: {} }).catch(() => {})
      return data as number
    },
    onSuccess: (n) => {
      setNudgedCount(n)
      setTimeout(() => setNudgedCount(null), 4000)
    },
  })

  if (isLoading || !session) return <Spinner />

  const r = parseRange(session.time_range)
  const mine = session.session_participants.find((p) => p.user_id === profile?.id)
  // Sort each list: me first, then by response (going → not going → pending),
  // then alphabetically.
  const respOrder: Record<string, number> = { ACCEPTED: 0, DECLINED: 1, PENDING: 2 }
  const partName = (p: (typeof session.session_participants)[number]) => p.profiles.name || p.profiles.email
  const sortParticipants = (list: typeof session.session_participants) =>
    [...list].sort(
      (a, b) =>
        Number(b.user_id === profile?.id) - Number(a.user_id === profile?.id) ||
        (respOrder[a.response] ?? 9) - (respOrder[b.response] ?? 9) ||
        partName(a).localeCompare(partName(b)),
    )
  const required = sortParticipants(session.session_participants.filter((p) => p.required))
  const optional = sortParticipants(session.session_participants.filter((p) => !p.required))

  // each participant's availability within the session's range
  const availInfo = new Map<string, { coverage: 'full' | 'partial' | 'none'; label: string }>()
  for (const p of session.session_participants) {
    const intervals = availableWithin(
      (avails ?? []).filter((a) => a.user_id === p.user_id),
      r,
    )
    const covered = intervals.reduce((s, iv) => s + (iv.end.getTime() - iv.start.getTime()), 0)
    const total = r.end.getTime() - r.start.getTime()
    const coverage = covered === 0 ? 'none' : covered >= total ? 'full' : 'partial'
    const label = intervals
      .map((iv) => `${format(iv.start, 'HH:mm')}–${format(iv.end, 'HH:mm')}`)
      .join(', ')
    availInfo.set(p.user_id, { coverage, label })
  }

  const roleOf = (userId: string) => members.find((m) => m.user_id === userId)?.role ?? null

  // Share a scheduled rehearsal (instructors only): Web Share API with a
  // clipboard fallback, mirroring the group invite share.
  const shareUrl = `${import.meta.env.VITE_APP_URL}/s/${session.short_code}`
  const shareSession = async () => {
    setShareError(null)
    const when = `${format(r.start, 'EEEE d MMMM, HH:mm', { locale: dateLocale() })}–${format(r.end, 'HH:mm')}`
    const lines = [
      tg(t, 'sessions.shareText', group?.group_type, { group: group?.name ?? '' }),
      when,
      session.location || null,
    ].filter(Boolean) as string[]
    const text = lines.join('\n')
    if (navigator.share) {
      try {
        await navigator.share({ title: group?.name ?? '', text, url: shareUrl })
      } catch {
        /* cancelled by the user */
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      } catch {
        setShareError(shareUrl)
      }
    }
  }

  const isPast = r.end < new Date()
  // "dentro de 19 horas" / "hace 2 días" — date-fns' suffix would say
  // "en alrededor de 19 horas", so we strip the approximation words and
  // add our own prefix
  const relDist = formatDistanceToNow(r.start, { locale: dateLocale() }).replace(
    /^(alrededor de|casi|más de|about|almost|over)\s+/i,
    '',
  )
  const relLabel =
    r.start < new Date()
      ? t('sessions.relPast', { dist: relDist })
      : t('sessions.relFuture', { dist: relDist })
  const durMs = r.end.getTime() - r.start.getTime()
  const durH = Math.floor(durMs / 3_600_000)
  const durM = Math.round((durMs % 3_600_000) / 60_000)
  const durationLabel = [durH ? `${durH} h` : null, durM ? `${durM} min` : null]
    .filter(Boolean)
    .join(' ')
  const tally = session.session_participants.reduce(
    (a, p) => {
      a[p.response] = (a[p.response] ?? 0) + 1
      return a
    },
    {} as Record<string, number>,
  )

  return (
    <div className="space-y-5 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${groupId}`} />
        <GroupAvatar seed={group?.avatar_seed || groupId} image={group?.avatar_image} />
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{group?.name}</h1>
        {isInstructor && session.status === 'CONFIRMED' && (
          <Button
            variant="ghost"
            className="p-2"
            title={t('sessions.share')}
            aria-label={t('sessions.share')}
            onClick={shareSession}
          >
            {shareCopied ? <Check size={18} className="text-green-600" /> : <Share2 size={18} />}
          </Button>
        )}
        {isInstructor && session.status !== 'CANCELLED' && (
          <Button
            variant="ghost"
            className="p-2"
            title={tg(t, 'sessions.editBtn', group?.group_type)}
            aria-label={tg(t, 'sessions.editBtn', group?.group_type)}
            onClick={() => navigate(`/g/${groupId}/sessions/${session.id}/edit`)}
          >
            <Pencil size={18} />
          </Button>
        )}
      </header>

      {viaShare && <Tip id="sessionShared" type={group?.group_type} />}
      <Tip id="sessionDetail" type={group?.group_type} />

      {shareError && (
        <p className="break-all text-xs text-gray-600">
          {t('invite.copyManually')}: {shareError}
        </p>
      )}

      {session.status === 'CANCELLED' && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {tg(t, 'sessions.cancelledBanner', group?.group_type)}
        </p>
      )}

      {/* calendar-style date block + time/duration/location/relative time, with
          the director's notes attached below as part of the same card */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {/* the date row opens the agenda on this day, with the session flashing */}
        <button
          type="button"
          onClick={() => navigate(`/availability?d=${isoDay(r.start)}&s=${session.id}`)}
          title={t('upcoming.viewInAgenda')}
          aria-label={t('upcoming.viewInAgenda')}
          className="flex w-full text-left transition hover:bg-gray-50"
        >
          <div
            className={`flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-white ${
              isPast || session.status === 'CANCELLED' ? 'bg-gray-400' : 'bg-violet-600'
            }`}
          >
            <span className="text-[11px] font-semibold uppercase leading-none">
              {format(r.start, 'EEE', { locale: dateLocale() })}
            </span>
            <span className="text-2xl font-bold leading-none">{format(r.start, 'd')}</span>
            <span className="text-[11px] uppercase leading-none">
              {format(r.start, 'MMM', { locale: dateLocale() })}
            </span>
          </div>
          <div className="min-w-0 flex-1 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-semibold">
                {format(r.start, 'HH:mm')}–{format(r.end, 'HH:mm')}{' '}
                <span className="text-sm font-normal text-gray-600">· {durationLabel}</span>
              </p>
              {session.status === 'DRAFT' && <Badge color="amber">{t('sessions.status.DRAFT')}</Badge>}
            </div>
            {session.location && (
              <p className="flex items-center gap-1 text-sm text-gray-600">
                <MapPin size={14} className="shrink-0" />
                <span className="truncate">{session.location}</span>
              </p>
            )}
            <p className="text-xs text-gray-600">{relLabel}</p>
          </div>
        </button>
        {session.comments && (
          <p className="flex gap-1.5 border-t border-violet-100 bg-violet-50 px-3 py-2.5 text-sm text-violet-900">
            <NotebookPen size={15} className="mt-0.5 shrink-0" />
            <span className="whitespace-pre-line">{session.comments}</span>
          </p>
        )}
      </div>

      {mine && session.status === 'CONFIRMED' && (
        <section
          // the card mirrors my response: violet=going, red=not, amber=pending
          className={`rounded-xl border p-4 ${
            mine.response === 'ACCEPTED'
              ? 'border-violet-200 bg-violet-50'
              : mine.response === 'DECLINED'
                ? 'border-red-200 bg-red-50'
                : 'border-amber-200 bg-amber-50'
          }`}
        >
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-900">
            {t('sessions.areYouGoing')}
            {!mine.required && <Badge color="gray">{t('sessions.optionalTag')}</Badge>}
          </p>
          <p className="mb-3 text-xs text-gray-600">{t('sessions.canChangeLater')}</p>
          <div className="flex gap-2">
            <Button
              variant={mine.response === 'ACCEPTED' ? 'primary' : 'secondary'}
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={respond.isPending}
              onClick={() => {
                if (mine.response === 'ACCEPTED') return
                celebrate()
                respond.mutate('ACCEPTED')
              }}
            >
              <Check size={16} /> {t('sessions.goingBtn')}
            </Button>
            <Button
              variant={mine.response === 'DECLINED' ? 'danger' : 'secondary'}
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={respond.isPending}
              onClick={() => {
                if (mine.response === 'DECLINED') return
                commiserate()
                respond.mutate('DECLINED')
              }}
            >
              <X size={16} /> {t('sessions.cantGoBtn')}
            </Button>
          </div>
          {availInfo.get(profile?.id ?? '')?.coverage === 'partial' && (
            <p className="mt-2 text-xs text-amber-800">
              ⚠ {t('sessions.yourPartialAvailability', { hours: availInfo.get(profile!.id)!.label })}
            </p>
          )}
          {availInfo.get(profile?.id ?? '')?.coverage === 'none' && (
            <p className="mt-2 text-xs text-amber-800">⚠ {t('sessions.yourNoAvailability')}</p>
          )}
        </section>
      )}

      <ParticipantList
        title={t('sessions.requiredList')}
        list={required}
        availInfo={availInfo}
        roleOf={roleOf}
        myId={profile?.id}
        groupType={group?.group_type}
      />
      {optional.length > 0 && (
        <ParticipantList
          title={t('sessions.optionalList')}
          list={optional}
          availInfo={availInfo}
          roleOf={roleOf}
          myId={profile?.id}
          groupType={group?.group_type}
        />
      )}

      {/* remind-pending (instructor): full-width, below the attendees */}
      {isInstructor && session.status === 'CONFIRMED' && (tally.PENDING ?? 0) > 0 && (
        nudgedCount !== null ? (
          <p className="text-center text-sm font-medium text-green-700">
            {t('sessions.nudged', { count: nudgedCount })}
          </p>
        ) : (
          <Button
            variant="secondary"
            className="inline-flex w-full items-center justify-center gap-1.5"
            onClick={() => setNudgeOpen(true)}
          >
            <Megaphone size={16} /> {t('sessions.nudgePending')}
          </Button>
        )
      )}

      <section className="space-y-2 border-t pt-4">
        {session.status === 'CONFIRMED' && (
          <Button
            variant="secondary"
            className="inline-flex w-full items-center justify-center gap-1.5"
            onClick={() =>
              downloadIcs({
                uid: session.id,
                range: r,
                summary: tg(t, 'sessions.icsSummary', group?.group_type, { group: group?.name ?? '' }),
                location: session.location,
                description: session.comments,
                url: shareUrl,
              })
            }
          >
            <CalendarPlus size={16} /> {t('sessions.addToCalendar')}
          </Button>
        )}
        {mine && (
          <Button
            variant="secondary"
            className="inline-flex w-full items-center justify-center gap-1.5"
            onClick={() => navigate(`/availability?d=${isoDay(r.start)}&s=${session.id}`)}
          >
            <CalendarDays size={16} /> {t('upcoming.viewInAgenda')}
          </Button>
        )}
        {isInstructor && session.status === 'DRAFT' && (
          <Button onClick={() => setStatus.mutate('CONFIRMED')} className="w-full">
            {tg(t, 'sessions.confirmBtn', group?.group_type)}
          </Button>
        )}
        {isInstructor && session.status === 'DRAFT' && (
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm(t('sessions.deleteDraftConfirm'))) remove.mutate()
            }}
            className="w-full"
          >
            {t('sessions.deleteDraft')}
          </Button>
        )}
        {isInstructor && session.status === 'CONFIRMED' && (
          <button
            onClick={() => setCancelOpen(true)}
            className="block w-full py-2 text-center text-sm font-medium text-red-600 hover:underline"
          >
            {tg(t, 'sessions.cancelBtn', group?.group_type)}
          </button>
        )}
      </section>

      <Modal open={nudgeOpen} onClose={() => setNudgeOpen(false)} title={t('sessions.nudgePending')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('sessions.nudgeConfirm')}</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {session.session_participants
              .filter((p) => p.response === 'PENDING')
              .map((p) => (
                <li key={p.user_id} className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                  <span className="truncate">{p.profiles.name || p.profiles.email}</span>
                </li>
              ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setNudgeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={nudge.isPending}
              onClick={() => {
                nudge.mutate()
                setNudgeOpen(false)
              }}
            >
              <Megaphone size={16} /> {t('sessions.nudgeSend')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={tg(t, 'sessions.cancelBtn', group?.group_type)}>
        <div className="space-y-4">
          <p className="text-sm font-bold text-red-700">{tg(t, 'sessions.cancelConfirm', group?.group_type)}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={setStatus.isPending}
              onClick={() => {
                setStatus.mutate('CANCELLED')
                setCancelOpen(false)
              }}
            >
              {tg(t, 'sessions.cancelBtn', group?.group_type)}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ParticipantList({
  title,
  list,
  availInfo,
  roleOf,
  myId,
  groupType,
}: {
  title: string
  list: SessionWithParticipants['session_participants']
  availInfo: Map<string, { coverage: 'full' | 'partial' | 'none'; label: string }>
  roleOf: (userId: string) => 'INSTRUCTOR' | 'ACTOR' | null
  myId?: string
  groupType?: GroupType
}) {
  const { t } = useTranslation()
  const going = list.filter((p) => p.response === 'ACCEPTED').length
  const pending = list.filter((p) => p.response === 'PENDING').length
  const declined = list.filter((p) => p.response === 'DECLINED').length
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {/* response tally with the same colored dots as the session cards */}
        <div className="flex items-center gap-2.5 text-xs text-gray-600">
          {going > 0 && (
            <span className="inline-flex items-center gap-1" title={t('sessions.response.going')}>
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              {going}
            </span>
          )}
          {pending > 0 && (
            <span className="inline-flex items-center gap-1" title={t('sessions.response.pendingShort')}>
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {pending}
            </span>
          )}
          {declined > 0 && (
            <span className="inline-flex items-center gap-1" title={t('sessions.response.notGoing')}>
              <span className="h-2 w-2 rounded-full bg-red-400" />
              {declined}
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-1">
        {list.map((p) => {
          const role = roleOf(p.user_id)
          const av = availInfo.get(p.user_id)
          const name = p.profiles.name || p.profiles.email
          return (
            <li key={p.user_id} className="rounded-lg border bg-white px-3 py-2 text-sm">
              <div className="flex items-center gap-2.5">
                {p.profiles.avatar_url ? (
                  <img src={p.profiles.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full" />
                ) : (
                  <InitialsAvatar name={name} size={28} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {p.user_id === myId ? (
                      <span className="font-bold text-violet-700">{t('upcoming.me')}</span>
                    ) : (
                      <span className="truncate">{name}</span>
                    )}
                    {role && (
                      <Badge color={role === 'INSTRUCTOR' ? 'violet' : 'gray'}>
                        {roleLabel(t, role, p.profiles.gender, groupType)}
                      </Badge>
                    )}
                  </span>
                  {/* availability "traffic light": amber dot = partial (with the
                      hours), gray dot = none; full coverage stays clean */}
                  {av?.coverage === 'partial' && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                      {av.label}
                    </span>
                  )}
                  {av?.coverage === 'none' && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-gray-300" aria-hidden />
                      {t('sessions.noAvailabilityNote')}
                    </span>
                  )}
                </span>
                {p.profiles.phone && p.user_id !== myId && (
                  <a
                    href={`tel:${p.profiles.phone.replace(/\s+/g, '')}`}
                    title={t('sessions.call', { name })}
                    aria-label={t('sessions.call', { name })}
                    className="rounded-full p-1.5 text-violet-700 hover:bg-violet-100"
                  >
                    <Phone size={15} />
                  </a>
                )}
                {(() => {
                  const label =
                    p.response === 'ACCEPTED'
                      ? t('sessions.response.going')
                      : p.response === 'DECLINED'
                        ? t('sessions.response.notGoingList')
                        : t('sessions.response.pending')
                  return (
                    <span
                      title={label}
                      aria-label={label}
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        p.response === 'ACCEPTED'
                          ? 'bg-violet-500'
                          : p.response === 'DECLINED'
                            ? 'bg-red-400'
                            : 'bg-amber-400'
                      }`}
                    />
                  )
                })()}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
