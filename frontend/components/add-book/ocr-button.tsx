"use client"

import * as React from "react"
import { Loader2, ScanText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

/**
 * Pick or photograph an image, run free in-browser OCR (tesseract.js) and
 * hand the text back. Nothing is uploaded for OCR.
 */
export function OcrButton({
  label,
  onText,
  source,
}: {
  label: string
  onText: (text: string) => void
  /** Use this image instead of asking for one (e.g. the chosen cover) */
  source?: Blob | null
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [progress, setProgress] = React.useState<number | null>(null)

  const run = async (image: Blob) => {
    setProgress(0)
    try {
      const { recognizeText } = await import("@/lib/ocr")
      const text = await recognizeText(image, (p) => setProgress(Math.round(p * 100)))
      if (!text) toast.warning("No readable text found. Try a sharper, well-lit photo.")
      else onText(text)
    } catch {
      toast.error("Text recognition failed. Check your connection, since the OCR engine downloads on first use.")
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={progress !== null}
        onClick={() => (source ? run(source) : inputRef.current?.click())}
      >
        {progress !== null ? <Loader2 className="size-4 animate-spin" /> : <ScanText className="size-4" />}
        {progress !== null ? `Reading… ${progress}%` : label}
      </Button>
      {progress !== null ? <Progress value={progress} className="h-1" /> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) run(f)
          e.target.value = ""
        }}
      />
    </div>
  )
}
