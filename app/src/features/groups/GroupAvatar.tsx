// Deterministic geometric avatar per group (DiceBear, "shapes" style).
// Same group id → always the same avatar.

import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { shapes } from '@dicebear/collection'

export default function GroupAvatar({ seed, size = 44 }: { seed: string; size?: number }) {
  const uri = useMemo(
    () => createAvatar(shapes, { seed, size, radius: 12 }).toDataUri(),
    [seed, size],
  )
  return (
    <img
      src={uri}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-xl"
      style={{ width: size, height: size }}
    />
  )
}
