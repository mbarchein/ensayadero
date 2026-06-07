import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'

export default function GoodbyePage() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-violet-50 p-6 text-center">
      <CheckCircle2 className="h-14 w-14 text-violet-600" />
      <h1 className="text-2xl font-bold text-violet-900">{t('goodbye.title')}</h1>
      <p className="max-w-xs text-sm text-violet-700">{t('goodbye.body')}</p>
      <Link
        to="/login"
        className="rounded-xl bg-violet-600 px-6 py-3 font-medium text-white shadow-md transition hover:bg-violet-700"
      >
        {t('goodbye.toLogin')}
      </Link>
    </main>
  )
}
