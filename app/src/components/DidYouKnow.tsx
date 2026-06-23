// Rotating "Did you know…?" card for the home page: shows one random app tip
// with a link to the matching section, and a button to cycle to the next.
// Facts and CTA labels live under "home.didYouKnow". Some facts are per-group
// (link to the user's first group) and some are director-only (link to the
// first group where the user is INSTRUCTOR) — those are hidden otherwise.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { tg } from '../lib/glossary'

type Ctx = { groupId: string | null; instrGroupId: string | null }

type Fact = {
  id: string
  cta: string
  director?: boolean
  to: (c: Ctx) => string | null
  state?: Record<string, unknown>
}

// `to` returning null hides the fact (no group to link to). Director facts link
// to the first instructor group and are dropped when the user isn't a director.
const FACTS: Fact[] = [
  { id: 'multiLogin', cta: 'profile', to: () => '/profile' },
  { id: 'setPassword', cta: 'profile', to: () => '/profile' },
  { id: 'createGroup', cta: 'createGroup', to: () => '/new-group' },
  { id: 'profilePhoto', cta: 'profile', to: () => '/profile', state: { openAvatar: true } },
  { id: 'agendaViews', cta: 'agenda', to: () => '/upcoming' },
  { id: 'emailPrefs', cta: 'emailPrefs', to: () => '/profile' },
  { id: 'members', cta: 'members', to: (c) => (c.groupId ? `/g/${c.groupId}/members` : null) },
  { id: 'calendar', cta: 'agenda', to: () => '/upcoming' },
  { id: 'archiveNotifications', cta: 'notifications', to: () => '/notifications' },
  { id: 'rsvpChange', cta: 'sessions', to: (c) => (c.groupId ? `/g/${c.groupId}` : null) },
  { id: 'namePronoun', cta: 'profile', to: () => '/profile' },
  { id: 'joinCode', cta: 'join', to: () => '/join' },
  { id: 'install', cta: 'profile', to: () => '/profile' },
  { id: 'deviceAlerts', cta: 'emailPrefs', to: () => '/profile' },
  { id: 'availability', cta: 'availability', to: () => '/availability' },
  { id: 'resetTips', cta: 'profile', to: () => '/profile' },
  { id: 'slotAvailability', cta: 'planner', director: true, to: (c) => (c.instrGroupId ? `/g/${c.instrGroupId}/planner` : null) },
  { id: 'convokeSome', cta: 'planner', director: true, to: (c) => (c.instrGroupId ? `/g/${c.instrGroupId}/planner` : null) },
  { id: 'mandatoryOptional', cta: 'planner', director: true, to: (c) => (c.instrGroupId ? `/g/${c.instrGroupId}/planner` : null) },
  { id: 'newMemberPolicy', cta: 'editGroup', director: true, to: (c) => (c.instrGroupId ? `/g/${c.instrGroupId}/edit` : null) },
]

export default function DidYouKnow({ groupId, instrGroupId }: Ctx) {
  const { t } = useTranslation()
  const ctx: Ctx = { groupId, instrGroupId }
  const available = FACTS.filter((f) => (!f.director || instrGroupId) && f.to(ctx) !== null)
  const count = available.length
  const [index, setIndex] = useState(() => (count ? Math.floor(Math.random() * count) : 0))
  if (count === 0) return null

  const fact = available[index % count]
  const to = fact.to(ctx)!

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-violet-900">
          <Lightbulb size={18} className="text-violet-600" aria-hidden />
          {t('home.didYouKnow.title')}
        </h2>
        {count > 1 && (
          <button
            onClick={() => setIndex((i) => (i + 1) % count)}
            aria-label={t('home.didYouKnow.next')}
            className="rounded-full p-1 text-violet-500 transition hover:bg-violet-100 hover:text-violet-700"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-violet-800">
        {tg(t, `home.didYouKnow.facts.${fact.id}`, 'OTHER')}
      </p>
      <Link
        to={to}
        state={fact.state}
        className="mt-2 inline-block text-sm font-medium text-violet-700 underline"
      >
        {tg(t, `home.didYouKnow.cta.${fact.cta}`, 'OTHER')}
      </Link>
    </section>
  )
}
