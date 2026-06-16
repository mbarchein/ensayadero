// Group setting: the activity domain (theatre / music / dance / sports / other).
// Drives the per-type wording across the app. Icon grid, one tile per type.

import { useTranslation } from 'react-i18next'
import { Drama, Music, PersonStanding, Dumbbell, Shapes, type LucideIcon } from 'lucide-react'
import type { GroupType } from '../../lib/types'

const OPTIONS: GroupType[] = ['THEATRE', 'MUSIC', 'DANCE', 'SPORTS', 'OTHER']
const ICON: Record<GroupType, LucideIcon> = {
  THEATRE: Drama,
  MUSIC: Music,
  DANCE: PersonStanding,
  SPORTS: Dumbbell,
  OTHER: Shapes,
}

export default function GroupTypeField({
  value,
  onChange,
}: {
  value: GroupType
  onChange: (v: GroupType) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="text-sm">
      <p className="mb-1">{t('group.typeLabel')}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {OPTIONS.map((opt) => {
          const Icon = ICON[opt]
          const active = value === opt
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 transition-colors ${
                active
                  ? 'border-violet-600 bg-violet-600 font-medium text-white'
                  : 'border-violet-200 bg-white text-gray-700 hover:bg-violet-50'
              }`}
            >
              <Icon size={20} aria-hidden />
              {t(`group.type.${opt}`)}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-xs text-gray-600">{t('group.typeHint')}</p>
    </div>
  )
}
