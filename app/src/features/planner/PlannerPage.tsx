// Heatmap de disponibilidad del grupo (instructor).
// Selección de subconjunto de personas, intensidad = nº disponibles,
// tap en celda → crear sesión con horas prefijadas.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, addWeeks, format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useGroup } from '../groups/useGroup'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { overlaps, parseRange, type TimeRange } from '../../lib/ranges'
import { SLOTS_PER_DAY, heatmap, slotRange, weekStart, type HeatCell } from '../../lib/slots'
import WeekGrid from '../availability/WeekGrid'
import CreateSessionModal from './CreateSessionModal'
import { Badge, Spinner } from '../../components/ui'
import { Button } from '../../components/ui'
import type { Availability, SessionWithParticipants } from '../../lib/types'

export default function PlannerPage() {
  const { t } = useTranslation()
  const { groupId, group, members, isInstructor, loading } = useGroup()
  const { profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = useMemo(() => addWeeks(weekStart(new Date()), weekOffset), [weekOffset])
  const weekEnd = useMemo(() => addDays(monday, 7), [monday])
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = todos
  // selección de franja: día + slot ancla + slot final (arrastrar). a/b sin ordenar.
  const [sel, setSel] = useState<{ day: number; a: number; b: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editSession, setEditSession] = useState<SessionWithParticipants | null>(null)
  const selRange = sel ? { lo: Math.min(sel.a, sel.b), hi: Math.max(sel.a, sel.b) } : null

  const memberIds = members.map((m) => m.user_id)
  const activeIds = selected ? memberIds.filter((id) => selected.has(id)) : memberIds

  const { data: availabilities } = useQuery({
    queryKey: ['group-availabilities', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availabilities')
        .select('*')
        .in('user_id', memberIds)
      if (error) throw error
      return data as Availability[]
    },
    enabled: memberIds.length > 0,
  })

  const { data: busyRows } = useQuery({
    queryKey: ['group-busy', groupId, monday.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('group_busy_ranges', {
        gid: groupId,
        search: `[${monday.toISOString()},${weekEnd.toISOString()})`,
      })
      if (error) throw error
      return data as { user_id: string; busy: string }[]
    },
  })

  // sesiones del grupo que solapan la semana visible (borradores + confirmadas)
  const { data: weekSessions } = useQuery({
    queryKey: ['week-sessions', groupId, monday.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, session_participants(*, profiles(*))')
        .eq('group_id', groupId)
        .neq('status', 'CANCELLED')
        .filter('time_range', 'ov', `[${monday.toISOString()},${weekEnd.toISOString()})`)
        .order('time_range', { ascending: true })
      if (error) throw error
      return data as SessionWithParticipants[]
    },
  })

  // mapa [día][slot] → sesión que lo cubre (para pintar overlay en el grid)
  const sessionCells = useMemo(() => {
    const map = new Map<string, SessionWithParticipants>()
    for (const s of weekSessions ?? []) {
      const r = parseRange(s.time_range)
      for (let d = 0; d < 7; d++) {
        for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
          if (overlaps(slotRange(monday, d, slot), r)) map.set(`${d}:${slot}`, s)
        }
      }
    }
    return map
  }, [weekSessions, monday])

  const grid = useMemo(() => {
    if (!availabilities) return null
    const busyByUser = new Map<string, TimeRange[]>()
    for (const row of busyRows ?? []) {
      const list = busyByUser.get(row.user_id) ?? []
      list.push(parseRange(row.busy))
      busyByUser.set(row.user_id, list)
    }
    return heatmap(
      activeIds.map((id) => ({
        userId: id,
        availabilities: availabilities.filter((a) => a.user_id === id),
        busy: busyByUser.get(id) ?? [],
      })),
      monday,
    )
  }, [availabilities, busyRows, activeIds, monday])

  if (loading) return <Spinner />
  if (!isInstructor) {
    return <p className="py-10 text-center text-sm text-gray-500">{t('planner.directorsOnly')}</p>
  }

  const total = activeIds.length
  const nameOf = (id: string) => {
    const m = members.find((x) => x.user_id === id)
    return m?.profiles.name || m?.profiles.email || '?'
  }

  return (
    <div className="space-y-4">
      <header>
        <Link to={`/g/${groupId}`} className="text-sm text-gray-500">
          ‹ {group?.name}
        </Link>
        <h1 className="text-xl font-bold">{t('planner.title')}</h1>
      </header>

      {/* selector de personas */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelected(null)}
          className={chip(selected === null)}
        >
          {t('planner.all', { count: memberIds.length })}
        </button>
        {members.map((m) => {
          const active = selected === null || selected.has(m.user_id)
          return (
            <button
              key={m.user_id}
              onClick={() => {
                setSelected((prev) => {
                  const next = new Set(prev ?? memberIds)
                  if (prev === null) {
                    next.delete(m.user_id) // desde "todos": primer clic excluye
                  } else if (next.has(m.user_id)) {
                    next.delete(m.user_id)
                  } else {
                    next.add(m.user_id)
                  }
                  return next
                })
              }}
              className={chip(active)}
            >
              {(m.profiles.name || m.profiles.email).split(' ')[0]}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setWeekOffset((w) => Math.max(-6, w - 1))}
          disabled={weekOffset <= -6}
          aria-label={t('availability.prevWeek')}
        >
          ‹
        </Button>
        <span className="text-sm font-medium">
          {format(monday, 'd MMM', { locale: dateLocale() })} – {format(addDays(monday, 6), 'd MMM yyyy', { locale: dateLocale() })}
        </span>
        <Button variant="ghost" onClick={() => setWeekOffset((w) => w + 1)} aria-label={t('availability.nextWeek')}>
          ›
        </Button>
      </div>

      {!grid ? (
        <Spinner />
      ) : (
        <WeekGrid
          weekMonday={monday}
          cellClass={({ day, slot }) => {
            const selected =
              selRange && sel!.day === day && slot >= selRange.lo && slot <= selRange.hi
            const ses = sessionCells.get(`${day}:${slot}`)
            const sesBorder = ses
              ? ses.status === 'CONFIRMED'
                ? 'border-l-4 border-l-violet-600'
                : 'border-l-4 border-l-amber-400'
              : ''
            return `${heatClass(grid[day][slot], total)} cursor-pointer ${sesBorder} ${
              selected ? 'ring-2 ring-inset ring-violet-600' : ''
            }`
          }}
          renderCell={({ day, slot }) => {
            const ses = sessionCells.get(`${day}:${slot}`)
            if (ses) {
              // primer slot de la sesión muestra su título abreviado
              const firstSlot = !sessionCells.get(`${day}:${slot - 1}`)
              return firstSlot ? (
                <span
                  className="block truncate px-0.5 text-[8px] font-semibold leading-6 text-violet-900"
                  title={ses.title}
                >
                  {ses.title}
                </span>
              ) : null
            }
            const c = grid[day][slot]
            return c.available.length > 0 ? (
              <span className="block text-center text-[9px] leading-6 text-gray-700">
                {c.available.length}
              </span>
            ) : null
          }}
          onPaintStart={(pos) => {
            setDragging(true)
            setSel({ day: pos.day, a: pos.slot, b: pos.slot })
          }}
          onPaintMove={(pos) =>
            // extender solo dentro del mismo día del ancla
            setSel((prev) => (prev && pos.day === prev.day ? { ...prev, b: pos.slot } : prev))
          }
          onPaintEnd={() => setDragging(false)}
        />
      )}

      <p className="text-xs text-gray-500">{t('planner.legendDrag')}</p>

      {/* detalle de la franja seleccionada (agregado del rango) */}
      {sel && selRange && grid && !dragging && (
        <div className="rounded-xl border bg-white p-4 shadow">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {format(slotRange(monday, sel.day, selRange.lo).start, "EEE d · HH:mm", { locale: dateLocale() })}
              –{format(slotRange(monday, sel.day, selRange.hi).end, 'HH:mm')}
            </p>
            <button onClick={() => setSel(null)} className="text-gray-400" aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </div>
          <CellDetail
            cell={mergeCells(grid[sel.day], selRange.lo, selRange.hi)}
            activeIds={activeIds}
            nameOf={nameOf}
            meId={profile?.id}
          />
          <Button className="mt-3 w-full" onClick={() => setCreateOpen(true)}>
            {t('planner.createHere')}
          </Button>
        </div>
      )}

      {/* lista de ensayos de la semana (editable) */}
      {(weekSessions?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">{t('planner.weekSessions')}</h2>
          <ul className="space-y-2">
            {weekSessions!.map((s) => {
              const r = parseRange(s.time_range)
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{s.title}</span>
                      <Badge color={s.status === 'CONFIRMED' ? 'green' : 'gray'}>
                        {t(`sessions.status.${s.status}`)}
                      </Badge>
                    </p>
                    <p className="text-sm text-gray-600">
                      {format(r.start, "EEE d · HH:mm", { locale: dateLocale() })}–{format(r.end, 'HH:mm')}
                      {s.location ? ` · ${s.location}` : ''}
                    </p>
                  </div>
                  {(isInstructor || s.created_by === profile?.id) && (
                    <Button variant="secondary" onClick={() => setEditSession(s)}>
                      {t('planner.edit')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {createOpen && sel && selRange && grid && (
        <CreateSessionModal
          groupId={groupId}
          members={members}
          preselectedIds={activeIds}
          initialRange={{
            start: slotRange(monday, sel.day, selRange.lo).start,
            end: slotRange(monday, sel.day, selRange.hi).end,
          }}
          grid={grid}
          weekMonday={monday}
          onClose={() => {
            setCreateOpen(false)
            setSel(null)
          }}
        />
      )}

      {editSession && grid && (
        <CreateSessionModal
          groupId={groupId}
          members={members}
          preselectedIds={[]}
          session={editSession}
          initialRange={parseRange(editSession.time_range)}
          grid={grid}
          weekMonday={monday}
          onClose={() => setEditSession(null)}
        />
      )}
    </div>
  )
}

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition ${
    active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 line-through'
  }`

/** Agrega los slots lo..hi de un día en una celda: disponible = quien lo está
 *  en TODOS los slots (puede hacer la sesión entera); ocupado = unión. */
function mergeCells(day: HeatCell[], lo: number, hi: number): HeatCell {
  let available = day[lo].available
  const busy = new Set<string>()
  const preferred = new Set(day[lo].preferred)
  for (let s = lo; s <= hi; s++) {
    available = available.filter((id) => day[s].available.includes(id))
    day[s].busy.forEach((id) => busy.add(id))
    for (const id of [...preferred]) if (!day[s].preferred.includes(id)) preferred.delete(id)
  }
  return { available, preferred: [...preferred], busy: [...busy].filter((id) => !available.includes(id)) }
}

function heatClass(cell: HeatCell, total: number): string {
  if (total === 0) return 'bg-white'
  const ratio = cell.available.length / total
  if (ratio === 0) return 'bg-white'
  if (ratio < 0.34) return 'bg-emerald-100'
  if (ratio < 0.67) return 'bg-emerald-200'
  if (ratio < 1) return 'bg-emerald-300'
  return 'bg-emerald-500 ring-1 ring-inset ring-emerald-700'
}

function NameChip({ name, me, variant }: { name: string; me: boolean; variant: 'available' | 'busy' | 'unavailable' }) {
  const base = {
    available: 'bg-green-100 text-green-800',
    busy: 'bg-amber-100 text-amber-800',
    unavailable: 'bg-gray-100 text-gray-500',
  }[variant]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        me ? 'bg-violet-600 text-white ring-2 ring-violet-300' : base
      }`}
    >
      {name}
      {me && ' (tú)'}
    </span>
  )
}

function CellDetail({
  cell,
  activeIds,
  nameOf,
  meId,
}: {
  cell: HeatCell
  activeIds: string[]
  nameOf: (id: string) => string
  meId?: string
}) {
  const { t } = useTranslation()
  const unavailable = activeIds.filter(
    (id) => !cell.available.includes(id) && !cell.busy.includes(id),
  )
  return (
    <div className="space-y-2 text-xs">
      {cell.available.length > 0 && (
        <div>
          <span className="font-medium text-green-700">{t('planner.availableLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cell.available.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="available" />
            ))}
          </div>
        </div>
      )}
      {cell.busy.length > 0 && (
        <div>
          <span className="font-medium text-amber-700">{t('planner.busyLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cell.busy.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="busy" />
            ))}
          </div>
        </div>
      )}
      {unavailable.length > 0 && (
        <div>
          <span className="font-medium text-gray-500">{t('planner.unavailableLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {unavailable.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="unavailable" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
