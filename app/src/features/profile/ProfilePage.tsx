import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { LogOut, Trash2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { enablePush } from '../../lib/push'
import { Button, Modal } from '../../components/ui'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<'' | 'F' | 'M'>('')
  const [savedAt, setSavedAt] = useState(false)
  useEffect(() => {
    setName(profile?.name ?? '')
    setPhone(profile?.phone ?? '')
    setGender(profile?.gender ?? '')
  }, [profile])

  const saveDetails = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim(), phone: phone.trim() || null, gender: gender || null })
        .eq('id', profile!.id)
      if (error) throw error
      await refreshProfile()
    },
    onSuccess: () => {
      setSavedAt(true)
      setTimeout(() => setSavedAt(false), 2000)
    },
  })
  const dirty =
    name.trim() !== (profile?.name ?? '') ||
    phone.trim() !== (profile?.phone ?? '') ||
    gender !== (profile?.gender ?? '')

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
    },
    onSuccess: () => {
      // go to the public farewell screen first, then clear the session
      navigate('/goodbye', { replace: true })
      signOut()
    },
  })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [pushState, setPushState] = useState<'idle' | 'ok' | 'fail'>(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'ok' : 'idle',
  )

  return (
    <div className="space-y-6 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-white px-4 py-2">
        <h1 className="text-xl font-bold">{t('profile.title')}</h1>
        <Button
          variant="ghost"
          onClick={signOut}
          className="inline-flex items-center gap-1.5 text-red-600"
        >
          <LogOut size={18} /> {t('profile.signOut')}
        </Button>
      </header>
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
        <label className="block text-sm">
          {t('profile.gender')}
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as '' | 'F' | 'M')}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="">{t('profile.genderNone')}</option>
            <option value="F">{t('profile.genderF')}</option>
            <option value="M">{t('profile.genderM')}</option>
          </select>
          <span className="mt-1 block text-xs text-gray-500">{t('profile.genderHint')}</span>
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

      <section className="rounded-xl border border-red-200 bg-red-50 p-4">
        <h2 className="mb-2 font-semibold text-red-900">{t('profile.dangerZone')}</h2>
        <p className="mb-3 text-sm text-red-800">{t('profile.deleteDescription')}</p>
        <Button
          variant="danger"
          className="inline-flex items-center gap-1.5"
          disabled={deleteAccount.isPending}
          onClick={() => {
            setDeleteText('')
            setDeleteOpen(true)
          }}
        >
          <Trash2 size={16} /> {t('profile.deleteAccount')}
        </Button>
        {deleteAccount.isError && (
          <p className="mt-2 text-sm text-red-700">{(deleteAccount.error as Error).message}</p>
        )}
      </section>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('profile.deleteAccount')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('profile.deleteDescription')}</p>
          <label className="block text-sm">
            {t('profile.deleteConfirm', { keyword: t('profile.deleteKeyword') })}
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder={t('profile.deleteKeyword')}
              autoComplete="off"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              className="inline-flex flex-1 items-center justify-center gap-1.5"
              disabled={
                deleteAccount.isPending ||
                deleteText.trim().toUpperCase() !== t('profile.deleteKeyword').toUpperCase()
              }
              onClick={() => {
                deleteAccount.mutate()
                setDeleteOpen(false)
              }}
            >
              <Trash2 size={16} /> {deleteAccount.isPending ? t('profile.deleting') : t('profile.deleteAccount')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
