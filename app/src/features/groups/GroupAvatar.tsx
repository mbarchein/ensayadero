// Group avatar: the uploaded image when the group has one, otherwise a
// deterministic geometric avatar (DiceBear, "shapes" style) from the seed.

import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { shapes } from '@dicebear/collection'

export default function GroupAvatar({
  seed,
  image = null,
  size = 44,
}: {
  seed: string
  image?: string | null
  size?: number
}) {
  const uri = useMemo(
    () => createAvatar(shapes, { seed, size, radius: 12 }).toDataUri(),
    [seed, size],
  )
  return (
    <img
      src={image ?? uri}
      alt=""
      width={size}
      height={size}
      // proportional rounding (square with soft corners) at any size, instead of
      // a fixed radius that looks circular on small avatars
      className="shrink-0"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
    />
  )
}
