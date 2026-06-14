// List / month view switch, shared by the group sessions and Upcoming views.
import { useTranslation } from 'react-i18next'
import { List, CalendarDays } from 'lucide-react'

export default function ViewToggle({
  value,
  onChange,
}: {
  value: 'list' | 'month'
  onChange: (v: 'list' | 'month') => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex rounded-lg border border-violet-200 p-0.5">
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label={t('sessions.viewList')}
        aria-pressed={value === 'list'}
        className={`rounded-md p-1.5 ${value === 'list' ? 'bg-violet-600 text-white' : 'text-violet-700'}`}
      >
        <List size={18} />
      </button>
      <button
        type="button"
        onClick={() => onChange('month')}
        aria-label={t('sessions.viewMonth')}
        aria-pressed={value === 'month'}
        className={`rounded-md p-1.5 ${value === 'month' ? 'bg-violet-600 text-white' : 'text-violet-700'}`}
      >
        <CalendarDays size={18} />
      </button>
    </div>
  )
}
