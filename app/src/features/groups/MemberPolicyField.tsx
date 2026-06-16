// Group setting: how members who join from now on are added to the group's
// future rehearsals (MANDATORY default / OPTIONAL / NONE). Segmented control.

import { useTranslation } from 'react-i18next'
import type { MemberInclusionPolicy } from '../../lib/types'

const OPTIONS: MemberInclusionPolicy[] = ['MANDATORY', 'OPTIONAL', 'NONE']
const LABEL: Record<MemberInclusionPolicy, string> = {
  MANDATORY: 'group.newMemberMandatory',
  OPTIONAL: 'group.newMemberOptional',
  NONE: 'group.newMemberNone',
}
// Distinct active color per option: violet = required (app accent), amber =
// optional, gray = left out.
const ACTIVE: Record<MemberInclusionPolicy, string> = {
  MANDATORY: 'bg-violet-600 text-white',
  OPTIONAL: 'bg-amber-500 text-white',
  NONE: 'bg-gray-500 text-white',
}

export default function MemberPolicyField({
  value,
  onChange,
}: {
  value: MemberInclusionPolicy
  onChange: (v: MemberInclusionPolicy) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="text-sm">
      <p className="mb-1">{t('group.newMemberLabel')}</p>
      <div className="flex overflow-hidden rounded-lg border border-violet-200">
        {OPTIONS.map((opt, i) => {
          const active = value === opt
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt)}
              className={`flex-1 px-3 py-2 text-center transition-colors ${
                i > 0 ? 'border-l border-violet-200' : ''
              } ${
                active
                  ? `${ACTIVE[opt]} font-medium`
                  : 'bg-white text-gray-700 hover:bg-violet-50'
              }`}
            >
              {t(LABEL[opt])}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-xs text-gray-600">{t('group.newMemberHint')}</p>
    </div>
  )
}
