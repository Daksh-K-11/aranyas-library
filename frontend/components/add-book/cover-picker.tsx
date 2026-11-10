"use client"

import * as React from "react"
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { BookCover } from "@/components/book-cover"
import { COVER_ASPECTS, ImageCropDialog } from "@/components/image-crop-dialog"
import { compressImage, formatBytes } from "@/lib/image"

export interface CoverValue {
  /** Compressed image ready to upload */
  blob: Blob | null
  /** Original photo (higher quality, used for OCR) */
  original: Blob | null
  /** Existing remote cover url (when not replaced) */
  url: string | null
}

export const EMPTY_COVER: CoverValue = { blob: null, original: null, url: null }

export function CoverPicker({
  value,
  onChange,
  title,
}: {
  value: CoverValue
  onChange: (v: CoverValue) => void
  title?: string
}) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [originalSize, setOriginalSize] = React.useState<number | null>(null)
  const [pending, setPending] = React.useState<File | null>(null)

  React.useEffect(() => {
    if (!value.blob) {
      setPreview(null)
      return
    }
    const u = URL.createObjectURL(value.blob)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [value.blob])

  // Step 1: validate the chosen file, then let the user crop it.
  const handle = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("That image is too large (max 25 MB)")
      return
    }
    setPending(file)
  }

  // Step 2: compress the cropped result for upload.
  const applyCrop = async (cropped: Blob) => {
    const size = pending?.size ?? cropped.size
    setPending(null)
    setBusy(true)
    try {
      const blob = await compressImage(cropped)
      setOriginalSize(size)
      onChange({ blob, original: cropped, url: null })
    } catch (e) {
      toast.error((e as Error).message || "Could not read that image")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <BookCover url={preview ?? value.url} title={title} className="w-24 shrink-0 sm:w-28" eager />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {value.blob || value.url ? "Replace" : "Upload"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
            <Camera className="size-4" /> Take photo
          </Button>
          {value.blob || value.url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(EMPTY_COVER)}
              className="text-muted-foreground"
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {value.blob
            ? `Compressed to ${formatBytes(value.blob.size)}${originalSize ? ` (from ${formatBytes(originalSize)})` : ""}`
            : "Photos are resized and compressed on your device before uploading."}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => {
            handle(e.target.files?.[0])
            e.target.value = ""
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handle(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>
      <ImageCropDialog
        file={pending}
        title="Crop cover"
        description="Line the box up with the edges of the cover. Use Free for unusual shapes."
        aspects={COVER_ASPECTS}
        onCancel={() => setPending(null)}
        onConfirm={applyCrop}
      />
    </div>
  )
}
