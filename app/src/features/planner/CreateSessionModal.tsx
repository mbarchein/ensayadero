// Modal de creación de sesión: hora inicio/fin ajustable, participantes con
// toggle obligatorio/opcional, validación contra disponibilidad (RF14):
// obligatorio fuera de disponibilidad → rojo (requiere confirmación),
// opcional fuera → ámbar (aviso).

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isSameDay } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatRange, type TimeRange } from '../../lib/ranges'
import { DAY_START_HOUR, SLOT_MINUTES, SLOTS_PER_DAY, type HeatCell } from '../../lib/slots'
import { Badge, Button, Modal } from '../../components/ui'
import type { MembershipWithProfile, SessionWithParticipants } from '../../lib/types'

interface Props {
  groupId: string
  members: MembershipWithProfile[]
  preselectedIds: string[]
  initialRange: TimeRange
  grid: HeatCell[][]
  weekMonday: Date
  onClose: () => void
  /** Si se pasa, el modal edita esa sesión en vez de crear una nueva. */
  session?: SessionWithParticipants
}

interface ParticipantDraft {
  userId: string
  included: boolean
  required: boolean
}

export default function CreateSessionModal({
  groupId,
  members,
  preselectedIds,
  initialRange,
  grid,
  weekMonday,
  onClose,
  session,
}: Props) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const editing = !!session
  const [title, setTitle] = useState(() => session?.title ?? t('planner.defaultTitle'))
  const [scene, setScene] = useState(session?.scene ?? '')
  const [location, setLocation] = useState(session?.location ?? '')
  const [startMin, setStartMin] = useState(minutesOfDay(initialRange.start))
  // duración inicial = longitud de la sesión / franja arrastrada (mín. 30 min)
  const [durationMin, setDurationMin] = useState(() =>
    Math.max(30, Math.round((initialRange.end.getTime() - initialRange.start.getTime()) / 60_000)),
  )
  const [participants, setParticipants] = useState<ParticipantDraft[]>(
    members.map((m) => {
      const sp = session?.session_participants.find((p) => p.user_id === m.user_id)
      return {
        userId: m.user_id,
        included: editing ? !!sp : preselectedIds.includes(m.user_id),
        required: editing ? (sp?.required ?? false) : preselectedIds.includes(m.user_id),
      }
    }),
  )

  const day = initialRange.start
  const start = useMemo(() => {
    const d = new Date(day)
    d.setHours(0, 0, 0, 0)
    d.setMinutes(startMin)
    return d
  }, [day, startMin])
  const end = useMemo(() => new Date(start.getTime() + durationMin * 60_000), [start, durationMin])

  // disponibilidad de cada participante en el rango elegido (vía grid de slots)
  const coverage = useMemo(() => {
    const dayIndex = Math.round((stripTime(day).getTime() - stripTime(weekMonday).getTime()) / 86_400_000)
    if (dayIndex < 0 || dayIndex > 6) return new Map<string, boolean>()
    const firstSlot = Math.floor((startMin - DAY_START_HOUR * 60) / SLOT_MINUTES)
    const lastSlot = Math.ceil((startMin + durationMin - DAY_START_HOUR * 60) / SLOT_MINUTES) - 1
    const map = new Map<string, boolean>()
    for (const p of participants) {
      let ok = true
      for (let s = Math.max(0, firstSlot); s <= Math.min(SLOTS_PER_DAY - 1, lastSlot); s++) {
        if (!grid[dayIndex][s].available.includes(p.userId)) {
          ok = false
          break
        }
      }
      if (firstSlot < 0 || lastSlot >= SLOTS_PER_DAY) ok = false
      map.set(p.userId, ok)
    }
    return map
  }, [participants, day, weekMonday, startMin, durationMin, grid])

  const requiredOutside = participants.filter(
    (p) => p.included && p.required && !coverage.get(p.userId),
  )
  const optionalOutside = participants.filter(
    (p) => p.included && !p.required && !coverage.get(p.userId),
  )

  // reconcilia session_participants: borra los quitados, upsert de los incluidos
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
  }

  const create = useMutation({
    mutationFn: async (status: 'DRAFT' | 'CONFIRMED') => {
      if (editing) {
        // Actualizar: participantes ANTES de confirmar/cambiar hora, para que los
        // triggers de notificación incluyan ya la lista correcta.
        await syncParticipants(session!.id)
        const { error } = await supabase
          .from('sessions')
          .update({
            title,
            scene: scene || null,
            location: location || null,
            time_range: formatRange(start, end),
            status, // mantiene o promueve a CONFIRMED
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
          title,
          scene: scene || null,
          location: location || null,
          time_range: formatRange(start, end),
          status: 'DRAFT', // siempre nace DRAFT; confirmar dispara notificaciones a participantes ya insertados
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
      if (editing) onClose()
      else navigate(`/g/${groupId}/sessions/${id}`)
    },
  })

  // Cancelar (solo edición): confirmada → estado CANCELLED (trigger notifica a
  // los convocados); borrador → se elimina (nadie fue convocado aún).
  const cancel = useMutation({
    mutationFn: async () => {
      if (session!.status === 'CONFIRMED') {
        const { error } = await supabase
          .from('sessions')
          .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
          .eq('id', session!.id)
        if (error) throw error
        supabase.functions.invoke('send-notifications', { body: {} }).catch(() => {})
      } else {
        const { error } = await supabase.from('sessions').delete().eq('id', session!.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', groupId] })
      qc.invalidateQueries({ queryKey: ['week-sessions', groupId] })
      onClose()
    },
  })

  const nameOf = (id: string) => {
    const m = members.find((x) => x.user_id === id)
    return m?.profiles.name || m?.profiles.email || '?'
  }

  const confirmIfOutside = () =>
    requiredOutside.length === 0 ||
    confirm(
      t('planner.requiredOutsideConfirm', {
        names: requiredOutside.map((p) => nameOf(p.userId)).join(', '),
      }),
    )

  return (
    <Modal open onClose={onClose} title={editing ? t('planner.editSession') : t('planner.newSession')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!confirmIfOutside()) return
          create.mutate('CONFIRMED')
        }}
      >
        <p className="text-sm font-medium text-violet-800">
          {format(day, "EEEE d 'de' MMMM", { locale: dateLocale() })}
          {!isSameDay(day, start) && ' ⚠️'}
        </p>

        <label className="block text-sm">
          {t('planner.sessionTitle')}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            {t('planner.sceneField')}
            <input
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder={t('planner.scenePlaceholder')}
            />
          </label>
          <label className="block text-sm">
            {t('planner.locationField')}
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder={t('planner.locationPlaceholder')}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            {t('planner.startTime')}
            <input
              type="time"
              required
              step={SLOT_MINUTES * 60}
              value={toHHMM(startMin)}
              onChange={(e) => setStartMin(fromHHMM(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            {t('planner.duration')}
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              {[...new Set([durationMin, 30, 60, 90, 120, 150, 180, 240])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
        </p>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('planner.participants')}</legend>
          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {participants.map((p, i) => {
              const ok = coverage.get(p.userId)
              return (
                <li
                  key={p.userId}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    !p.included
                      ? 'bg-gray-50 opacity-50'
                      : ok
                        ? 'bg-green-50'
                        : p.required
                          ? 'bg-red-50'
                          : 'bg-amber-50'
                  }`}
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={p.included}
                      onChange={(e) =>
                        setParticipants((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)),
                        )
                      }
                    />
                    {nameOf(p.userId)}
                    {p.included && !ok && (
                      <Badge color={p.required ? 'red' : 'amber'}>{t('planner.noAvailability')}</Badge>
                    )}
                  </label>
                  {p.included && (
                    <button
                      type="button"
                      onClick={() =>
                        setParticipants((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, required: !x.required } : x)),
                        )
                      }
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.required ? 'bg-violet-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {p.required ? t('planner.required') : t('planner.optional')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </fieldset>

        {requiredOutside.length > 0 && (
          <p className="text-sm text-red-700">
            {t('planner.requiredOutside', { count: requiredOutside.length })}
          </p>
        )}
        {optionalOutside.length > 0 && requiredOutside.length === 0 && (
          <p className="text-sm text-amber-700">
            {t('planner.optionalOutside', { count: optionalOutside.length })}
          </p>
        )}
        {create.isError && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}

        <div className="flex gap-2">
          {session?.status !== 'CONFIRMED' && (
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={create.isPending}
              onClick={() => create.mutate('DRAFT')}
            >
              {t('planner.saveDraft')}
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={create.isPending}>
            {create.isPending
              ? t('planner.creating')
              : session?.status === 'CONFIRMED'
                ? t('planner.saveChanges')
                : t('planner.confirmAndNotify')}
          </Button>
        </div>

        {editing && (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-red-600"
            disabled={cancel.isPending}
            onClick={() => {
              if (confirm(t(session!.status === 'CONFIRMED' ? 'planner.cancelConfirm' : 'planner.deleteDraftConfirm')))
                cancel.mutate()
            }}
          >
            {session!.status === 'CONFIRMED' ? t('planner.cancelSession') : t('sessions.deleteDraft')}
          </Button>
        )}
        {cancel.isError && <p className="text-sm text-red-600">{(cancel.error as Error).message}</p>}
      </form>
    </Modal>
  )
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
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
