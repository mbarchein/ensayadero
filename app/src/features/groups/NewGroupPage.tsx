// Standalone page to create a group (was a modal on the home page).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { randomPlay } from '../../lib/plays'
import { BackButton, Button } from '../../components/ui'
import AvatarPicker from './AvatarPicker'
import MemberPolicyField from './MemberPolicyField'
import GroupTypeField from './GroupTypeField'
import type { GroupType, MemberInclusionPolicy } from '../../lib/types'

export default function NewGroupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [placeholder] = useState(randomPlay) // random famous play
  // avatar follows the typed name until the user rolls a custom seed
  const [customSeed, setCustomSeed] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [policy, setPolicy] = useState<MemberInclusionPolicy>('MANDATORY')
  const [type, setType] = useState<GroupType>('THEATRE')
  const seed = customSeed ?? (name || placeholder)

  const createGroup = useMutation({
    mutationFn: async () => {
      // created_by defaults to auth.uid(); trigger adds the creator as director
      const { error } = await supabase
        .from('groups')
        .insert({
          name: name.trim(),
          avatar_seed: seed,
          avatar_image: image,
          new_member_policy: policy,
          group_type: type,
        })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      navigate('/', { replace: true })
    },
  })

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to="/" />
        <h1 className="text-xl font-bold">{t('home.newGroupTitle')}</h1>
      </header>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          createGroup.mutate()
        }}
      >
        <AvatarPicker
          seed={seed}
          image={image}
          onRollSeed={() => setCustomSeed(`${Date.now()}-${Math.floor(Math.random() * 1e9)}`)}
          onImageChange={setImage}
        />
        <label className="block text-sm">
          {t('admin.groupName')}
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder={placeholder}
          />
        </label>
        <p className="text-xs text-gray-600">{t('home.newGroupHint')}</p>
        <GroupTypeField value={type} onChange={setType} />
        <MemberPolicyField value={policy} onChange={setPolicy} />
        {createGroup.isError && (
          <p className="text-sm text-red-600">{(createGroup.error as Error).message}</p>
        )}
        <Button type="submit" disabled={createGroup.isPending} className="w-full">
          {createGroup.isPending ? t('admin.creating') : t('home.newGroup')}
        </Button>
      </form>
    </div>
  )
}
