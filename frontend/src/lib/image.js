// Downscale very large phone photos before upload (saves bandwidth + Drive
// space). PDFs and non-images pass through untouched. Best-effort: if anything
// fails we just upload the original file.

const MAX_DIM = 2000       // longest edge, px
const JPEG_QUALITY = 0.82

export async function maybeResizeImage(file) {
  if (!file || !file.type.startsWith('image/')) return file
  if (file.type === 'image/gif') return file // keep animation

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const longest = Math.max(width, height)
    if (longest <= MAX_DIM) {
      bitmap.close?.()
      return file
    }

    const scale = MAX_DIM / longest
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob) return file

    const newName = file.name.replace(/\.(png|jpe?g|webp|heic|heif)$/i, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
