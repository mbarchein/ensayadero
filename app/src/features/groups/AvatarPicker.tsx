// Group avatar picker: generated avatar (DiceBear seed + dice to reroll) or an
// uploaded image, cropped to a centered square with user-controlled zoom/pan
// (react-easy-crop keeps the selection inside the image bounds).

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Cropper, { type Area } from 'react-easy-crop'
import { Dices, ImageUp } from 'lucide-react'
import { Button, Modal } from '../../components/ui'
import { cropToDataUrl } from '../../lib/cropImage'
import GroupAvatar from './GroupAvatar'

export default function AvatarPicker({
  seed,
  image,
  onRollSeed,
  onImageChange,
}: {
  seed: string
  image: string | null
  /** Reroll the generated avatar (also switches back from an uploaded image). */
  onRollSeed: () => void
  onImageChange: (image: string | null) => void
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState<string | null>(null) // image being cropped
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPx, setAreaPx] = useState<Area | null>(null)
  const [cropping, setCropping] = useState(false)

  const pickFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setAreaPx(null)
      setRaw(String(reader.result))
    }
    reader.readAsDataURL(file)
  }

  const confirmCrop = async () => {
    if (!raw || !areaPx) return
    setCropping(true)
    try {
      onImageChange(await cropToDataUrl(raw, areaPx))
      setRaw(null)
    } finally {
      setCropping(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {image ? (
        <img src={image} alt="" width={72} height={72} style={{ borderRadius: 16 }} />
      ) : (
        <GroupAvatar seed={seed} size={72} />
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => {
            onImageChange(null)
            onRollSeed()
          }}
          className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
        >
          <Dices size={15} /> {t('group.regenerateAvatar')}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
        >
          <ImageUp size={15} /> {t('group.uploadImage')}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0])
          e.target.value = '' // allow re-picking the same file
        }}
      />

      <Modal open={!!raw} onClose={() => setRaw(null)} title={t('group.cropTitle')}>
        <div className="space-y-4">
          <div className="relative h-72 overflow-hidden rounded-lg bg-gray-900">
            {raw && (
              <Cropper
                image={raw}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, px) => setAreaPx(px)}
              />
            )}
          </div>
          <label className="block text-sm text-gray-600">
            {t('group.cropZoom')}
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full accent-violet-600"
            />
          </label>
          <Button onClick={confirmCrop} disabled={!areaPx || cropping} className="w-full">
            {t('group.cropConfirm')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
