// Standalone page to create a group (was a modal on the home page).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dices } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { randomPlay } from '../../lib/plays'
import { BackButton, Button } from '../../components/ui'
import GroupAvatar from './GroupAvatar'

export default function NewGroupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [placeholder] = useState(randomPlay) // random famous play
  // avatar follows the typed name until the user rolls a custom seed
  const [customSeed, setCustomSeed] = useState<string | null>(null)
  const seed = customSeed ?? (name || placeholder)

  const createGroup = useMutation({
    mutationFn: async () => {
      // created_by defaults to auth.uid(); trigger adds the creator as director
      const { error } = await supabase
        .from('groups')
        .insert({ name: name.trim(), avatar_seed: seed })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      navigate('/', { replace: true })
    },
  })

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-center gap-3">
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
        <div className="flex flex-col items-center gap-2">
          <GroupAvatar seed={seed} size={72} />
          <button
            type="button"
            onClick={() => setCustomSeed(`${Date.now()}-${Math.floor(Math.random() * 1e9)}`)}
            className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
          >
            <Dices size={15} /> {t('group.regenerateAvatar')}
          </button>
        </div>
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
        <p className="text-xs text-gray-500">{t('home.newGroupHint')}</p>
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
