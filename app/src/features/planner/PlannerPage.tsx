// Heatmap de disponibilidad del grupo (instructor).
// Selección de subconjunto de personas, intensidad = nº disponibles,
// tap en celda → crear sesión con horas prefijadas.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, addWeeks, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { useGroup } from '../groups/useGroup'
import { supabase } from '../../lib/supabase'
import { parseRange, type TimeRange } from '../../lib/ranges'
import { heatmap, slotRange, weekStart, type HeatCell } from '../../lib/slots'
import WeekGrid, { type CellPos } from '../availability/WeekGrid'
import CreateSessionModal from './CreateSessionModal'
import { Spinner } from '../../components/ui'
import { Button } from '../../components/ui'
import type { Availability } from '../../lib/types'

export default function PlannerPage() {
  const { groupId, group, members, isInstructor, loading } = useGroup()
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = useMemo(() => addWeeks(weekStart(new Date()), weekOffset), [weekOffset])
  const weekEnd = useMemo(() => addDays(monday, 7), [monday])
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = todos
  const [createAt, setCreateAt] = useState<CellPos | null>(null)
  const [inspect, setInspect] = useState<CellPos | null>(null)

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
    return <p className="py-10 text-center text-sm text-gray-500">Solo los instructores pueden planificar.</p>
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
        <h1 className="text-xl font-bold">Planificar ensayo</h1>
      </header>

      {/* selector de personas */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelected(null)}
          className={chip(selected === null)}
        >
          Todos ({memberIds.length})
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
        <Button variant="ghost" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Semana anterior">
          ‹
        </Button>
        <span className="text-sm font-medium">
          {format(monday, 'd MMM', { locale: es })} – {format(addDays(monday, 6), 'd MMM yyyy', { locale: es })}
        </span>
        <Button variant="ghost" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Semana siguiente">
          ›
        </Button>
      </div>

      {!grid ? (
        <Spinner />
      ) : (
        <WeekGrid
          weekMonday={monday}
          cellClass={({ day, slot }) => `${heatClass(grid[day][slot], total)} cursor-pointer`}
          renderCell={({ day, slot }) => {
            const c = grid[day][slot]
            return c.available.length > 0 ? (
              <span className="block text-center text-[9px] leading-6 text-gray-700">
                {c.available.length}
              </span>
            ) : null
          }}
          onCellTap={(pos) => setInspect(pos)}
        />
      )}

      <p className="text-xs text-gray-500">
        El número indica cuántas personas seleccionadas están disponibles. Verde intenso = todas.
        Toca una franja para ver detalle y crear el ensayo.
      </p>

      {/* detalle de celda */}
      {inspect && grid && (
        <div className="rounded-xl border bg-white p-4 shadow">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {format(slotRange(monday, inspect.day, inspect.slot).start, "EEE d · HH:mm", { locale: es })}
            </p>
            <button onClick={() => setInspect(null)} className="text-gray-400" aria-label="Cerrar">
              ✕
            </button>
          </div>
          <CellDetail cell={grid[inspect.day][inspect.slot]} activeIds={activeIds} nameOf={nameOf} />
          <Button className="mt-3 w-full" onClick={() => setCreateAt(inspect)}>
            Crear ensayo en esta franja
          </Button>
        </div>
      )}

      {createAt && grid && (
        <CreateSessionModal
          groupId={groupId}
          members={members}
          preselectedIds={activeIds}
          initialRange={slotRange(monday, createAt.day, createAt.slot)}
          grid={grid}
          weekMonday={monday}
          onClose={() => {
            setCreateAt(null)
            setInspect(null)
          }}
        />
      )}
    </div>
  )
}

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition ${
    active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 line-through'
  }`

function heatClass(cell: HeatCell, total: number): string {
  if (total === 0) return 'bg-white'
  const ratio = cell.available.length / total
  if (ratio === 0) return 'bg-white'
  if (ratio < 0.34) return 'bg-emerald-100'
  if (ratio < 0.67) return 'bg-emerald-200'
  if (ratio < 1) return 'bg-emerald-300'
  return 'bg-emerald-500 ring-1 ring-inset ring-emerald-700'
}

function CellDetail({
  cell,
  activeIds,
  nameOf,
}: {
  cell: HeatCell
  activeIds: string[]
  nameOf: (id: string) => string
}) {
  const unavailable = activeIds.filter(
    (id) => !cell.available.includes(id) && !cell.busy.includes(id),
  )
  return (
    <div className="space-y-1 text-xs">
      {cell.available.length > 0 && (
        <p>
          <span className="font-medium text-green-700">Disponibles:</span>{' '}
          {cell.available.map(nameOf).join(', ')}
        </p>
      )}
      {cell.busy.length > 0 && (
        <p>
          <span className="font-medium text-amber-700">Ocupados (otro ensayo):</span>{' '}
          {cell.busy.map(nameOf).join(', ')}
        </p>
      )}
      {unavailable.length > 0 && (
        <p>
          <span className="font-medium text-gray-500">Sin disponibilidad:</span>{' '}
          {unavailable.map(nameOf).join(', ')}
        </p>
      )}
    </div>
  )
}
