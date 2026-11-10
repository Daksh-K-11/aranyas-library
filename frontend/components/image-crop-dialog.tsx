"use client"

import * as React from "react"
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { Check, Loader2, RotateCcw, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type CropAspect = { label: string; value: number | undefined }

export const COVER_ASPECTS: CropAspect[] = [
  { label: "Book 2:3", value: 2 / 3 },
  { label: "Free", value: undefined },
]
export const FREE_ASPECT: CropAspect[] = [{ label: "Free", value: undefined }]

interface ImageCropDialogProps {
  file: Blob | null
  title?: string
  description?: string
  aspects?: CropAspect[]
  /** Longest side of the output image in pixels */
  maxOutput?: number
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

function initialCrop(width: number, height: number, aspect: number | undefined): Crop {
  if (!aspect) return { unit: "%", x: 4, y: 4, width: 92, height: 92 }
  return centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height), width, height)
}

/** Rotate an image by a multiple of 90° onto a canvas and return an object URL. */
async function rotatedUrl(img: HTMLImageElement, deg: number): Promise<string> {
  const quarter = ((deg % 360) + 360) % 360
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement("canvas")
  const swap = quarter === 90 || quarter === 270
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext("2d")!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((quarter * Math.PI) / 180)
  ctx.drawImage(img, -w / 2, -h / 2)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.95))
  if (!blob) throw new Error("Could not rotate image")
  return URL.createObjectURL(blob)
}

export function ImageCropDialog({
  file,
  title = "Crop image",
  description = "Drag the corners to choose the part of the photo you want.",
  aspects = COVER_ASPECTS,
  maxOutput = 2400,
  confirmLabel = "Use photo",
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const [originalUrl, setOriginalUrl] = React.useState<string | null>(null)
  const [src, setSrc] = React.useState<string | null>(null)
  const [rotation, setRotation] = React.useState(0)
  const [aspectIdx, setAspectIdx] = React.useState(0)
  const [crop, setCrop] = React.useState<Crop>()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)
  const originalImg = React.useRef<HTMLImageElement | null>(null)
  const aspect = aspects[aspectIdx]?.value

  // load the file
  React.useEffect(() => {
    setRotation(0)
    setAspectIdx(0)
    setCrop(undefined)
    setError(null)
    if (!file) {
      setOriginalUrl(null)
      setSrc(null)
      return
    }
    const url = URL.createObjectURL(file)
    setOriginalUrl(url)
    setSrc(url)
    const img = new Image()
    img.onload = () => (originalImg.current = img)
    img.onerror = () => setError("This image format can't be opened in your browser. Try a JPEG or PNG.")
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // apply rotation
  React.useEffect(() => {
    if (!originalImg.current || !originalUrl) return
    if (rotation % 360 === 0) {
      setSrc(originalUrl)
      return
    }
    let revoked: string | null = null
    rotatedUrl(originalImg.current, rotation)
      .then((u) => {
        revoked = u
        setSrc(u)
        setCrop(undefined)
      })
      .catch(() => setError("Could not rotate this image"))
    return () => {
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [rotation, originalUrl])

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    setCrop(initialCrop(width, height, aspect))
  }

  const changeAspect = (i: number) => {
    setAspectIdx(i)
    const img = imgRef.current
    if (img) setCrop(initialCrop(img.width, img.height, aspects[i]?.value))
  }

  const confirm = async () => {
    const img = imgRef.current
    if (!img || !crop) return
    setBusy(true)
    try {
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      // crop may be in % (initial) or px (after the user drags, relative to the displayed size)
      const toNatX = crop.unit === "%" ? nw / 100 : nw / img.width
      const toNatY = crop.unit === "%" ? nh / 100 : nh / img.height
      const sx = Math.max(0, Math.round(crop.x * toNatX))
      const sy = Math.max(0, Math.round(crop.y * toNatY))
      const sw = Math.min(nw - sx, Math.round(crop.width * toNatX))
      const sh = Math.min(nh - sy, Math.round(crop.height * toNatY))
      if (sw < 10 || sh < 10) throw new Error("Selection is too small")

      const scale = Math.min(1, maxOutput / Math.max(sw, sh))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(sw * scale)
      canvas.height = Math.round(sh * scale)
      const ctx = canvas.getContext("2d")!
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92))
      if (!blob) throw new Error("Could not crop image")
      onConfirm(blob)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="flex max-h-[100dvh] w-full max-w-[calc(100%-1rem)] flex-col gap-3 p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted/60 p-2">
          {error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : src ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percent) => setCrop(percent)}
              aspect={aspect}
              keepSelection
              ruleOfThirds
              minWidth={24}
              minHeight={24}
              className="max-h-[58dvh] touch-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={src}
                alt="Image to crop"
                onLoad={onImageLoad}
                className="block max-h-[58dvh] w-auto max-w-full select-none object-contain"
                draggable={false}
              />
            </ReactCrop>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => setRotation((r) => r - 90)} aria-label="Rotate left" disabled={busy || !!error}>
            <RotateCcw className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => setRotation((r) => r + 90)} aria-label="Rotate right" disabled={busy || !!error}>
            <RotateCw className="size-4" />
          </Button>
          {aspects.length > 1 ? (
            <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Crop shape">
              {aspects.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  role="radio"
                  aria-checked={i === aspectIdx}
                  onClick={() => changeAspect(i)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition",
                    i === aspectIdx ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={busy || !crop || !!error}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
