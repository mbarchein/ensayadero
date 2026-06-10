import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  CheckCircle2,
  XCircle,
  Clock,
  AlarmClock,
  Bell,
  Drama,
  Leaf,
  Megaphone,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BackButton, Button, Spinner } from '../../components/ui'
import type { Notification } from '../../lib/types'
import quotesEs from '../../data/quotes.es.json'
import quotesEn from '../../data/quotes.en.json'

const TYPE_ICON: Record<string, { Icon: LucideIcon; color: string }> = {
  SESSION_CONFIRMED: { Icon: CheckCircle2, color: 'text-green-600' },
  SESSION_CANCELLED: { Icon: XCircle, color: 'text-red-600' },
  SESSION_CHANGED: { Icon: Clock, color: 'text-amber-600' },
  REMINDER: { Icon: AlarmClock, color: 'text-violet-600' },
  NUDGE: { Icon: Megaphone, color: 'text-violet-600' },
}

export default function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()

  // one random famous theatre fragment per visit, in the app's language
  const [quote] = useState(() => {
    const list = i18n.language?.startsWith('en') ? quotesEn : quotesEs
    return list[Math.floor(Math.random() * list.length)]
  })

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*, groups(name)')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as (Notification & { groups: { name: string } | null })[]
    },
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-violet-100 bg-violet-50 px-4 py-2">
        <span className="flex items-center gap-3">
          <BackButton to="/" />
          <h1 className="text-xl font-bold">{t('notifications.title')}</h1>
        </span>
        {notifications?.some((n) => !n.read_at) && (
          <Button variant="ghost" onClick={() => markAllRead.mutate()}>
            {t('notifications.markRead')}
          </Button>
        )}
      </header>

      {notifications?.length === 0 ? (
        /* peaceful empty state: soft gradient backdrop with watermark art */
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-violet-50 via-sky-50 to-emerald-50 px-6 py-20 text-center">
          <Sun
            className="absolute -top-10 -right-10 h-44 w-44 text-amber-100"
            strokeWidth={1}
            aria-hidden
          />
          <Leaf
            className="absolute -bottom-8 -left-8 h-40 w-40 rotate-12 text-emerald-100"
            strokeWidth={1}
            aria-hidden
          />
          <Drama
            className="absolute top-8 left-1/2 h-24 w-24 -translate-x-1/2 text-violet-200"
            strokeWidth={1}
            aria-hidden
          />
          <p className="relative mt-10 text-lg font-semibold text-violet-900">
            {t('notifications.emptyTitle')}
          </p>
          <p className="relative mt-1 text-sm text-violet-700">{t('notifications.empty')}</p>
          <figure className="relative mx-auto mt-8 max-w-md">
            <blockquote className="whitespace-pre-line font-serif text-base italic leading-relaxed text-violet-900">
              “{quote.q}”
            </blockquote>
            <figcaption className="mt-2 text-xs text-violet-600">
              — {quote.w} · {quote.a}
            </figcaption>
          </figure>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications?.map((n) => {
            const meta = TYPE_ICON[n.type]
            const Icon = meta?.Icon ?? Bell
            let typeKey = n.type
            if (n.type === 'SESSION_CHANGED') {
              // distinguish time / place / both based on the payload
              const timeChanged = !!n.payload.old_starts_at
              const locChanged = !!n.payload.old_location
              typeKey = locChanged && timeChanged
                ? 'SESSION_CHANGED_BOTH'
                : locChanged
                  ? 'SESSION_CHANGED_LOCATION'
                  : 'SESSION_CHANGED'
            }
            const label = meta ? t(`notifications.types.${typeKey}`) : n.type
            const starts = n.payload.starts_at ? new Date(String(n.payload.starts_at)) : null
            const inner = (
              <div
                className={`flex gap-3 rounded-xl border p-3 ${n.read_at ? 'bg-white' : 'border-violet-200 bg-violet-50'}`}
              >
                <Icon size={20} className={`mt-0.5 shrink-0 ${meta?.color ?? 'text-gray-500'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  {starts && (
                    <p className="text-xs text-gray-600">
                      {format(starts, "EEEE d MMM · HH:mm", { locale: dateLocale() })}
                      {n.payload.location ? ` · ${n.payload.location}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {n.groups?.name ? `${n.groups.name} · ` : ''}
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: dateLocale() })}
                  </p>
                </div>
              </div>
            )
            const readOnClick = () => {
              if (!n.read_at) markRead.mutate(n.id)
            }
            return (
              <SwipeArchiveRow key={n.id} onArchive={() => archive.mutate(n.id)}>
                {n.payload.session_id && n.group_id ? (
                  <Link to={`/g/${n.group_id}/sessions/${n.payload.session_id}`} onClick={readOnClick}>
                    {inner}
                  </Link>
                ) : n.read_at ? (
                  inner
                ) : (
                  <button type="button" className="w-full text-left" onClick={readOnClick}>
                    {inner}
                  </button>
                )}
              </SwipeArchiveRow>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Swipe the card to the right to archive: the card follows the finger over an
// archive backdrop; past the threshold it slides out and the gap it leaves
// collapses (animated height) before the row is removed. Vertical drags keep
// native scroll; a horizontal drag suppresses the row's click/navigation.
function SwipeArchiveRow({ onArchive, children }: { onArchive: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLLIElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiping = useRef(false)
  const moved = useRef(false)
  const [dx, setDx] = useState(0)
  const [animated, setAnimated] = useState(false) // transition on transform
  const [height, setHeight] = useState<number | null>(null) // collapse phase

  const onPointerDown = (e: React.PointerEvent) => {
    if (height !== null) return // already archiving
    start.current = { x: e.clientX, y: e.clientY }
    swiping.current = false
    moved.current = false
    setAnimated(false)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const ddx = e.clientX - start.current.x
    const ddy = e.clientY - start.current.y
    if (!swiping.current) {
      if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) {
        swiping.current = true
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* not capturable in some environments */
        }
      } else if (Math.abs(ddy) > 10) {
        start.current = null // vertical scroll wins
        return
      } else return
    }
    moved.current = true
    setDx(Math.max(0, ddx)) // only to the right
  }

  // slide the card fully out, then collapse the gap (animated height) and
  // archive — shared by the swipe release and the desktop hover button
  const archiveAnimated = () => {
    const w = ref.current?.offsetWidth ?? 320
    setAnimated(true)
    setDx(w * 1.05)
    setTimeout(() => {
      setHeight(ref.current?.offsetHeight ?? 0)
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)))
      setTimeout(onArchive, 230)
    }, 180)
  }

  const finish = () => {
    if (!start.current && !swiping.current) return
    start.current = null
    if (!swiping.current) return
    swiping.current = false
    const w = ref.current?.offsetWidth ?? 320
    setAnimated(true)
    if (dx > w * 0.35) {
      archiveAnimated()
    } else {
      setDx(0) // not far enough: snap back
    }
  }

  return (
    <li
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={(e) => {
        if (moved.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      className="group relative overflow-hidden"
      style={{
        touchAction: 'pan-y',
        ...(height !== null ? { height, transition: 'height 0.2s ease-out' } : null),
      }}
    >
      {/* archive backdrop revealed while the card slides */}
      <div className="absolute inset-0 flex items-center rounded-xl bg-emerald-500 pl-4 text-white" aria-hidden>
        <Archive size={20} />
      </div>
      <div
        className="relative"
        style={{
          transform: `translateX(${dx}px)`,
          transition: animated ? 'transform 0.18s ease-out' : 'none',
        }}
      >
        {children}
        {/* desktop path: hover (or keyboard focus) reveals an archive button;
            touch devices never hover, they swipe */}
        <button
          type="button"
          title={t('notifications.archive')}
          aria-label={t('notifications.archive')}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            archiveAnimated()
          }}
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-400 opacity-0 shadow-sm transition hover:text-violet-700 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <Archive size={16} />
        </button>
      </div>
    </li>
  )
}
