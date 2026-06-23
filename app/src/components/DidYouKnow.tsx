// Rotating "Did you know…?" card for the home page: shows one random app tip
// with a way to reach the matching section, and prev/next to cycle. Facts and
// CTA labels live under "home.didYouKnow".
//
// Two kinds of facts:
//  - global: a single CTA link (to a fixed route).
//  - per-group: clickable group thumbnails, each opening that group's section
//    (members, planner…). Director facts only list groups where the user is
//    INSTRUCTOR; they're hidden when there are none.
//
// The last shown tip is remembered per user so a reload/return advances to the
// next one.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { tg } from '../lib/glossary'
import GroupAvatar from '../features/groups/GroupAvatar'
import type { GroupRole } from '../lib/types'

type GroupThumb = {
  id: string
  name: string
  role: GroupRole
  avatar_seed: string | null
  avatar_image: string | null
}

type Fact = {
  id: string
  director?: boolean
  // global fact: a single CTA link
  cta?: string
  to?: string
  state?: Record<string, unknown>
  // per-group fact: render clickable group thumbnails, each → groupPath(id)
  groupPath?: (groupId: string) => string
}

const FACTS: Fact[] = [
  { id: 'multiLogin', cta: 'profile', to: '/profile' },
  { id: 'setPassword', cta: 'profile', to: '/profile' },
  { id: 'createGroup', cta: 'createGroup', to: '/new-group' },
  { id: 'profilePhoto', cta: 'profile', to: '/profile', state: { openAvatar: true } },
  { id: 'agendaViews', cta: 'agenda', to: '/upcoming' },
  { id: 'emailPrefs', cta: 'emailPrefs', to: '/profile' },
  { id: 'members', groupPath: (g) => `/g/${g}/members` },
  { id: 'calendar', cta: 'agenda', to: '/upcoming' },
  { id: 'archiveNotifications', cta: 'notifications', to: '/notifications' },
  { id: 'rsvpChange', groupPath: (g) => `/g/${g}` },
  { id: 'namePronoun', cta: 'profile', to: '/profile' },
  { id: 'joinCode', cta: 'join', to: '/join' },
  { id: 'install', cta: 'profile', to: '/profile' },
  { id: 'deviceAlerts', cta: 'emailPrefs', to: '/profile' },
  { id: 'availability', cta: 'availability', to: '/availability' },
  { id: 'resetTips', cta: 'profile', to: '/profile' },
  { id: 'slotAvailability', director: true, groupPath: (g) => `/g/${g}/planner` },
  { id: 'convokeSome', director: true, groupPath: (g) => `/g/${g}/planner` },
  { id: 'mandatoryOptional', director: true, groupPath: (g) => `/g/${g}/planner` },
  { id: 'newMemberPolicy', director: true, groupPath: (g) => `/g/${g}/edit` },
]

export default function DidYouKnow({ groups }: { groups: GroupThumb[] }) {
  const { t } = useTranslation()
  const { profile } = useAuth()

  // groups a per-group fact links to: all groups, or just instructor ones
  const groupsFor = (f: Fact) => (f.director ? groups.filter((g) => g.role === 'INSTRUCTOR') : groups)
  const available = FACTS.filter((f) => (f.groupPath ? groupsFor(f).length > 0 : true))
  const count = available.length

  // Resume one past the last fact shown (per user), so a reload/return advances
  // to the next tip instead of repeating. Falls back to the first if unseen.
  const storeKey = `dyk-last:${profile?.id ?? 'anon'}`
  const [index, setIndex] = useState(() => {
    if (!count) return 0
    const last = localStorage.getItem(storeKey)
    const pos = last ? available.findIndex((f) => f.id === last) : -1
    return pos >= 0 ? (pos + 1) % count : 0
  })

  const fact = count ? available[index % count] : null
  useEffect(() => {
    if (fact) localStorage.setItem(storeKey, fact.id)
  }, [fact, storeKey])

  if (!fact) return null

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-violet-900">
          <Lightbulb size={18} className="text-violet-600" aria-hidden />
          {t('home.didYouKnow.title')}
        </h2>
        {count > 1 && (
          <div className="flex items-center gap-1 text-violet-500">
            <button
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              aria-label={t('home.didYouKnow.prev')}
              className="rounded-full p-1 transition hover:bg-violet-100 hover:text-violet-700"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs tabular-nums">
              {(index % count) + 1} / {count}
            </span>
            <button
              onClick={() => setIndex((i) => (i + 1) % count)}
              aria-label={t('home.didYouKnow.next')}
              className="rounded-full p-1 transition hover:bg-violet-100 hover:text-violet-700"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <p className="mt-1 text-sm text-violet-800">
        {tg(t, `home.didYouKnow.facts.${fact.id}`, 'OTHER')}
      </p>
      {fact.groupPath ? (
        <div className="mt-2 flex items-center gap-2">
          {groupsFor(fact)
            .slice(0, 4)
            .map((g) => (
              <Link
                key={g.id}
                to={fact.groupPath!(g.id)}
                title={g.name}
                aria-label={g.name}
                className="rounded-xl ring-violet-400 transition hover:ring-2"
              >
                <GroupAvatar seed={g.avatar_seed || g.id} image={g.avatar_image} size={36} />
              </Link>
            ))}
        </div>
      ) : (
        fact.to && (
          <Link
            to={fact.to}
            state={fact.state}
            className="mt-2 inline-block text-sm font-medium text-violet-700 underline"
          >
            {tg(t, `home.didYouKnow.cta.${fact.cta}`, 'OTHER')}
          </Link>
        )
      )}
    </section>
  )
}
