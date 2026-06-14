// Group avatar picker: two side-by-side cards — generated avatar (left,
// default, with a reroll button) and uploaded image (right, big camera icon;
// tapping it — or dropping a file on it — starts the upload + square-crop
// flow). The selected card is
// highlighted; the cropped image is kept in memory so the user can switch back
// to the avatar and return to the image without re-uploading.

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Cropper, { type Area } from 'react-easy-crop'
import { Camera, Dices, Images, ImageUp } from 'lucide-react'
import { Button, Modal } from '../../components/ui'
import { cropToDataUrl } from '../../lib/cropImage'
import GroupAvatar from './GroupAvatar'

// Touch devices get a gallery/camera chooser: Android's system photo picker
// (the Google Photos UI) has no camera option, so the camera needs its own
// input with `capture`. On fine-pointer devices the file dialog covers both.
const COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export default function AvatarPicker({
  seed,
  image,
  onRollSeed,
  onImageChange,
}: {
  seed: string
  /** Image that will be saved; null → the generated avatar is used. */
  image: string | null
  onRollSeed: () => void
  onImageChange: (image: string | null) => void
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [sourceOpen, setSourceOpen] = useState(false) // gallery/camera chooser
  // last cropped image: switching to avatar mode doesn't discard it
  const [cached, setCached] = useState<string | null>(image)
  const [raw, setRaw] = useState<string | null>(null) // image being cropped
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPx, setAreaPx] = useState<Area | null>(null)
  const [cropping, setCropping] = useState(false)
  const [dragging, setDragging] = useState(false)
  const mode: 'avatar' | 'image' = image ? 'image' : 'avatar'

  const cardCls = (selected: boolean) =>
    `flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 transition ${
      selected ? 'border-violet-600 bg-violet-50' : 'border-gray-200 bg-white hover:border-violet-300'
    }`

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
      const cropped = await cropToDataUrl(raw, areaPx)
      setCached(cropped)
      onImageChange(cropped)
      setRaw(null)
    } finally {
      setCropping(false)
    }
  }

  // open the gallery/camera chooser on touch devices, the file dialog elsewhere
  const openPicker = () => {
    if (COARSE_POINTER) setSourceOpen(true)
    else fileRef.current?.click()
  }

  const selectImage = () => {
    if (cached) onImageChange(cached)
    else openPicker()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    pickFile(file)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {/* generated avatar (default) */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={mode === 'avatar'}
          onClick={() => onImageChange(null)}
          onKeyDown={(e) => e.key === 'Enter' && onImageChange(null)}
          className={cardCls(mode === 'avatar')}
        >
          <span className="text-xs font-semibold uppercase text-gray-600">
            {t('group.modeAvatar')}
          </span>
          <GroupAvatar seed={seed} size={64} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onImageChange(null)
              onRollSeed()
            }}
            className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
          >
            <Dices size={15} /> {t('group.regenerateAvatar')}
          </button>
        </div>

        {/* uploaded image */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={mode === 'image'}
          onClick={selectImage}
          onKeyDown={(e) => e.key === 'Enter' && selectImage()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => {
            // ignore leave events fired when the cursor crosses a child node
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={onDrop}
          className={`${cardCls(mode === 'image')} ${
            dragging ? 'border-dashed !border-violet-600 !bg-violet-100' : ''
          }`}
        >
          <span className="text-xs font-semibold uppercase text-gray-600">
            {t('group.modeImage')}
          </span>
          {cached ? (
            <>
              <img src={cached} alt="" width={64} height={64} style={{ borderRadius: 14 }} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  openPicker()
                }}
                className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
              >
                <ImageUp size={15} /> {t('group.changeImage')}
              </button>
            </>
          ) : (
            <>
              <Camera size={40} className="text-violet-400" aria-hidden />
              <span className="text-sm text-violet-700">{t('group.uploadImage')}</span>
            </>
          )}
        </div>
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
      {/* capture bypasses the system photo picker and opens the camera */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <Modal open={sourceOpen} onClose={() => setSourceOpen(false)} title={t('group.pickSourceTitle')}>
        <div className="space-y-2">
          <Button
            variant="secondary"
            className="flex w-full items-center justify-center gap-2"
            onClick={() => {
              setSourceOpen(false)
              fileRef.current?.click()
            }}
          >
            <Images size={18} /> {t('group.fromGallery')}
          </Button>
          <Button
            variant="secondary"
            className="flex w-full items-center justify-center gap-2"
            onClick={() => {
              setSourceOpen(false)
              cameraRef.current?.click()
            }}
          >
            <Camera size={18} /> {t('group.fromCamera')}
          </Button>
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
