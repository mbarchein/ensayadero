// Install-the-PWA banner shown on the home page. On Chromium it offers a
// one-tap install via the captured beforeinstallprompt (see installPrompt.ts);
// iOS Safari has no programmatic install, so it shows the Share → "Add to Home
// Screen" hint. Hidden when already running standalone, and dismissible.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import { Button } from '../../components/ui'
import { useInstallPrompt, promptInstall, isIOS, isStandalone } from './installPrompt'

const DISMISS_KEY = 'pwa-install-dismissed'

export default function InstallBanner() {
  const { t } = useTranslation()
  const { canInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (dismissed || isStandalone()) return null
  if (!canInstall && !isIOS) return null // nothing actionable to offer

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const install = async () => {
    if ((await promptInstall()) === 'accepted') dismiss()
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
      <Download size={18} className="shrink-0 text-violet-700" aria-hidden />
      <span className="flex-1 text-violet-900">
        {canInstall ? t('pwa.installHint') : t('pwa.iosHint')}
      </span>
      {canInstall && (
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
