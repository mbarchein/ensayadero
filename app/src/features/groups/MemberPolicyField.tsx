// Group setting (boxed): how members who join from now on are added to the
// group's already-planned future sessions. A titled radio list with a short
// explanation under each option, so the behaviour is unambiguous.

import { useTranslation } from 'react-i18next'
import { tg } from '../../lib/glossary'
import type { GroupType, MemberInclusionPolicy } from '../../lib/types'

const OPTIONS: { value: MemberInclusionPolicy; label: string; hint: string }[] = [
  { value: 'MANDATORY', label: 'group.newMemberMandatory', hint: 'group.newMemberMandatoryHint' },
  { value: 'OPTIONAL', label: 'group.newMemberOptional', hint: 'group.newMemberOptionalHint' },
  { value: 'NONE', label: 'group.newMemberNone', hint: 'group.newMemberNoneHint' },
]

export default function MemberPolicyField({
  value,
  onChange,
  type,
}: {
  value: MemberInclusionPolicy
  onChange: (v: MemberInclusionPolicy) => void
  type?: GroupType
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="rounded-xl border bg-white p-4 text-sm">
      <legend className="px-1 font-medium">{t('group.newMemberTitle')}</legend>
      <div className="mt-1 space-y-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                active ? 'border-violet-600 bg-violet-50' : 'border-gray-200 bg-white hover:border-violet-300'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? 'border-violet-600' : 'border-gray-300'
                }`}
                aria-hidden
              >
                {active && <span className="h-2 w-2 rounded-full bg-violet-600" />}
              </span>
              <span>
                <span className="block font-medium">{tg(t, opt.label, type)}</span>
                <span className="block text-xs text-gray-600">{t(opt.hint)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
