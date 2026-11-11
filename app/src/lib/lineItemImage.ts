/** Compress a picked photo into a small data URL for optional quote line images. */

const MAX_EDGE_PX = 320
const JPEG_QUALITY = 0.72
const MAX_OUTPUT_CHARS = 180_000 // ~135 KB data URL ceiling
const MAX_INPUT_BYTES = 8 * 1024 * 1024

export function hasLineItemImage(value: string | null | undefined): boolean {
  return Boolean(String(value || '').trim())
}

export function assertLineItemImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPEG, PNG, or WebP).')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image is too large (max 8 MB).')
  }
}

/**
 * Resize + JPEG-compress so line images stay printable without bloating the DB.
 * Returns a data URL, or '' if the canvas path fails.
 */
export async function compressLineItemImage(file: File): Promise<string> {
  assertLineItemImageFile(file)

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare image preview.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    let quality = JPEG_QUALITY
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > MAX_OUTPUT_CHARS && quality > 0.4) {
      quality -= 0.08
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }
    if (dataUrl.length > MAX_OUTPUT_CHARS) {
      throw new Error('Image is still too large after compression. Try a simpler photo.')
    }
    return dataUrl
  } finally {
    bitmap.close()
  }
}
