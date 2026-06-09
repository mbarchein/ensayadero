import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Turnstile, { captchaEnabled } from './Turnstile'

// Legal/contact data is NOT in the bundle: it's fetched from the legal-info Edge
// Function after a server-verified Turnstile check, so scrapers can't read it.
type LegalData = {
  entity: string
  taxId: string
  address: string
  privacyEmail: string
  contactEmail: string
}
const EMPTY: LegalData = { entity: '', taxId: '', address: '', privacyEmail: '', contactEmail: '' }

function useLegalInfo() {
  const [data, setData] = useState<LegalData>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const load = (token: string | null) => {
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/legal-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ token }),
    })
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((d: LegalData) => {
        setData(d)
        setLoaded(true)
      })
      .catch(() => {})
  }
  // Without a captcha configured there's nothing to gate: load directly.
  useEffect(() => {
    if (!captchaEnabled) load(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { data, loaded, onToken: (t: string | null) => load(t) }
}

// Generic legal document page: title + sections from an i18n namespace, with the
// controller/contact fields filled at runtime (placeholder "—" until loaded).
export default function LegalDoc({ ns, sections }: { ns: string; sections: string[] }) {
  const { t } = useTranslation()
  const { data, loaded, onToken } = useLegalInfo()
  const vars = {
    entity: data.entity || '—',
    taxId: data.taxId || '—',
    address: data.address || '—',
    privacyEmail: data.privacyEmail || '—',
    contactEmail: data.contactEmail || '—',
  }
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
      {captchaEnabled && !loaded && (
        <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm text-violet-900">{t('legalShared.captchaPrompt')}</p>
          <Turnstile onToken={onToken} />
        </div>
      )}
      {sections.map((s) => (
        <section key={s} className="space-y-1">
          <h2 className="text-lg font-semibold">{t(`${ns}.${s}.title`)}</h2>
          <p className="whitespace-pre-line text-sm text-gray-700">{t(`${ns}.${s}.body`, vars)}</p>
        </section>
      ))}
    </main>
  )
}
