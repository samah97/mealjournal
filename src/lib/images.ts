import type { Photo } from './types'
import { uid } from './utils'

/** Long edge and JPEG quality for stored photos – enough for a dietitian to identify food. */
const FULL = { maxEdge: 1600, quality: 0.82 }
const THUMB = { maxEdge: 480, quality: 0.74 }

async function decode(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(source, { imageOrientation: 'from-image' })
    } catch {
      /* fall back to <img> decoding below */
    }
  }
  const url = URL.createObjectURL(source)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function dims(img: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return 'naturalWidth' in img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: img.width, h: img.height }
}

function render(img: ImageBitmap | HTMLImageElement, maxEdge: number, quality: number) {
  const { w, h } = dims(img)
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const width = Math.max(1, Math.round(w * scale))
  const height = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff' // flatten transparency for JPEG
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve({ blob: b, width, height }) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      quality,
    ),
  )
}

/** Compress a camera / gallery image into a stored photo with a thumbnail. */
export async function compressPhoto(file: Blob): Promise<Photo> {
  let img: ImageBitmap | HTMLImageElement
  try {
    img = await decode(file)
  } catch {
    throw new Error('This image format could not be read. Try a JPEG or PNG photo.')
  }
  const full = await render(img, FULL.maxEdge, FULL.quality)
  const thumb = await render(img, THUMB.maxEdge, THUMB.quality)
  if ('close' in img) img.close()
  return { id: uid(), blob: full.blob, thumb: thumb.blob, width: full.width, height: full.height, createdAt: Date.now() }
}

/** Re-encode an already stored photo for a report (smaller file, same aspect ratio). */
export async function resizeForReport(
  blob: Blob,
  maxEdge = 1100,
  quality = 0.74,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await decode(blob)
  const out = await render(img, maxEdge, quality)
  if ('close' in img) img.close()
  return out
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
