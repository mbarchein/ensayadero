// Crop a source image (data URL) to the given pixel area and return a small
// square data URL (webp when the browser supports encoding it, jpeg otherwise).

export interface PixelArea {
  x: number
  y: number
  width: number
  height: number
}

export async function cropToDataUrl(src: string, area: PixelArea, out = 256): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, out, out)
  const webp = canvas.toDataURL('image/webp', 0.85)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85)
}
