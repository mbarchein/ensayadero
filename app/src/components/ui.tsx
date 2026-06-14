import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost'
}) {
  const styles = {
    primary: 'bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-300',
    secondary: 'bg-violet-100 text-violet-800 hover:bg-violet-200',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-300',
    ghost: 'text-violet-700 hover:bg-violet-50',
  }
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Badge({
  color,
  children,
}: {
  color: 'green' | 'amber' | 'red' | 'gray' | 'violet'
  children: ReactNode
}) {
  const styles = {
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-700',
    violet: 'bg-violet-100 text-violet-800',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[color]}`}>
      {children}
    </span>
  )
}

// Fallback avatar: initials over a color picked from a palette by hashing the
// name — "random" but stable per user.
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
export function InitialsAvatar({ name, size = 56 }: { name: string; size?: number }) {
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
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
        AVATAR_COLORS[h % AVATAR_COLORS.length]
      }`}
    >
      {initials}
    </div>
  )
}

/** Password field with a show/hide toggle. Style props apply to the input. */
export function PasswordInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`w-full pr-10 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        title={visible ? t('common.hidePassword') : t('common.showPassword')}
        aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-gray-600"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

// The phone/browser back button closes an open modal/overlay: opening pushes a
// history entry; back pops it (→ onClose); closing from the UI consumes the
// entry — but only when it is still the top one (a navigation or another
// overlay may already have pushed on top of it).
let overlaySeq = 0
export function useBackClose(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const idRef = useRef<number | null>(null)

  useEffect(() => {
    const onPop = () => {
      if (idRef.current != null) {
        idRef.current = null
        onCloseRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // React to open/close TRANSITIONS, with no effect cleanup: StrictMode's
  // double-invoked effects would otherwise push+pop+push and the async pop
  // would swallow the fresh entry, closing the overlay by itself.
  useEffect(() => {
    if (active && idRef.current == null) {
      idRef.current = ++overlaySeq
      // carry react-router's state (idx in particular) into the overlay entry:
      // a plain state object would reset the router's history index and break
      // the history-aware BackButton after visiting any modal
      const cur = (window.history.state ?? {}) as { idx?: number }
      window.history.pushState({ ...cur, idx: (cur.idx ?? 0) + 1, overlay: idRef.current }, '')
    } else if (!active && idRef.current != null) {
      const id = idRef.current
      idRef.current = null
      // consume our entry only if it is still the top one (a navigation or
      // another overlay may have pushed on top meanwhile)
      if ((window.history.state as { overlay?: number } | null)?.overlay === id) {
        window.history.back()
      }
    }
  }, [active])
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useBackClose(open, onClose)

  if (!open) return null
  // Portal to <body>: an ancestor with transform/filter/sticky positioning
  // would otherwise become the fixed-position containing block and the
  // backdrop wouldn't cover the whole viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* fixed header; only the body below scrolls */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
    </div>
  )
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm text-gray-500">{message}</p>
      {action}
    </div>
  )
}

// Icon-only back button for the far-left of a page title bar.
// Returns to the previous view in the navigation history when the app has one
// (e.g. session detail opened from the notifications list); `to` is the
// fallback parent route for direct entries (deep link, page reload).
// `onBack` overrides navigation entirely — for in-page "views" that are local
// state rather than history entries (e.g. the agenda's day-edit mode).
export function BackButton({
  to,
  label,
  onBack,
}: {
  to?: string
  label?: string
  onBack?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  // location.key is 'default' only on the very first in-app entry (deep link /
  // fresh tab); anything else means there is in-app history to return to.
  // (More robust than history.state.idx, which third-party pushState entries
  // can corrupt.)
  const goBack = () => {
    if (onBack) onBack()
    else if (location.key !== 'default') navigate(-1)
    else navigate(to ?? '/')
  }
  return (
    <button
      onClick={goBack}
      aria-label={label ?? t('common.back')}
      className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-violet-700 transition hover:bg-violet-50"
    >
      <ArrowLeft size={22} aria-hidden />
    </button>
  )
}

export function Toggle({
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
  // Tap flips the switch; a horizontal swipe sets it by direction (right = on,
  // left = off). We only claim the gesture once it's clearly horizontal, so a
  // vertical drag still scrolls the page (touch-action: pan-y).
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiping = useRef(false)
  const swiped = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    start.current = { x: e.clientX, y: e.clientY }
    swiping.current = false
    swiped.current = false
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || swiping.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* not capturable in some environments */
      }
    } else if (Math.abs(dy) > 6) {
      start.current = null // vertical scroll wins
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const wasSwiping = swiping.current
    start.current = null
    swiping.current = false
    if (wasSwiping) {
      swiped.current = true // suppress the click that follows the release
      const next = dx > 0
      if (next !== checked) onChange(next)
    }
  }

  const reset = () => {
    start.current = null
    swiping.current = false
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onClick={() => {
        if (swiped.current) {
          swiped.current = false // a swipe already handled it
          return
        }
        onChange(!checked)
      }}
      style={{ touchAction: 'pan-y' }}
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
