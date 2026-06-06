import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { enablePush } from '../../lib/push'
import { Button } from '../../components/ui'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { profile, signOut, refreshProfile } = useAuth()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [savedAt, setSavedAt] = useState(false)
  useEffect(() => {
    setName(profile?.name ?? '')
    setPhone(profile?.phone ?? '')
  }, [profile])

  const saveDetails = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim(), phone: phone.trim() || null })
        .eq('id', profile!.id)
      if (error) throw error
      await refreshProfile()
    },
    onSuccess: () => {
      setSavedAt(true)
      setTimeout(() => setSavedAt(false), 2000)
    },
  })
  const dirty = name.trim() !== (profile?.name ?? '') || phone.trim() !== (profile?.phone ?? '')

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
        <p className="text-sm text-gray-500">{profile?.email}</p>
      </div>

      <form
        className="space-y-3 rounded-xl border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault()
          saveDetails.mutate()
        }}
      >
        <label className="block text-sm">
          {t('profile.name')}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          {t('profile.phone')}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="+34 600 000 000"
          />
        </label>
        {saveDetails.isError && (
          <p className="text-sm text-red-600">{(saveDetails.error as Error).message}</p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || saveDetails.isPending}>
            {saveDetails.isPending ? t('profile.savingDetails') : t('common.save')}
          </Button>
          {savedAt && <span className="text-sm text-green-600">{t('profile.detailsSaved')}</span>}
        </div>
      </form>

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
