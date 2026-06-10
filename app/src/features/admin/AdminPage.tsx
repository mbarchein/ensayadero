// Superadmin panel: STRUCTURE only (D2) — groups, members, users.
// Never shows availabilities (RLS also prevents it at the data level).

import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { randomPlay } from '../../lib/plays'
import { Badge, BackButton, Button, Modal, Spinner } from '../../components/ui'
import type { Group, MembershipWithProfile, Profile } from '../../lib/types'

export default function AdminPage() {
  const { t } = useTranslation()
  const { profile, loading } = useAuth()
  const qc = useQueryClient()
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState(randomPlay)
  const openNewGroup = () => {
    setPlaceholder(randomPlay())
    setNewGroupOpen(true)
  }
  const [groupName, setGroupName] = useState('')
  const [instructorEmail, setInstructorEmail] = useState('')

  const { data: groups } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('*').order('created_at')
      if (error) throw error
      return data as Group[]
    },
    enabled: profile?.platform_role === 'SUPERADMIN',
  })

  const { data: memberships } = useQuery({
    queryKey: ['admin-memberships'],
    queryFn: async () => {
      const { data, error } = await supabase.from('memberships').select('*, profiles(*)')
      if (error) throw error
      return data as MembershipWithProfile[]
    },
    enabled: profile?.platform_role === 'SUPERADMIN',
  })

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at')
      if (error) throw error
      return data as Profile[]
    },
    enabled: profile?.platform_role === 'SUPERADMIN',
  })

  const createGroup = useMutation({
    mutationFn: async () => {
      const { data: group, error } = await supabase
        .from('groups')
        .insert({ name: groupName })
        .select()
        .single()
      if (error) throw error
      await supabase.from('audit_log').insert({
        actor_id: profile!.id,
        action: 'CREATE_GROUP',
        target_type: 'group',
        target_id: group.id,
      })
      // first instructor by invitation (or direct membership if the user already exists)
      const email = instructorEmail.trim().toLowerCase()
      if (email) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        if (existing) {
          await supabase
            .from('memberships')
            .insert({ user_id: existing.id, group_id: group.id, role: 'INSTRUCTOR' })
        } else {
          const { data: inv } = await supabase
            .from('invitations')
            .insert({ group_id: group.id, email, role: 'INSTRUCTOR', created_by: profile!.id })
            .select('id')
            .single()
          if (inv) {
            supabase.functions.invoke('send-notifications', { body: { invitation_id: inv.id } }).catch(() => {})
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] })
      qc.invalidateQueries({ queryKey: ['admin-memberships'] })
      setNewGroupOpen(false)
      setGroupName('')
      setInstructorEmail('')
    },
  })

  const archiveGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from('groups')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', groupId)
      if (error) throw error
      await supabase.from('audit_log').insert({
        actor_id: profile!.id,
        action: 'ARCHIVE_GROUP',
        target_type: 'group',
        target_id: groupId,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-groups'] }),
  })

  if (loading) return <Spinner />
  if (profile?.platform_role !== 'SUPERADMIN') return <Navigate to="/" replace />

  const membersOf = (gid: string) => memberships?.filter((m) => m.group_id === gid) ?? []

  return (
    <div className="space-y-6 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-violet-100 bg-violet-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <BackButton to="/" />
          <h1 className="text-xl font-bold">{t('admin.title')}</h1>
        </div>
        <Button onClick={openNewGroup}>{t('admin.newGroup')}</Button>
      </header>

      <section>
        <h2 className="mb-2 font-semibold">{t('admin.groups', { count: groups?.length ?? 0 })}</h2>
        <ul className="space-y-2">
          {groups?.map((g) => {
            const ms = membersOf(g.id)
            const instructors = ms.filter((m) => m.role === 'INSTRUCTOR')
            return (
              <li key={g.id} className={`rounded-xl border bg-white p-4 ${g.archived_at ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {g.name} {g.archived_at && <Badge color="gray">{t('admin.archived')}</Badge>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t('admin.members', { count: ms.length })} ·{' '}
                      {instructors.length === 0 ? (
                        <span className="font-medium text-red-600">{t('admin.noDirector')}</span>
                      ) : (
                        t('admin.directorLabel', {
                          names: instructors.map((i) => i.profiles.name || i.profiles.email).join(', '),
                        })
                      )}
                    </p>
                  </div>
                  {!g.archived_at && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirm(t('admin.archiveConfirm', { name: g.name }))) archiveGroup.mutate(g.id)
                      }}
                    >
                      {t('admin.archive')}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">{t('admin.users', { count: users?.length ?? 0 })}</h2>
        <ul className="space-y-1 text-sm">
          {users?.map((u) => {
            const ms = memberships?.filter((m) => m.user_id === u.id) ?? []
            return (
              <li key={u.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span>
                  {u.name || u.email}{' '}
                  {u.platform_role === 'SUPERADMIN' && <Badge color="violet">{t('roles.SUPERADMIN')}</Badge>}
                </span>
                <span className="text-xs text-gray-500">{t('admin.groupsCount', { count: ms.length })}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <Modal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} title={t('admin.newGroupTitle')}>
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
          <label className="block text-sm">
            {t('admin.directorEmail')}
            <input
              type="email"
              value={instructorEmail}
              onChange={(e) => setInstructorEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="directora@ejemplo.com"
            />
            <span className="text-xs text-gray-500">{t('admin.directorEmailHint')}</span>
          </label>
          {createGroup.isError && (
            <p className="text-sm text-red-600">{(createGroup.error as Error).message}</p>
          )}
          <Button type="submit" disabled={createGroup.isPending} className="w-full">
            {createGroup.isPending ? t('admin.creating') : t('admin.createGroup')}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
