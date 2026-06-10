import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Trash2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { enablePush } from '../../lib/push'
import { BackButton, Button, Modal } from '../../components/ui'

// Email opt-out groups → notification event types (notification_preferences).
// A switch ON means the email is sent: channel BOTH; OFF → PUSH (in-app/device
// alerts unaffected either way). Display order = key order: sessions first.
// Reminders default OFF for new accounts (seeded by handle_new_user).
const EMAIL_GROUPS = {
  sessions: ['SESSION_CONFIRMED', 'SESSION_CHANGED', 'SESSION_CANCELLED'],
  reminders: ['REMINDER'],
} as const
type EmailGroup = keyof typeof EMAIL_GROUPS

export default function ProfilePage() {
  const { t } = useTranslation()
  const { session, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // sign-in methods linked to the account (Google, Facebook, email+password)
  const providers =
    (session?.user.app_metadata?.providers as string[] | undefined) ??
    (session?.user.app_metadata?.provider ? [session.user.app_metadata.provider] : [])
  const accessMethods = providers
    .map((p) =>
      p === 'google' ? 'Google' : p === 'facebook' ? 'Facebook' : t('profile.accessEmail'),
    )
    .join(' · ')

  // initialize from the (already loaded) profile so the first paint is final —
  // an empty-then-filled effect pass flickers every control on entry
  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [gender, setGender] = useState<'' | 'F' | 'M'>(profile?.gender ?? '')
  const [savedAt, setSavedAt] = useState(false)
  useEffect(() => {
    // keep in sync if the profile refreshes while the page is open
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

  // email notification preferences (default: everything ON)
  const qc = useQueryClient()
  const [prefsSaved, setPrefsSaved] = useState(false)
  const { data: prefs } = useQuery({
    queryKey: ['notification-prefs', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('event_type, channel')
      if (error) throw error
      return data as { event_type: string; channel: 'PUSH' | 'EMAIL' | 'BOTH' | 'NONE' }[]
    },
    enabled: !!profile,
  })
  // ON unless every type in the group has email explicitly disabled
  const emailOn = (group: EmailGroup) =>
    EMAIL_GROUPS[group].some((type) => {
      const ch = prefs?.find((p) => p.event_type === type)?.channel ?? 'BOTH'
      return ch === 'BOTH' || ch === 'EMAIL'
    })
  const savePrefs = useMutation({
    mutationFn: async ({ group, on }: { group: EmailGroup; on: boolean }) => {
      const rows = EMAIL_GROUPS[group].map((event_type) => ({
        user_id: profile!.id,
        event_type,
        channel: on ? ('BOTH' as const) : ('PUSH' as const),
      }))
      const { error } = await supabase.from('notification_preferences').upsert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs', profile?.id] })
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 2000)
    },
  })

  return (
    <div className="space-y-6 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-violet-100 bg-violet-50 px-4 py-2">
        <span className="flex items-center gap-3">
          <BackButton to="/" />
          <h1 className="text-xl font-bold">{t('profile.title')}</h1>
        </span>
        <Button
          variant="ghost"
          onClick={signOut}
          className="inline-flex items-center gap-1.5 text-red-600"
        >
          <LogOut size={18} /> {t('profile.signOut')}
        </Button>
      </header>
      <div className="flex items-center gap-4 rounded-xl border bg-white p-4">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full" />
        ) : (
          <InitialsAvatar name={profile?.name || profile?.email || '?'} />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{profile?.name}</p>
          <p className="truncate text-sm text-gray-500">{profile?.email}</p>
          {accessMethods && (
            <p className="text-xs text-gray-400">{t('profile.accessVia', { methods: accessMethods })}</p>
          )}
        </div>
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
        <div className="text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>{t('profile.gender')}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('profile.gender')}>
              {(
                [
                  ['', '—', t('profile.genderNone')],
                  ['F', t('profile.genderF'), t('profile.genderF')],
                  ['M', t('profile.genderM'), t('profile.genderM')],
                ] as const
              ).map(([value, label, aria]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={gender === value}
                  aria-label={aria}
                  onClick={() => setGender(value)}
                  className={`rounded-full border px-3 py-1 transition ${
                    gender === value
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-violet-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="mt-1 block text-xs text-gray-500">{t('profile.genderHint')}</span>
        </div>
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
        <h2 className="mb-1 font-semibold">{t('profile.emailPrefsTitle')}</h2>
        <p className="mb-3 text-sm text-gray-600">{t('profile.emailPrefsDescription')}</p>
        <div className="space-y-3">
          {(Object.keys(EMAIL_GROUPS) as EmailGroup[]).map((group) => (
            <div key={group} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t(`profile.emailPrefs.${group}`)}</p>
                <p className="text-xs text-gray-500">{t(`profile.emailPrefs.${group}Hint`)}</p>
              </div>
              {prefs ? (
                <Toggle
                  checked={emailOn(group)}
                  disabled={savePrefs.isPending}
                  ariaLabel={t(`profile.emailPrefs.${group}`)}
                  onChange={(on) => savePrefs.mutate({ group, on })}
                />
              ) : (
                // same footprint as the Toggle: no on→off flicker, no reflow
                <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-gray-200" aria-hidden />
              )}
            </div>
          ))}
        </div>
        <p aria-live="polite" className="mt-2 h-4 text-right text-sm text-green-600">
          {prefsSaved ? t('profile.detailsSaved') : ''}
        </p>
      </section>

      {/* hidden until Web Push is configured (VAPID keys, BOOTSTRAP §7) */}
      {!!import.meta.env.VITE_VAPID_PUBLIC_KEY && (
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
      )}

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

// Fallback avatar when the account has no picture: initials over a color
// picked from a palette by hashing the name — "random" but stable per user.
const AVATAR_COLORS = [
  'bg-violet-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
]
function InitialsAvatar({ name }: { name: string }) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  return (
    <div
      aria-hidden
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white ${
        AVATAR_COLORS[h % AVATAR_COLORS.length]
      }`}
    >
      {initials}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
        checked ? 'bg-violet-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
