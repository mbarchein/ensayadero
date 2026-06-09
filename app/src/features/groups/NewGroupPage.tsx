// Standalone page to create a group (was a modal on the home page).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { randomPlay } from '../../lib/plays'
import { BackButton, Button } from '../../components/ui'

export default function NewGroupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [placeholder] = useState(randomPlay) // random famous play

  const createGroup = useMutation({
    mutationFn: async () => {
      // created_by defaults to auth.uid(); trigger adds the creator as director
      const { error } = await supabase.from('groups').insert({ name: name.trim() })
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
