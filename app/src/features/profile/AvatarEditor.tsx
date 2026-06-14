// Editable profile avatar: the photo (or initials) with a small edit badge.
// Tapping opens a menu to pick from the gallery / camera (square-cropped) or
// remove it (falling back to initials). Stored as a small data URL in
// profiles.avatar_url, like group avatars.

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Cropper, { type Area } from 'react-easy-crop'
import { Camera, Images, Pencil, Trash2 } from 'lucide-react'
import { Button, InitialsAvatar, Modal } from '../../components/ui'
import { cropToDataUrl } from '../../lib/cropImage'

export default function AvatarEditor({
  name,
  image,
  onChange,
  pending,
  size = 56,
  autoOpen = false,
}: {
  name: string
  image: string | null
  onChange: (image: string | null) => void
  pending?: boolean
  size?: number
  /** Open the photo modal on mount (e.g. arriving from the "change photo" notice). */
  autoOpen?: boolean
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(autoOpen)
  const [raw, setRaw] = useState<string | null>(null)
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
      onChange(await cropToDataUrl(raw, areaPx))
      setRaw(null)
    } finally {
      setCropping(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        disabled={pending}
        aria-label={t('profile.changePhoto')}
        className="relative shrink-0 rounded-full"
        style={{ width: size, height: size }}
      >
        {image ? (
          <img src={image} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <InitialsAvatar name={name} size={size} />
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-white">
          <Pencil size={12} />
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={t('profile.photoTitle')}>
        <div className="space-y-4">
          {/* current avatar, large */}
          <div className="flex justify-center">
            {image ? (
              <img src={image} alt="" className="h-32 w-32 rounded-full object-cover" />
            ) : (
              <InitialsAvatar name={name} size={128} />
            )}
          </div>
          <div className="space-y-2">
            <Button
              variant="secondary"
              className="flex w-full items-center justify-center gap-2"
              onClick={() => {
                setMenuOpen(false)
                fileRef.current?.click()
              }}
            >
              <Images size={18} /> {t('group.fromGallery')}
            </Button>
            <Button
              variant="secondary"
              className="flex w-full items-center justify-center gap-2"
              onClick={() => {
                setMenuOpen(false)
                cameraRef.current?.click()
              }}
            >
              <Camera size={18} /> {t('group.fromCamera')}
            </Button>
            {image && (
              <Button
                variant="ghost"
                className="flex w-full items-center justify-center gap-2 text-red-600"
                onClick={() => {
                  setMenuOpen(false)
                  onChange(null)
                }}
              >
                <Trash2 size={18} /> {t('profile.removePhoto')}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={!!raw} onClose={() => setRaw(null)} title={t('group.cropTitle')}>
        <div className="space-y-4">
          <div className="relative h-72 overflow-hidden rounded-lg bg-gray-900">
            {raw && (
              <Cropper
                image={raw}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
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
    </>
  )
}
