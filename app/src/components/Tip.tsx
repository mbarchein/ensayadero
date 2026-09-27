// One-time coach tip: a dismissible callout shown the first time a user
// visits a view (per user, persisted in localStorage). Texts live under the
// i18n "tips" namespace keyed by the tip id. The profile page can reset all
// seen flags via resetTips().

import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { tg } from '../lib/glossary'
import type { GroupType } from '../lib/types'

const PREFIX = 'tip-seen:'

/** Forget every seen tip (all users on this device): they show again. */
export function resetTips() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  }
}

export default function Tip({ id, type }: { id: string; type?: GroupType }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const key = `${PREFIX}${profile?.id ?? 'anon'}:${id}`
  const [visible, setVisible] = useState(() => localStorage.getItem(key) !== '1')
  if (!visible) return null
  const dismiss = () => {
    localStorage.setItem(key, '1')
    setVisible(false)
  }
  return (
    <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-sky-600" aria-hidden />
      <p className="flex-1">{tg(t, `tips.${id}`, type)}</p>
      <button
        onClick={dismiss}
        aria-label={t('common.close')}
        className="rounded p-0.5 text-sky-400 hover:text-sky-700"
      >
        <X size={14} />
      </button>
    </div>
  )
}
