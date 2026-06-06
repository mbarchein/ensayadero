import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { Badge, Button, EmptyState, Modal, Spinner } from '../../components/ui'
import type { MembershipWithGroup, Session, SessionParticipant } from '../../lib/types'

export default function HomePage() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const qc = useQueryClient()
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')

  const createGroup = useMutation({
    mutationFn: async () => {
      // created_by por defecto = auth.uid(); trigger añade al creador como director
      const { error } = await supabase.from('groups').insert({ name: groupName.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      setNewGroupOpen(false)
      setGroupName('')
    },
  })

  const { data: memberships, isLoading } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, groups(*)')
        .eq('user_id', profile!.id)
      if (error) throw error
      return (data as MembershipWithGroup[]).filter((m) => !m.groups.archived_at)
    },
    enabled: !!profile,
  })

  const { data: pending } = useQuery({
    queryKey: ['my-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_participants')
        .select('*, sessions!inner(*)')
        .eq('user_id', profile!.id)
        .eq('response', 'PENDING')
        .eq('sessions.status', 'CONFIRMED')
      if (error) throw error
      return data as (SessionParticipant & { sessions: Session })[]
    },
    enabled: !!profile,
  })

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {t('home.greeting', { name: profile?.name?.split(' ')[0] || '' })}
        </h1>
        <div className="flex items-center gap-3">
          {profile?.platform_role === 'SUPERADMIN' && (
            <Link to="/admin" className="text-sm font-medium text-violet-700 underline">
              {t('home.admin')}
            </Link>
          )}
          <button
            onClick={signOut}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
            title={t('profile.signOut')}
          >
            ⎋ {t('home.signOut')}
          </button>
        </div>
      </header>

      {(pending?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 font-semibold text-amber-900">
            {t('home.pendingTitle', { count: pending!.length })}
          </h2>
          <ul className="space-y-1 text-sm">
            {pending!.map((p) => (
              <li key={p.session_id}>
                <Link to={`/g/${p.sessions.group_id}/sessions/${p.session_id}`} className="text-amber-800 underline">
                  {p.sessions.title} —{' '}
                  {format(parseRange(p.sessions.time_range).start, "EEE d MMM, HH:mm", { locale: dateLocale() })}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('home.myGroups')}</h2>
          <Button onClick={() => setNewGroupOpen(true)}>{t('home.newGroup')}</Button>
        </div>
        {memberships?.length === 0 ? (
          <EmptyState message={t('home.noGroups')} />
        ) : (
          <ul className="space-y-3">
            {memberships?.map((m) => (
              <li key={m.group_id}>
                <Link
                  to={`/g/${m.group_id}`}
                  className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition hover:shadow"
                >
                  <div>
                    <p className="font-medium">{m.groups.name}</p>
                    <Badge color={m.role === 'INSTRUCTOR' ? 'violet' : 'gray'}>
                      {t(`roles.${m.role}`)}
                    </Badge>
                  </div>
                  <span aria-hidden className="text-gray-400">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} title={t('home.newGroupTitle')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            createGroup.mutate()
          }}
        >
          <label className="block text-sm">
            {t('admin.groupName')}
            <input
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder={t('admin.groupNamePlaceholder')}
            />
          </label>
          <p className="text-xs text-gray-500">{t('home.newGroupHint')}</p>
          {createGroup.isError && (
            <p className="text-sm text-red-600">{(createGroup.error as Error).message}</p>
          )}
          <Button type="submit" disabled={createGroup.isPending} className="w-full">
            {createGroup.isPending ? t('admin.creating') : t('home.newGroup')}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
