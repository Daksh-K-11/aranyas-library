/** Resize + compress an image in the browser (no dependencies). */
export async function compressImage(
  file: Blob,
  { maxWidth = 600, maxHeight = 900, quality = 0.75 } = {},
): Promise<Blob> {
  const source = await loadImage(file)
  const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height)
  const w = Math.max(1, Math.round(source.width * scale))
  const h = Math.max(1, Math.round(source.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser cannot process images")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source.image, 0, 0, w, h)
  source.close()

  const webp = await toBlob(canvas, "image/webp", quality)
  if (webp && webp.type === "image/webp") return webp
  const jpeg = await toBlob(canvas, "image/jpeg", quality)
  if (!jpeg) throw new Error("Could not compress image")
  return jpeg
}

/** Upscaled, greyscale copy that OCR reads more reliably. */
export async function prepareForOcr(file: Blob, maxSide = 2000): Promise<Blob> {
  const source = await loadImage(file)
  const scale = Math.min(2, maxSide / Math.max(source.width, source.height))
  const w = Math.round(source.width * scale)
  const h = Math.round(source.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return file
  ctx.filter = "grayscale(1) contrast(1.25)"
  ctx.drawImage(source.image, 0, 0, w, h)
  source.close()
  return (await toBlob(canvas, "image/png", 1)) || file
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

type Loaded = { image: CanvasImageSource; width: number; height: number; close: () => void }

async function loadImage(file: Blob): Promise<Loaded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file is not an image we can read"))
    }
    img.src = url
  })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
