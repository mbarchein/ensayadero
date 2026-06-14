// One-time "what's new" callout, persisted per user (cross-device) via
// profiles.seen_features. Unlike Tip (localStorage, per-device), this follows
// the user across devices and survives reinstalls — for announcing features
// added after a user finished onboarding, without resetting onboarded_at.
//
// Texts live under the i18n "whatsnew.<id>" namespace (title + body). Add a new
// feature by picking an id, writing its texts, and dropping <FeatureCallout
// id="..." /> where it should surface; mark_feature_seen records the dismissal.

import { useState, type ReactNode } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'

export default function FeatureCallout({ id, children }: { id: string; children?: ReactNode }) {
  const { t } = useTranslation()
  const { profile, refreshProfile } = useAuth()
  const [hidden, setHidden] = useState(false)

  if (!profile || hidden || (profile.seen_features ?? []).includes(id)) return null

  const dismiss = async () => {
    setHidden(true) // optimistic — don't wait on the round-trip to hide it
    await supabase.rpc('mark_feature_seen', { feature: id })
    await refreshProfile()
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
      <Sparkles size={16} className="mt-0.5 shrink-0 text-violet-600" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">{t(`whatsnew.${id}.title`)}</p>
        <p className="text-violet-800">{t(`whatsnew.${id}.body`)}</p>
        {children}
      </div>
      <button
        onClick={dismiss}
        aria-label={t('common.close')}
        className="rounded p-0.5 text-violet-400 hover:text-violet-700"
      >
        <X size={14} />
      </button>
    </div>
  )
}
