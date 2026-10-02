// Shared pieces of the group availability heatmap (planner and the agenda's
// group view): people filter, cell colors and the "who can make it" detail.

import { useTranslation } from 'react-i18next'
import { tg } from '../../lib/glossary'
import type { HeatCell } from '../../lib/slots'
import type { GroupType, MembershipWithProfile } from '../../lib/types'

/** Chip row to narrow the heatmap to some members. selected null = all. */
export function PeopleFilter({
  members,
  selected,
  onChange,
}: {
  members: MembershipWithProfile[]
  selected: Set<string> | null
  onChange: (next: Set<string> | null) => void
}) {
  const { t } = useTranslation()
  const memberIds = members.map((m) => m.user_id)
  // everyone in, either as "all" or picked back one by one
  const allOn = selected === null || memberIds.every((id) => selected.has(id))
  return (
    <div className="flex flex-wrap gap-1.5">
      {/* toggle: selects everyone, or clears everyone when all are in */}
      <button
        onClick={() => onChange(allOn ? new Set() : null)}
        aria-pressed={allOn}
        className={chip(allOn)}
      >
        {t('planner.all', { count: memberIds.length })}
      </button>
      {members.map((m) => {
        const active = selected === null || selected.has(m.user_id)
        return (
          <button
            key={m.user_id}
            onClick={() => {
              const next = new Set(selected ?? memberIds)
              if (selected === null) {
                next.delete(m.user_id) // from "all": first click excludes
              } else if (next.has(m.user_id)) {
                next.delete(m.user_id)
              } else {
                next.add(m.user_id)
              }
              onChange(next)
            }}
            className={chip(active)}
          >
            {(m.profiles.name || m.profiles.email).split(' ')[0]}
          </button>
        )
      })}
    </div>
  )
}

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition ${
    active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 line-through'
  }`

export type MergedCell = HeatCell & { partial: string[] }

/** Aggregates slots lo..hi of a day: available = whoever is available in ALL
 *  slots (can attend the whole session); partial = available in some but not
 *  all; busy = union of busy. */
export function mergeCells(day: HeatCell[], lo: number, hi: number): MergedCell {
  let available = day[lo].available
  const everAvailable = new Set<string>()
  const busy = new Set<string>()
  const preferred = new Set(day[lo].preferred)
  for (let s = lo; s <= hi; s++) {
    available = available.filter((id) => day[s].available.includes(id))
    day[s].available.forEach((id) => everAvailable.add(id))
    day[s].busy.forEach((id) => busy.add(id))
    for (const id of [...preferred]) if (!day[s].preferred.includes(id)) preferred.delete(id)
  }
  const partial = [...everAvailable].filter((id) => !available.includes(id) && !busy.has(id))
  return {
    available,
    preferred: [...preferred],
    busy: [...busy].filter((id) => !available.includes(id)),
    partial,
  }
}

export function heatClass(cell: HeatCell, total: number): string {
  if (total === 0) return 'bg-white'
  const ratio = cell.available.length / total
  if (ratio === 0) return 'bg-white'
  if (ratio < 0.34) return 'bg-emerald-100'
  if (ratio < 0.67) return 'bg-emerald-200'
  if (ratio < 1) return 'bg-emerald-300'
  return 'bg-emerald-500 ring-1 ring-inset ring-emerald-700'
}

function NameChip({
  name,
  me,
  variant,
}: {
  name: string
  me: boolean
  variant: 'available' | 'partial' | 'busy' | 'unavailable'
}) {
  const base = {
    available: 'bg-green-100 text-green-800',
    partial: 'bg-orange-100 text-orange-800',
    busy: 'bg-amber-100 text-amber-800',
    unavailable: 'bg-gray-100 text-gray-600',
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

export function CellDetail({
  cell,
  activeIds,
  nameOf,
  meId,
  groupType,
}: {
  cell: MergedCell
  activeIds: string[]
  nameOf: (id: string) => string
  meId?: string
  groupType?: GroupType
}) {
  const { t } = useTranslation()
  const unavailable = activeIds.filter(
    (id) => !cell.available.includes(id) && !cell.partial.includes(id) && !cell.busy.includes(id),
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
      {cell.partial.length > 0 && (
        <div>
          <span className="font-medium text-orange-700">{t('planner.partialLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cell.partial.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="partial" />
            ))}
          </div>
        </div>
      )}
      {cell.busy.length > 0 && (
        <div>
          <span className="font-medium text-amber-700">{tg(t, 'planner.busyLabel', groupType)}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cell.busy.map((id) => (
              <NameChip key={id} name={nameOf(id)} me={id === meId} variant="busy" />
            ))}
          </div>
        </div>
      )}
      {unavailable.length > 0 && (
        <div>
          <span className="font-medium text-gray-600">{t('planner.unavailableLabel')}</span>
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
