// Install-the-PWA banner shown on the home page. On Chromium it captures
// beforeinstallprompt and offers a one-tap install; iOS Safari has no
// programmatic install, so it shows the Share → "Add to Home Screen" hint.
// Hidden when already running standalone, and dismissible (persisted).

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import { Button } from '../../components/ui'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

export default function InstallBanner() {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // keep the mini-infobar away; we show our own UI
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (dismissed || isStandalone()) return null
  if (!prompt && !isIOS) return null // nothing actionable to offer

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null) // the event is single-use
    if (outcome === 'accepted') dismiss()
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
      <Download size={18} className="shrink-0 text-violet-700" aria-hidden />
      <span className="flex-1 text-violet-900">
        {prompt ? t('pwa.installHint') : t('pwa.iosHint')}
      </span>
      {prompt && (
        <Button className="!py-1.5" onClick={install}>
          {t('pwa.installBtn')}
        </Button>
      )}
      <button
        onClick={dismiss}
        aria-label={t('common.close')}
        className="p-1 text-violet-400 hover:text-violet-700"
      >
        <X size={16} />
      </button>
    </div>
  )
}
