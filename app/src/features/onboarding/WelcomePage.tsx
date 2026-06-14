// First-login onboarding wizard (/welcome). Shown (via the Layout gate) while
// profiles.onboarded_at is null, regardless of how the account was created
// (Google, email confirmation, future providers). Three steps — identity,
// email notifications, availability pitch — each persisted on advance, so an
// abandoned wizard keeps what was done. "Skip" and both step-3 exits stamp
// onboarded_at; the wizard is an invitation, not a jail.

import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BellRing, CalendarHeart, Download, Drama, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { enablePush } from '../../lib/push'
import { useInstallPrompt, promptInstall } from '../pwa/installPrompt'
import { Button, InitialsAvatar, Spinner, Toggle } from '../../components/ui'
import quotesEs from '../../data/quotes.es.json'
import quotesEn from '../../data/quotes.en.json'

// The install screen only exists when the browser can actually install (see
// screens[] below), so the wizard is 3 or 4 steps depending on the device.
type Screen = 'identity' | 'notifications' | 'install' | 'finish'

const SCREEN_ICON: Record<Screen, LucideIcon> = {
  identity: Drama,
  notifications: BellRing,
  install: Download,
  finish: CalendarHeart,
}
// suffix for the welcome.title<x> / welcome.sub<x> i18n keys, per screen
const SCREEN_KEY: Record<Screen, string> = {
  identity: '0',
  notifications: '1',
  install: 'Install',
  finish: '2',
}

export default function WelcomePage() {
  const { t, i18n } = useTranslation()
  const { session, profile, loading, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [screen, setScreen] = useState<Screen>('identity')
  const [name, setName] = useState(profile?.name ?? '')
  const [gender, setGender] = useState<'F' | 'M' | null>(profile?.gender ?? null)
  const [emailSessions, setEmailSessions] = useState(true)
  const [emailReminders, setEmailReminders] = useState(false) // current signup default
  const [emailMembers, setEmailMembers] = useState(true)
  const [pushState, setPushState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const { canInstall } = useInstallPrompt()

  const [quote] = useState(() => {
    const list = i18n.language?.startsWith('en') ? quotesEn : quotesEs
    return list[Math.floor(Math.random() * list.length)]
  })

  const screens: Screen[] = [
    'identity',
    'notifications',
    ...(canInstall ? (['install'] as Screen[]) : []),
    'finish',
  ]
  const idx = Math.max(0, screens.indexOf(screen))

  const saveIdentity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim(), gender })
        .eq('id', profile!.id)
      if (error) throw error
      await refreshProfile()
    },
    onSuccess: () => setScreen('notifications'),
  })

  const savePrefs = useMutation({
    mutationFn: async () => {
      const rows = [
        ...['SESSION_CONFIRMED', 'SESSION_CHANGED', 'SESSION_CANCELLED'].map((e) => ({
          event_type: e,
          on: emailSessions,
        })),
        { event_type: 'REMINDER', on: emailReminders },
        ...['MEMBER_JOINED', 'MEMBER_PROMOTED'].map((e) => ({ event_type: e, on: emailMembers })),
      ].map(({ event_type, on }) => ({
        user_id: profile!.id,
        event_type,
        channel: on ? ('BOTH' as const) : ('PUSH' as const),
      }))
      const { error } = await supabase.from('notification_preferences').upsert(rows)
      if (error) throw error
    },
    onSuccess: () => setScreen(canInstall ? 'install' : 'finish'),
  })

  const finish = useMutation({
    mutationFn: async (_goAvailability: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', profile!.id)
      if (error) throw error
      await refreshProfile()
    },
    onSuccess: (_, goAvailability: boolean) =>
      navigate(goAvailability ? '/availability' : '/', { replace: true }),
  })

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/" replace />
  if (profile.onboarded_at && !finish.isPending && !finish.isSuccess) {
    return <Navigate to="/" replace />
  }

  const Icon = SCREEN_ICON[screen]
  const busy = saveIdentity.isPending || savePrefs.isPending || finish.isPending

  const install = async () => {
    if ((await promptInstall()) === 'accepted') setScreen('finish')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gradient-to-b from-violet-100 via-violet-50 to-white px-6 pb-8 pt-4">
      <div className="flex items-center justify-between">
        {/* progress dots */}
        <div className="flex gap-1.5" aria-hidden>
          {screens.map((s, i) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all ${
                i === idx ? 'w-6 bg-violet-600' : 'w-2 bg-violet-200'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => finish.mutate(false)}
          disabled={busy}
          className="text-sm text-gray-400 hover:text-violet-700"
        >
          {t('welcome.skip')}
        </button>
      </div>

      <div key={screen} className="flex flex-1 flex-col">
        <div className="mt-10 text-center">
          <Icon size={64} strokeWidth={1.25} className="mx-auto text-violet-600" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold text-violet-900">
            {t(`welcome.title${SCREEN_KEY[screen]}`)}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
            {t(`welcome.sub${SCREEN_KEY[screen]}`)}
          </p>
        </div>

        {screen === 'identity' && (
          <div className="mt-8 space-y-5">
            <div className="flex justify-center">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full shadow" />
              ) : (
                <InitialsAvatar name={name || profile.email} size={64} />
              )}
            </div>
            <label className="block text-sm font-medium">
              {t('welcome.nameLabel')}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal"
              />
            </label>
            <div className="text-sm">
              <p className="font-medium">{t('welcome.pronounLabel')}</p>
              <div className="mt-2 flex gap-2">
                {([
                  ['F', t('welcome.pronounF')],
                  ['M', t('welcome.pronounM')],
                  [null, t('welcome.pronounNone')],
                ] as const).map(([value, label]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setGender(value)}
                    className={`rounded-full border px-4 py-1.5 transition ${
                      gender === value
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-violet-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">{t('welcome.pronounHint')}</p>
            </div>
          </div>
        )}

        {screen === 'notifications' && (
          <div className="mt-8 space-y-4">
            {([
              ['sessions', emailSessions, setEmailSessions],
              ['reminders', emailReminders, setEmailReminders],
              ['members', emailMembers, setEmailMembers],
            ] as const).map(([group, checked, set]) => (
              <div
                key={group}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium">{t(`profile.emailPrefs.${group}`)}</p>
                  <p className="text-xs text-gray-500">{t(`profile.emailPrefs.${group}Hint`)}</p>
                </div>
                <Toggle
                  checked={checked}
                  ariaLabel={t(`profile.emailPrefs.${group}`)}
                  onChange={set}
                />
              </div>
            ))}
            {!!import.meta.env.VITE_VAPID_PUBLIC_KEY && pushState !== 'ok' && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={async () => setPushState((await enablePush()) ? 'ok' : 'fail')}
              >
                {t('welcome.pushBtn')}
              </Button>
            )}
            {pushState === 'ok' && (
              <p className="text-center text-sm text-green-600">{t('welcome.pushOk')}</p>
            )}
          </div>
        )}

        {screen === 'finish' && (
          <figure className="mx-auto mt-10 max-w-sm text-center">
            <blockquote className="whitespace-pre-line font-serif text-base italic leading-relaxed text-violet-900">
              “{quote.q}”
            </blockquote>
            <figcaption className="mt-2 text-xs text-violet-600">
              — {quote.w} · {quote.a}
            </figcaption>
          </figure>
        )}

        <div className="mt-auto space-y-2 pt-10">
          {screen === 'identity' && (
            <Button
              className="w-full"
              disabled={!name.trim() || busy}
              onClick={() => saveIdentity.mutate()}
            >
              {t('welcome.next')}
            </Button>
          )}
          {screen === 'notifications' && (
            <Button className="w-full" disabled={busy} onClick={() => savePrefs.mutate()}>
              {t('welcome.next')}
            </Button>
          )}
          {screen === 'install' && (
            <>
              <Button
                className="inline-flex w-full items-center justify-center gap-2"
                disabled={busy}
                onClick={install}
              >
                <Download size={18} aria-hidden />
                {t('pwa.installApp')}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => setScreen('finish')}
              >
                {t('welcome.later')}
              </Button>
            </>
          )}
          {screen === 'finish' && (
            <>
              <Button className="w-full" disabled={busy} onClick={() => finish.mutate(true)}>
                {t('welcome.ctaAvailability')}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => finish.mutate(false)}
              >
                {t('welcome.later')}
              </Button>
            </>
          )}
          {(saveIdentity.isError || savePrefs.isError || finish.isError) && (
            <p className="text-center text-sm text-red-600">
              {((saveIdentity.error || savePrefs.error || finish.error) as Error).message}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
