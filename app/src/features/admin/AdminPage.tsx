// Panel superadmin: solo ESTRUCTURA (D2) — grupos, miembros, usuarios.
// Nunca muestra disponibilidades (RLS lo impide además a nivel de datos).

import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Modal, Spinner } from '../../components/ui'
import type { Group, MembershipWithProfile, Profile } from '../../lib/types'

export default function AdminPage() {
  const { profile, loading } = useAuth()
  const qc = useQueryClient()
  const [newGroupOpen, setNewGroupOpen] = useState(false)
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
      // primer instructor por invitación (o membresía directa si ya existe el usuario)
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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-gray-500">
            ‹ Inicio
          </Link>
          <h1 className="text-xl font-bold">Administración</h1>
        </div>
        <Button onClick={() => setNewGroupOpen(true)}>+ Grupo</Button>
      </header>

      <section>
        <h2 className="mb-2 font-semibold">Grupos ({groups?.length ?? 0})</h2>
        <ul className="space-y-2">
          {groups?.map((g) => {
            const ms = membersOf(g.id)
            const instructors = ms.filter((m) => m.role === 'INSTRUCTOR')
            return (
              <li key={g.id} className={`rounded-xl border bg-white p-4 ${g.archived_at ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {g.name} {g.archived_at && <Badge color="gray">Archivado</Badge>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {ms.length} miembros ·{' '}
                      {instructors.length === 0 ? (
                        <span className="font-medium text-red-600">⚠ sin instructor</span>
                      ) : (
                        `instructor: ${instructors.map((i) => i.profiles.name || i.profiles.email).join(', ')}`
                      )}
                    </p>
                  </div>
                  {!g.archived_at && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`¿Archivar "${g.name}"? Dejará de ser visible para sus miembros.`))
                          archiveGroup.mutate(g.id)
                      }}
                    >
                      Archivar
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Usuarios ({users?.length ?? 0})</h2>
        <ul className="space-y-1 text-sm">
          {users?.map((u) => {
            const ms = memberships?.filter((m) => m.user_id === u.id) ?? []
            return (
              <li key={u.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span>
                  {u.name || u.email}{' '}
                  {u.platform_role === 'SUPERADMIN' && <Badge color="violet">Superadmin</Badge>}
                </span>
                <span className="text-xs text-gray-500">
                  {ms.length} grupo{ms.length !== 1 ? 's' : ''}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <Modal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} title="Nuevo grupo">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            createGroup.mutate()
          }}
        >
          <label className="block text-sm">
            Nombre del grupo
            <input
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="La Tempestad — montaje 2026"
            />
          </label>
          <label className="block text-sm">
            Email del instructor inicial (opcional)
            <input
              type="email"
              value={instructorEmail}
              onChange={(e) => setInstructorEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="instructor@ejemplo.com"
            />
            <span className="text-xs text-gray-500">
              Si no tiene cuenta, se le enviará invitación con rol Instructor.
            </span>
          </label>
          {createGroup.isError && (
            <p className="text-sm text-red-600">{(createGroup.error as Error).message}</p>
          )}
          <Button type="submit" disabled={createGroup.isPending} className="w-full">
            {createGroup.isPending ? 'Creando…' : 'Crear grupo'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
