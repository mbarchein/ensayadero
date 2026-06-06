// Editar nombre del grupo y regenerar su avatar (solo director).

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dices } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button, Modal } from '../../components/ui'
import GroupAvatar from './GroupAvatar'
import type { Group } from '../../lib/types'

export default function EditGroupModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(group.name)
  // semilla local; "regenerar" pone una nueva aleatoria, se persiste al guardar
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
      onClose()
    },
  })

  const regenerate = () =>
    setSeed(`${group.id}-${Math.floor(Math.random() * 1e9)}`)

  return (
    <Modal open onClose={onClose} title={t('group.editGroup')}>
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
    </Modal>
  )
}
