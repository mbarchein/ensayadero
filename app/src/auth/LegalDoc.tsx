import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Generic legal document page: renders a title + sections from an i18n namespace.
export default function LegalDoc({ ns, sections }: { ns: string; sections: string[] }) {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <Link to="/login" className="text-sm font-medium text-violet-700 hover:underline">
        {t(`${ns}.back`)}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t(`${ns}.title`)}</h1>
        <p className="text-xs text-gray-500">{t(`${ns}.updated`)}</p>
      </div>
      <p className="text-sm text-gray-700">{t(`${ns}.intro`)}</p>
      {sections.map((s) => (
        <section key={s} className="space-y-1">
          <h2 className="text-lg font-semibold">{t(`${ns}.${s}.title`)}</h2>
          <p className="whitespace-pre-line text-sm text-gray-700">{t(`${ns}.${s}.body`)}</p>
        </section>
      ))}
    </main>
  )
}
