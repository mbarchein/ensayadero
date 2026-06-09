import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Privacy policy (GDPR / Spanish LOPDGDD). Content lives in i18n.
const SECTIONS = [
  'controller',
  'data',
  'purpose',
  'legalBasis',
  'retention',
  'recipients',
  'transfers',
  'rights',
  'security',
  'storage',
  'changes',
] as const

export default function PrivacyPage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <Link to="/login" className="text-sm font-medium text-violet-700 hover:underline">
        {t('privacy.back')}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('privacy.title')}</h1>
        <p className="text-xs text-gray-500">{t('privacy.updated')}</p>
      </div>
      <p className="text-sm text-gray-700">{t('privacy.intro')}</p>
      {SECTIONS.map((s) => (
        <section key={s} className="space-y-1">
          <h2 className="text-lg font-semibold">{t(`privacy.${s}.title`)}</h2>
          <p className="whitespace-pre-line text-sm text-gray-700">{t(`privacy.${s}.body`)}</p>
        </section>
      ))}
    </main>
  )
}
