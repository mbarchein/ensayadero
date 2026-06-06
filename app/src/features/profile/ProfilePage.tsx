import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { enablePush } from '../../lib/push'
import { Button } from '../../components/ui'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const [pushState, setPushState] = useState<'idle' | 'ok' | 'fail'>(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'ok' : 'idle',
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('profile.title')}</h1>
      <div className="flex items-center gap-4 rounded-xl border bg-white p-4">
        {profile?.avatar_url && <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-full" />}
        <div>
          <p className="font-medium">{profile?.name}</p>
          <p className="text-sm text-gray-500">{profile?.email}</p>
        </div>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 font-semibold">{t('profile.pushTitle')}</h2>
        <p className="mb-3 text-sm text-gray-600">{t('profile.pushDescription')}</p>
        {pushState === 'ok' ? (
          <p className="text-sm font-medium text-green-700">{t('profile.pushEnabled')}</p>
        ) : (
          <Button onClick={async () => setPushState((await enablePush()) ? 'ok' : 'fail')}>
            {t('profile.pushEnable')}
          </Button>
        )}
        {pushState === 'fail' && (
          <p className="mt-2 text-sm text-red-600">{t('profile.pushError')}</p>
        )}
      </section>

      <Button variant="secondary" onClick={signOut} className="w-full">
        {t('profile.signOut')}
      </Button>
    </div>
  )
}
