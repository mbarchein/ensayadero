// Friendly multi-step wizard to create a group:
//   1. type → 2. name → 3. image → create → "thanks" screen (share + plan).
// Back steps through the wizard so earlier choices can be edited.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { Shapes, PenLine, ImagePlus, ArrowLeft, ArrowRight, Check, Share2, CalendarPlus, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { tg } from '../../lib/glossary'
import { Button } from '../../components/ui'
import AvatarPicker from './AvatarPicker'
import GroupTypeField from './GroupTypeField'
import GroupAvatar from './GroupAvatar'
import type { GroupType } from '../../lib/types'

type Step = { key: 'type' | 'name' | 'image'; icon: LucideIcon }
const STEPS: Step[] = [
  { key: 'type', icon: Shapes },
  { key: 'name', icon: PenLine },
  { key: 'image', icon: ImagePlus },
]

type Created = { id: string; join_code: string; name: string }

export default function NewGroupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep] = useState(0)
  const [type, setType] = useState<GroupType>('THEATRE')
  const [name, setName] = useState('')
  const [customSeed, setCustomSeed] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const seed = customSeed ?? (name.trim() || 'group')

  const createGroup = useMutation({
    mutationFn: async () => {
      // created_by defaults to auth.uid(); a trigger adds the creator as director.
      // new_member_policy keeps its DB default (editable later from the group).
      const { data, error } = await supabase
        .from('groups')
        .insert({ name: name.trim(), avatar_seed: seed, avatar_image: image, group_type: type })
        .select('id, join_code, name')
        .single()
      if (error) throw error
      return data as Created
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] })
      setCreated(data)
    },
  })

  if (created) return <ThanksScreen created={created} type={type} seed={seed} image={image} />

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const canAdvance = current.key !== 'name' || !!name.trim()
  const Icon = current.icon
  const onBack = () => (step > 0 ? setStep(step - 1) : navigate('/'))

  return (
    <div className="space-y-5 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-violet-100 bg-violet-50 px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('common.back')}
          className="rounded-lg p-1 text-violet-700 hover:bg-violet-100"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold">{t('home.newGroupTitle')}</h1>
      </header>

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
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{t(`wizard.step${cap(current.key)}Sub`)}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (isLast) createGroup.mutate()
          else if (canAdvance) setStep(step + 1)
        }}
      >
        {current.key === 'type' && <GroupTypeField value={type} onChange={setType} hideLabel />}

        {current.key === 'name' && (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder={t('admin.groupName')}
            aria-label={t('admin.groupName')}
          />
        )}

        {current.key === 'image' && (
          <AvatarPicker
            seed={seed}
            image={image}
            onRollSeed={() => setCustomSeed(`${Date.now()}-${Math.floor(Math.random() * 1e9)}`)}
            onImageChange={setImage}
          />
        )}

        {createGroup.isError && <p className="text-sm text-red-600">{(createGroup.error as Error).message}</p>}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            className="inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={16} aria-hidden /> {t('wizard.back')}
          </Button>
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

function ThanksScreen({
  created,
  type,
  seed,
  image,
}: {
  created: Created
  type: GroupType
  seed: string
  image: string | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const link = `${import.meta.env.VITE_APP_URL}/join/${created.join_code}`

  const share = async () => {
    const payload = { title: created.name, text: t('invite.shareText', { group: created.name }), url: link }
    if (navigator.share) {
      try {
        await navigator.share(payload)
      } catch {
        /* cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-2 py-6 text-center">
      <Check size={56} strokeWidth={1.5} className="text-green-600" aria-hidden />
      <div>
        <h1 className="text-2xl font-bold text-violet-900">{t('wizard.doneTitle')}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{t('wizard.doneSub')}</p>
      </div>

      {/* created group summary */}
      <div className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
        <GroupAvatar seed={seed} image={image} />
        <div className="text-left">
          <p className="font-semibold">{created.name}</p>
          <p className="text-sm text-gray-600">{t(`group.type.${type}`)}</p>
        </div>
      </div>

      {/* invite: QR + code + share */}
      <section className="w-full space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
        <p className="text-sm text-violet-900">{t('wizard.inviteHint')}</p>
        <Qr link={link} />
        <p className="font-mono text-2xl font-bold tracking-[0.2em] text-violet-900">{created.join_code}</p>
        <Button onClick={share} className="inline-flex w-full items-center justify-center gap-1.5">
          <Share2 size={16} aria-hidden /> {t('invite.share')}
        </Button>
        {copied && (
          <p aria-live="polite" className="flex items-center justify-center gap-1 text-sm text-green-600">
            <Check size={14} /> {t('invite.copied')}
          </p>
        )}
      </section>

      <div className="flex w-full flex-col gap-2">
        <Button
          onClick={() => navigate(`/g/${created.id}/planner`)}
          className="inline-flex w-full items-center justify-center gap-1.5"
        >
          <CalendarPlus size={16} aria-hidden /> {tg(t, 'wizard.plan', type)}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(`/g/${created.id}`)}
          className="w-full"
        >
          {t('wizard.goToGroup')}
        </Button>
      </div>
    </div>
  )
}

function Qr({ link }: { link: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvasRef.current) QRCode.toCanvas(canvasRef.current, link, { width: 200, margin: 1 }).catch(() => {})
  }, [link])
  return <canvas ref={canvasRef} className="mx-auto rounded-lg bg-white p-2" />
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
