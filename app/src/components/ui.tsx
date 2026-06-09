import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
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
  return (
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
    </div>
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
