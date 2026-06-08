import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { dateLocale } from '../../lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseRange } from '../../lib/ranges'
import { randomPlay } from '../../lib/plays'
import { KeyRound, Plus } from 'lucide-react'
import { Badge, Button, Modal, Spinner } from '../../components/ui'
import GroupAvatar from './GroupAvatar'
import { roleLabel } from '../../lib/roleLabel'
import type { MembershipWithGroup, Session, SessionParticipant } from '../../lib/types'

export default function HomePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [placeholder, setPlaceholder] = useState(randomPlay)
  const openNewGroup = () => {
    setPlaceholder(randomPlay()) // random famous play each time it opens
    setNewGroupOpen(true)
  }

  const createGroup = useMutation({
    mutationFn: async () => {
      // created_by defaults to auth.uid(); trigger adds the creator as director
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
    <div className="space-y-6 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-white px-4 py-2">
        <h1 className="text-2xl font-bold">
          {t('home.greeting', { name: profile?.name?.split(' ')[0] || '' })}
        </h1>
        {profile?.platform_role === 'SUPERADMIN' && (
          <Link to="/admin" className="text-sm font-medium text-violet-700 underline">
            {t('home.admin')}
          </Link>
        )}
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('home.myGroups')}</h2>

        {memberships?.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{t('home.noGroups')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="flex items-center gap-2 font-semibold text-violet-900">
                  <KeyRound size={18} /> {t('home.joinByCode')}
                </p>
                <p className="flex-1 text-sm text-violet-800">{t('home.joinByCodeHint')}</p>
                <Button
                  variant="secondary"
                  className="inline-flex items-center justify-center gap-1.5"
                  onClick={() => navigate('/join')}
                >
                  <KeyRound size={16} /> {t('home.joinByCode')}
                </Button>
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="flex items-center gap-2 font-semibold text-violet-900">
                  <Plus size={18} /> {t('home.newGroup')}
                </p>
                <p className="flex-1 text-sm text-violet-800">{t('home.newGroupExplain')}</p>
                <Button
                  className="inline-flex items-center justify-center gap-1.5"
                  onClick={openNewGroup}
                >
                  <Plus size={16} /> {t('home.newGroup')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {memberships?.map((m) => (
                <li key={m.group_id}>
                  <Link
                    to={`/g/${m.group_id}`}
                    className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition hover:shadow"
                  >
                    <div className="flex items-center gap-3">
                      <GroupAvatar seed={m.groups.avatar_seed || m.group_id} />
                      <div>
                        <p className="font-medium">{m.groups.name}</p>
                        <Badge color={m.role === 'INSTRUCTOR' ? 'violet' : 'gray'}>
                          {roleLabel(t, m.role, profile?.gender)}
                        </Badge>
                      </div>
                    </div>
                    <span aria-hidden className="text-gray-400">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="secondary"
                className="inline-flex items-center gap-1.5"
                onClick={() => navigate('/join')}
              >
                <KeyRound size={16} /> {t('home.joinByCode')}
              </Button>
              <Button className="inline-flex items-center gap-1.5" onClick={openNewGroup}>
                <Plus size={16} /> {t('home.newGroup')}
              </Button>
            </div>
          </>
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
              placeholder={placeholder}
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
