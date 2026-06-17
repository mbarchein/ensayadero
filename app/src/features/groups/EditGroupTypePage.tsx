// Standalone screen to change a group's type (reached from Edit group → type
// row). Saving returns to the edit screen. Instructor only.

import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { BackButton, Spinner } from '../../components/ui'
import GroupTypeField from './GroupTypeField'
import { useGroup } from './useGroup'
import type { GroupType } from '../../lib/types'

export default function EditGroupTypePage() {
  const { group, isInstructor, loading } = useGroup()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: async (next: GroupType) => {
      const { error } = await supabase.rpc('update_group_meta', {
        gid: group!.id,
        new_name: group!.name,
        new_seed: group!.avatar_seed ?? group!.id,
        new_image: group!.avatar_image,
        new_type: next,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', group!.id] })
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      navigate(`/g/${group!.id}/edit`, { replace: true })
    },
  })

  if (loading || !group) return <Spinner />
  if (!isInstructor) return <Navigate to={`/g/${group.id}`} replace />

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to={`/g/${group.id}/edit`} />
        <h1 className="text-xl font-bold">{t('group.typeLabel')}</h1>
      </header>
      <GroupTypeField value={group.group_type} onChange={(v) => save.mutate(v)} hideLabel />
      {save.isError && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
    </div>
  )
}
