// Standalone page to edit the group name and regenerate its avatar
// (was a modal; instructor only).

import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { BackButton, Button, Spinner } from '../../components/ui'
import AvatarPicker from './AvatarPicker'
import MemberPolicyField from './MemberPolicyField'
import GroupTypeField from './GroupTypeField'
import { useGroup } from './useGroup'
import type { Group, GroupType, MemberInclusionPolicy } from '../../lib/types'

export default function EditGroupPage() {
  const { group, isInstructor, loading } = useGroup()

  if (loading || !group) return <Spinner />
  if (!isInstructor) return <Navigate to={`/g/${group.id}`} replace />
  return <EditGroupForm group={group} />
}

function EditGroupForm({ group }: { group: Group }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(group.name)
  // avatar and policy autosave; the save button only persists the name
  const [seed, setSeed] = useState(group.avatar_seed || group.id)
  const [image, setImage] = useState<string | null>(group.avatar_image)
  const [policy, setPolicy] = useState<MemberInclusionPolicy>(
    group.new_member_policy ?? 'MANDATORY',
  )
  const [type, setType] = useState<GroupType>(group.group_type ?? 'THEATRE')
  const [avatarSaved, setAvatarSaved] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['group', group.id] })
    qc.invalidateQueries({ queryKey: ['my-memberships'] })
  }

  // The save button persists ONLY the name; seed/image/policy autosave on
  // change, so they are passed at their current (already-saved) value here.
  const saveName = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_group_meta', {
        gid: group.id,
        new_name: name,
        new_seed: seed,
        new_image: image,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // avatar/photo autosave: persists seed+image right away, keeping the
  // SERVER name — a half-typed name draft must not be saved as a side effect
  const saveAvatar = useMutation({
    mutationFn: async (next: { seed: string; image: string | null }) => {
      const { error } = await supabase.rpc('update_group_meta', {
        gid: group.id,
        new_name: group.name,
        new_seed: next.seed,
        new_image: next.image,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      setAvatarSaved(true)
      setTimeout(() => setAvatarSaved(false), 2000)
    },
  })

  // policy autosave: keeps the SERVER name for the same reason as the avatar
  const savePolicy = useMutation({
    mutationFn: async (next: MemberInclusionPolicy) => {
      const { error } = await supabase.rpc('update_group_meta', {
        gid: group.id,
        new_name: group.name,
        new_seed: seed,
        new_image: image,
        new_policy: next,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // type autosave: keeps the SERVER name for the same reason as the avatar
  const saveType = useMutation({
    mutationFn: async (next: GroupType) => {
      const { error } = await supabase.rpc('update_group_meta', {
        gid: group.id,
        new_name: group.name,
        new_seed: seed,
        new_image: image,
        new_type: next,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const regenerate = () => {
    const next = `${group.id}-${Math.floor(Math.random() * 1e9)}`
    setSeed(next)
    saveAvatar.mutate({ seed: next, image })
  }
  const changeImage = (next: string | null) => {
    setImage(next)
    saveAvatar.mutate({ seed, image: next })
  }
  const changePolicy = (next: MemberInclusionPolicy) => {
    setPolicy(next)
    savePolicy.mutate(next)
  }
  const changeType = (next: GroupType) => {
    setType(next)
    saveType.mutate(next)
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${group.id}`} />
        <h1 className="text-xl font-bold">{t('group.editGroup')}</h1>
      </header>
      <div className="space-y-4">
        <AvatarPicker seed={seed} image={image} onRollSeed={regenerate} onImageChange={changeImage} />
        <p aria-live="polite" className="h-4 text-right text-sm text-green-600">
          {saveAvatar.isPending ? t('availability.saving') : avatarSaved ? t('availability.saved') : ''}
        </p>
        {saveAvatar.isError && (
          <p className="text-sm text-red-600">{(saveAvatar.error as Error).message}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveName.mutate()
          }}
        >
          <label className="block text-sm">
            {t('admin.groupName')}
            <div className="mt-1 flex gap-2">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
              <Button
                type="submit"
                disabled={saveName.isPending || !name.trim() || name.trim() === group.name}
              >
                {saveName.isPending ? t('availability.saving') : t('common.save')}
              </Button>
            </div>
          </label>
          {saveName.isError && (
            <p className="mt-1 text-sm text-red-600">{(saveName.error as Error).message}</p>
          )}
        </form>
        <div>
          <GroupTypeField value={type} onChange={changeType} />
          {saveType.isError && (
            <p className="mt-1 text-sm text-red-600">{(saveType.error as Error).message}</p>
          )}
        </div>
        <div>
          <MemberPolicyField value={policy} onChange={changePolicy} />
          {savePolicy.isError && (
            <p className="mt-1 text-sm text-red-600">{(savePolicy.error as Error).message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
