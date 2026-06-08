import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState } from 'react'
import { MapPin, Share2, Check, X } from 'lucide-react'
import GroupAvatar from '../groups/GroupAvatar'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useGroup } from '../groups/useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'
import { expandAvailability, isoDay } from '../../lib/slots'
import { roleLabel } from '../../lib/roleLabel'
import { celebrate, commiserate } from '../../lib/confetti'
import { Badge, BackButton, Button, Spinner } from '../../components/ui'
import type { Availability, ParticipantResponse, SessionWithParticipants } from '../../lib/types'

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
  const [shareCopied, setShareCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

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

  if (isLoading || !session) return <Spinner />

  const r = parseRange(session.time_range)
  const mine = session.session_participants.find((p) => p.user_id === profile?.id)
  const required = session.session_participants.filter((p) => p.required)
  const optional = session.session_participants.filter((p) => !p.required)

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
  const shareUrl = `${import.meta.env.VITE_APP_URL}/g/${groupId}/sessions/${session.id}`
  const shareSession = async () => {
    setShareError(null)
    const when = `${format(r.start, 'EEEE d MMMM, HH:mm', { locale: dateLocale() })}–${format(r.end, 'HH:mm')}`
    const lines = [
      t('sessions.shareText', { title: session.title }),
      when,
      session.location || null,
    ].filter(Boolean) as string[]
    const text = lines.join('\n')
    if (navigator.share) {
      try {
        await navigator.share({ title: session.title, text, url: shareUrl })
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

  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-start gap-2">
        <BackButton to={`/g/${groupId}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <GroupAvatar seed={group?.avatar_seed || groupId} size={28} />
            <span className="text-sm font-medium text-gray-500">{group?.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{session.title}</h1>
            <Badge
              color={session.status === 'CONFIRMED' ? 'green' : session.status === 'CANCELLED' ? 'red' : 'gray'}
            >
              {t(`sessions.status.${session.status}`)}
            </Badge>
          </div>
          <p className="text-gray-700">
            {format(r.start, "EEEE d 'de' MMMM · HH:mm", { locale: dateLocale() })}–{format(r.end, 'HH:mm')}
          </p>
          {session.scene && <p className="text-sm text-gray-600">{t('sessions.scene', { scene: session.scene })}</p>}
          {session.location && (
            <p className="flex items-center gap-1 text-sm text-gray-600">
              <MapPin size={14} /> {session.location}
            </p>
          )}
        </div>
      </header>

      {mine && session.status === 'CONFIRMED' && (
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="mb-2 text-sm font-medium text-violet-900">
            {mine.required ? t('sessions.yourAttendance.required') : t('sessions.yourAttendance.optional')}{' '}
            {t('sessions.areYouGoing')}
          </p>
          <div className="flex gap-2">
            <Button
              variant={mine.response === 'ACCEPTED' ? 'primary' : 'secondary'}
              className="inline-flex items-center gap-1.5"
              onClick={() => {
                if (mine.response !== 'ACCEPTED') celebrate()
                respond.mutate('ACCEPTED')
              }}
            >
              <Check size={16} /> {t('sessions.goingBtn')}
            </Button>
            <Button
              variant={mine.response === 'DECLINED' ? 'danger' : 'secondary'}
              className="inline-flex items-center gap-1.5"
              onClick={() => {
                if (mine.response !== 'DECLINED') commiserate()
                respond.mutate('DECLINED')
              }}
            >
              <X size={16} /> {t('sessions.cantGoBtn')}
            </Button>
          </div>
        </section>
      )}

      <ParticipantList title={t('sessions.requiredList')} list={required} availInfo={availInfo} roleOf={roleOf} />
      {optional.length > 0 && (
        <ParticipantList title={t('sessions.optionalList')} list={optional} availInfo={availInfo} roleOf={roleOf} />
      )}

      {isInstructor && (
        <section className="space-y-2 border-t pt-4">
          {session.status === 'CONFIRMED' && (
            <>
              <Button
                variant="secondary"
                className="inline-flex w-full items-center justify-center gap-1.5"
                onClick={shareSession}
              >
                <Share2 size={16} /> {shareCopied ? t('sessions.shareCopied') : t('sessions.share')}
              </Button>
              {shareError && (
                <p className="break-all text-xs text-gray-600">
                  {t('invite.copyManually')}: {shareError}
                </p>
              )}
            </>
          )}
          {session.status !== 'CANCELLED' && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                navigate(`/g/${groupId}/planner?d=${isoDay(r.start)}&edit=${session.id}`)
              }
            >
              {t('sessions.editBtn')}
            </Button>
          )}
          {session.status === 'DRAFT' && (
            <Button onClick={() => setStatus.mutate('CONFIRMED')} className="w-full">
              {t('sessions.confirmBtn')}
            </Button>
          )}
          {session.status === 'CONFIRMED' && (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(t('sessions.cancelConfirm'))) setStatus.mutate('CANCELLED')
              }}
              className="w-full"
            >
              {t('sessions.cancelBtn')}
            </Button>
          )}
          {session.status === 'DRAFT' && (
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
        </section>
      )}
    </div>
  )
}

function ParticipantList({
  title,
  list,
  availInfo,
  roleOf,
}: {
  title: string
  list: SessionWithParticipants['session_participants']
  availInfo: Map<string, { coverage: 'full' | 'partial' | 'none'; label: string }>
  roleOf: (userId: string) => 'INSTRUCTOR' | 'ACTOR' | null
}) {
  const { t } = useTranslation()
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-700">{title}</h2>
      <ul className="space-y-1">
        {list.map((p) => {
          const role = roleOf(p.user_id)
          const av = availInfo.get(p.user_id)
          return (
            <li key={p.user_id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {p.profiles.name || p.profiles.email}
                  {role && (
                    <Badge color={role === 'INSTRUCTOR' ? 'violet' : 'gray'}>
                      {roleLabel(t, role, p.profiles.gender)}
                    </Badge>
                  )}
                </span>
                <Badge color={p.response === 'ACCEPTED' ? 'green' : p.response === 'DECLINED' ? 'red' : 'amber'}>
                  {p.response === 'ACCEPTED'
                    ? t('sessions.response.going')
                    : p.response === 'DECLINED'
                      ? t('sessions.response.notGoingList')
                      : t('sessions.response.pending')}
                </Badge>
              </div>
              {av?.coverage === 'partial' && (
                <p className="mt-1 text-xs text-amber-700">
                  {t('sessions.partialAvailability', { hours: av.label })}
                </p>
              )}
              {av?.coverage === 'none' && (
                <p className="mt-1 text-xs text-gray-500">{t('sessions.noAvailabilityNote')}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
