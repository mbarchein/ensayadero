// Standalone page to edit the group name and regenerate its avatar
// (was a modal; instructor only).

import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { BackButton, Button, Spinner } from '../../components/ui'
import AvatarPicker from './AvatarPicker'
import { useGroup } from './useGroup'
import type { Group } from '../../lib/types'

export default function EditGroupPage() {
  const { group, isInstructor, loading } = useGroup()

  if (loading || !group) return <Spinner />
  if (!isInstructor) return <Navigate to={`/g/${group.id}`} replace />
  return <EditGroupForm group={group} />
}

function EditGroupForm({ group }: { group: Group }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState(group.name)
  // avatar changes autosave; the save button only persists the name
  const [seed, setSeed] = useState(group.avatar_seed || group.id)
  const [image, setImage] = useState<string | null>(group.avatar_image)
  const [avatarSaved, setAvatarSaved] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['group', group.id] })
    qc.invalidateQueries({ queryKey: ['my-memberships'] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_group_meta', {
        gid: group.id,
        new_name: name,
        new_seed: seed,
        new_image: image,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      navigate(`/g/${group.id}`, { replace: true })
    },
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

  const regenerate = () => {
    const next = `${group.id}-${Math.floor(Math.random() * 1e9)}`
    setSeed(next)
    saveAvatar.mutate({ seed: next, image })
  }
  const changeImage = (next: string | null) => {
    setImage(next)
    saveAvatar.mutate({ seed, image: next })
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${group.id}`} />
        <h1 className="text-xl font-bold">{t('group.editGroup')}</h1>
      </header>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <AvatarPicker seed={seed} image={image} onRollSeed={regenerate} onImageChange={changeImage} />
        <p aria-live="polite" className="h-4 text-right text-sm text-green-600">
          {saveAvatar.isPending ? t('availability.saving') : avatarSaved ? t('availability.saved') : ''}
        </p>
        {saveAvatar.isError && (
          <p className="text-sm text-red-600">{(saveAvatar.error as Error).message}</p>
        )}
        <label className="block text-sm">
          {t('admin.groupName')}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        {save.isError && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <Button type="submit" disabled={save.isPending} className="w-full">
          {save.isPending ? t('admin.creating') : t('common.save')}
        </Button>
      </form>
    </div>
  )
}
