"use client"

import * as React from "react"
import { CameraOff, Loader2 } from "lucide-react"
import type { Html5Qrcode } from "html5-qrcode"
import { cleanIsbn, isValidIsbn } from "@/lib/isbn"

interface BarcodeScannerProps {
  onDetected: (isbn: string) => void
}

/**
 * Camera barcode reader for book ISBNs (EAN-13). Uses the native
 * BarcodeDetector when the browser has it, ZXing otherwise.
 */
export function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const id = React.useId().replace(/:/g, "")
  const elementId = `scanner-${id}`
  const scannerRef = React.useRef<Html5Qrcode | null>(null)
  const doneRef = React.useRef(false)
  const onDetectedRef = React.useRef(onDetected)
  onDetectedRef.current = onDetected
  const [state, setState] = React.useState<"starting" | "scanning" | "error">("starting")
  const [error, setError] = React.useState("")
  const [hint, setHint] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    doneRef.current = false

    const start = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode")
        if (cancelled) return
        const scanner = new Html5Qrcode(elementId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.UPC_A],
          useBarCodeDetectorIfSupported: true,
        })
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: (w: number, h: number) => {
              const width = Math.floor(Math.min(w * 0.85, 380))
              return { width, height: Math.floor(Math.min(h * 0.45, width * 0.45)) }
            },
            disableFlip: true,
          },
          (text) => {
            if (doneRef.current) return
            const digits = cleanIsbn(text)
            if (isValidIsbn(digits)) {
              doneRef.current = true
              if (navigator.vibrate) navigator.vibrate(60)
              onDetectedRef.current(digits)
            } else if (/^\d{12,13}$/.test(digits)) {
              setHint("That barcode is a product code, not an ISBN. Look for the barcode marked ISBN.")
            }
          },
          () => {},
        )
        if (cancelled) {
          await stop(scanner)
          return
        }
        setState("scanning")
      } catch (e) {
        if (cancelled) return
        const msg = String((e as Error)?.message || e)
        setError(
          /NotAllowed|Permission/i.test(msg)
            ? "Camera access was blocked. Allow camera access in your browser settings, or type the ISBN instead."
            : /NotFound|Requested device not found/i.test(msg)
              ? "No camera was found on this device."
              : /secure|https/i.test(msg) || (typeof window !== "undefined" && !window.isSecureContext)
                ? "The camera only works on a secure (https) connection."
                : "Could not start the camera.",
        )
        setState("error")
      }
    }
    start()

    return () => {
      cancelled = true
      const s = scannerRef.current
      scannerRef.current = null
      if (s) stop(s)
    }
  }, [elementId])

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <div id={elementId} className="aspect-[4/3] w-full [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80">
            <Loader2 className="size-5 animate-spin" /> Starting camera…
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/90">
            <CameraOff className="size-8" />
            <p>{error}</p>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {hint ?? "Hold the barcode on the back cover inside the box. It scans automatically."}
      </p>
    </div>
  )
}

async function stop(s: Html5Qrcode) {
  try {
    if (s.isScanning) await s.stop()
  } catch {}
  try {
    s.clear()
  } catch {}
}
