// Group setting: how members who join from now on are added to the group's
// future rehearsals (MANDATORY default / OPTIONAL / NONE).

import { useTranslation } from 'react-i18next'
import type { MemberInclusionPolicy } from '../../lib/types'

const OPTIONS: MemberInclusionPolicy[] = ['MANDATORY', 'OPTIONAL', 'NONE']
const LABEL: Record<MemberInclusionPolicy, string> = {
  MANDATORY: 'group.newMemberMandatory',
  OPTIONAL: 'group.newMemberOptional',
  NONE: 'group.newMemberNone',
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
    <fieldset className="block text-sm">
      <legend>{t('group.newMemberLabel')}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {OPTIONS.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="new-member-policy"
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            {t(LABEL[opt])}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-600">{t('group.newMemberHint')}</p>
    </fieldset>
  )
}
