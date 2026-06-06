import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { enablePush } from '../../lib/push'
import { Button } from '../../components/ui'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
      await signOut()
    },
  })
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

      <section className="rounded-xl border border-red-200 bg-red-50 p-4">
        <h2 className="mb-2 font-semibold text-red-900">{t('profile.dangerZone')}</h2>
        <p className="mb-3 text-sm text-red-800">{t('profile.deleteDescription')}</p>
        <Button
          variant="danger"
          disabled={deleteAccount.isPending}
          onClick={() => {
            const word = t('profile.deleteKeyword')
            const typed = prompt(t('profile.deleteConfirm', { keyword: word }))
            if (typed?.trim().toUpperCase() === word.toUpperCase()) deleteAccount.mutate()
          }}
        >
          {deleteAccount.isPending ? t('profile.deleting') : t('profile.deleteAccount')}
        </Button>
        {deleteAccount.isError && (
          <p className="mt-2 text-sm text-red-700">{(deleteAccount.error as Error).message}</p>
        )}
      </section>
    </div>
  )
}
