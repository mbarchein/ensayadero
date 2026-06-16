// Friendly multi-step wizard to create a group:
//   1. type → 2. name (random per-type suggestions) → 3. new-member policy → 4. image.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Shapes, PenLine, Users, ImagePlus, Dices, ArrowLeft, ArrowRight, Check, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { randomGroupName } from '../../lib/groupNames'
import { tg } from '../../lib/glossary'
import { BackButton, Button } from '../../components/ui'
import AvatarPicker from './AvatarPicker'
import MemberPolicyField from './MemberPolicyField'
import GroupTypeField from './GroupTypeField'
import type { GroupType, MemberInclusionPolicy } from '../../lib/types'

type Step = { key: 'type' | 'name' | 'policy' | 'image'; icon: LucideIcon }
const STEPS: Step[] = [
  { key: 'type', icon: Shapes },
  { key: 'name', icon: PenLine },
  { key: 'policy', icon: Users },
  { key: 'image', icon: ImagePlus },
]

export default function NewGroupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep] = useState(0)
  const [type, setType] = useState<GroupType>('THEATRE')
  const [name, setName] = useState('')
  const [placeholder, setPlaceholder] = useState(() => randomGroupName('THEATRE'))
  const [customSeed, setCustomSeed] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [policy, setPolicy] = useState<MemberInclusionPolicy>('MANDATORY')
  // avatar follows the typed name (or the suggestion) until a custom seed is rolled
  const seed = customSeed ?? (name.trim() || placeholder)

  // changing type refreshes the name suggestion so it matches the activity
  const chooseType = (v: GroupType) => {
    setType(v)
    setPlaceholder(randomGroupName(v))
  }

  const createGroup = useMutation({
    mutationFn: async () => {
      // created_by defaults to auth.uid(); a trigger adds the creator as director
      const { error } = await supabase.from('groups').insert({
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

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  // the name step requires a name; the others always allow advancing
  const canAdvance = current.key !== 'name' || !!name.trim()
  const Icon = current.icon
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="space-y-5 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <BackButton to="/" />
        <h1 className="text-xl font-bold">{t('home.newGroupTitle')}</h1>
      </header>

      {/* progress dots */}
      <div className="flex justify-center gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s.key}
            className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-violet-600' : 'w-2 bg-violet-200'}`}
          />
        ))}
      </div>

      <div className="text-center">
        <Icon size={48} strokeWidth={1.25} className="mx-auto text-violet-600" aria-hidden />
        <h2 className="mt-3 text-2xl font-bold text-violet-900">{t(`wizard.step${cap(current.key)}`)}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
          {tg(t, `wizard.step${cap(current.key)}Sub`, type)}
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (isLast) createGroup.mutate()
          else if (canAdvance) next()
        }}
      >
        {current.key === 'type' && <GroupTypeField value={type} onChange={chooseType} hideLabel />}

        {current.key === 'name' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder={placeholder}
                aria-label={t('admin.groupName')}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPlaceholder(randomGroupName(type))}
                className="inline-flex items-center gap-1.5 whitespace-nowrap"
                title={t('wizard.shuffle')}
              >
                <Dices size={16} aria-hidden /> {t('wizard.shuffle')}
              </Button>
            </div>
          </div>
        )}

        {current.key === 'policy' && <MemberPolicyField value={policy} onChange={setPolicy} type={type} />}

        {current.key === 'image' && (
          <AvatarPicker
            seed={seed}
            image={image}
            onRollSeed={() => setCustomSeed(`${Date.now()}-${Math.floor(Math.random() * 1e9)}`)}
            onImageChange={setImage}
          />
        )}

        {createGroup.isError && (
          <p className="text-sm text-red-600">{(createGroup.error as Error).message}</p>
        )}

        <div className="flex gap-2 pt-2">
          {step > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={back}
              className="inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft size={16} aria-hidden /> {t('wizard.back')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={!canAdvance || createGroup.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5"
          >
            {isLast ? (
              <>
                <Check size={16} aria-hidden /> {createGroup.isPending ? t('wizard.creating') : t('wizard.create')}
              </>
            ) : (
              <>
                {t('wizard.next')} <ArrowRight size={16} aria-hidden />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
