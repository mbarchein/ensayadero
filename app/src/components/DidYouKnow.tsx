// Rotating "Did you know…?" card for the home page: shows one random app tip
// from the i18n list, with a button to cycle to the next. Facts live under the
// "home.didYouKnow.facts" array; glossary terms ({{actPl}}…) use the neutral
// 'OTHER' vocabulary since the home page spans every group type.

import { useState } from 'react'
import { Lightbulb, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { tg } from '../lib/glossary'

export default function DidYouKnow() {
  const { t } = useTranslation()
  const facts = t('home.didYouKnow.facts', { returnObjects: true })
  const count = Array.isArray(facts) ? facts.length : 0
  const [index, setIndex] = useState(() => (count ? Math.floor(Math.random() * count) : 0))
  if (count === 0) return null

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-violet-900">
          <Lightbulb size={18} className="text-violet-600" aria-hidden />
          {t('home.didYouKnow.title')}
        </h2>
        {count > 1 && (
          <button
            onClick={() => setIndex((i) => (i + 1) % count)}
            aria-label={t('home.didYouKnow.next')}
            className="rounded-full p-1 text-violet-500 transition hover:bg-violet-100 hover:text-violet-700"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-violet-800">
        {tg(t, `home.didYouKnow.facts.${index}`, 'OTHER')}
      </p>
    </section>
  )
}
