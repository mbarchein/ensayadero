// Group avatar that opens full screen when tapped. Used in page headers.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lightbox } from '../../components/ui'
import GroupAvatar, { groupAvatarSrc } from './GroupAvatar'

export default function GroupAvatarButton({
  seed,
  image = null,
  size,
}: {
  seed: string
  image?: string | null
  size?: number
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('group.viewAvatar')}
        className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <GroupAvatar seed={seed} image={image} size={size} />
      </button>
      <Lightbox open={open} onClose={() => setOpen(false)} src={groupAvatarSrc(seed, image)} />
    </>
  )
}
