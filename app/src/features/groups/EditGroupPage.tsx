// Standalone page to edit the group name and regenerate its avatar
// (was a modal; instructor only).

import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dices } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BackButton, Button, Spinner } from '../../components/ui'
import GroupAvatar from './GroupAvatar'
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
  // local seed; "regenerate" sets a new random one, persisted on save
  const [seed, setSeed] = useState(group.avatar_seed || group.id)

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_group_meta', {
        gid: group.id,
        new_name: name,
        new_seed: seed,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', group.id] })
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      navigate(`/g/${group.id}`, { replace: true })
    },
  })

  const regenerate = () => setSeed(`${group.id}-${Math.floor(Math.random() * 1e9)}`)

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-center gap-3">
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
        <div className="flex flex-col items-center gap-2">
          <GroupAvatar seed={seed} size={72} />
          <button
            type="button"
            onClick={regenerate}
            className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
          >
            <Dices size={15} /> {t('group.regenerateAvatar')}
          </button>
        </div>
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
