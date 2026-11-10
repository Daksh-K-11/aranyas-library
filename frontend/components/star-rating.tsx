"use client"

import * as React from "react"
import { Minus, Plus, Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  value: number | null
  onChange?: (value: number | null) => void
  size?: "sm" | "md" | "lg"
  /** Read-only: also print the number ("4.3"). */
  showValue?: boolean
  className?: string
}

const SIZE = { sm: "size-3.5", md: "size-5", lg: "size-8 sm:size-7" }
const TEXT = { sm: "text-xs", md: "text-sm", lg: "text-sm" }

export const MIN_RATING = 0.5
export const MAX_RATING = 5

/** Ratings have one decimal place, between 0.5 and 5. */
export function clampRating(v: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(v * 10) / 10))
}

export const formatRating = (v: number) => v.toFixed(1)

/** Five stars, each filled by its share of the value (4.3 = four full stars and 30% of the fifth). */
function Stars({
  value,
  size,
  starRefs,
  muted = "text-muted-foreground/30",
}: {
  value: number
  size: keyof typeof SIZE
  starRefs?: React.MutableRefObject<(HTMLSpanElement | null)[]>
  muted?: string
}) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, value - i))
        return (
          <span
            key={i}
            ref={starRefs ? (el) => void (starRefs.current[i] = el) : undefined}
            className="relative inline-flex shrink-0"
            aria-hidden
          >
            <Star className={cn(SIZE[size], muted)} />
            {fill > 0 ? (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={cn(SIZE[size], "max-w-none fill-star text-star")} />
              </span>
            ) : null}
          </span>
        )
      })}
    </>
  )
}

export function StarRating({ value, onChange, size = "md", showValue = false, className }: StarRatingProps) {
  if (!onChange) {
    return (
      <div className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={value ? `Rated ${formatRating(value)} out of 5` : "Not rated"}>
        <Stars value={value ?? 0} size={size} />
        {showValue && value ? (
          <span className={cn("ml-1 font-medium tabular-nums text-foreground/80", TEXT[size])}>{formatRating(value)}</span>
        ) : null}
      </div>
    )
  }
  return <RatingInput value={value} onChange={onChange} size={size} className={className} />
}

/**
 * Tap a star for a whole number, slide across the stars for tenths, or
 * fine-tune with the − / + buttons or by typing the number.
 */
function RatingInput({
  value,
  onChange,
  size,
  className,
}: {
  value: number | null
  onChange: (value: number | null) => void
  size: keyof typeof SIZE
  className?: string
}) {
  const starRefs = React.useRef<(HTMLSpanElement | null)[]>([])
  const drag = React.useRef<{ x: number; moved: boolean } | null>(null)
  const [preview, setPreview] = React.useState<number | null>(null)
  const [draft, setDraft] = React.useState<string | null>(null)

  const shown = preview ?? value ?? 0

  // Rating at a horizontal position: whole stars to the left plus the
  // fraction of the star under the pointer.
  const valueAt = (clientX: number, whole: boolean): number => {
    const stars = starRefs.current
    for (let i = 0; i < stars.length; i++) {
      const r = stars[i]?.getBoundingClientRect()
      if (!r) continue
      if (clientX <= r.right || i === stars.length - 1) {
        if (whole) return i + 1
        const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
        return clampRating(i + Math.ceil(frac * 10) / 10)
      }
    }
    return MIN_RATING
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (d) {
      if (!d.moved && Math.abs(e.clientX - d.x) > 6) d.moved = true
      if (d.moved) setPreview(valueAt(e.clientX, false))
    } else if (e.pointerType === "mouse") {
      setPreview(valueAt(e.clientX, true))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    onChange(d.moved ? valueAt(e.clientX, false) : valueAt(e.clientX, true))
    setPreview(null)
  }

  const step = (delta: number) => {
    if (value == null) {
      if (delta > 0) onChange(delta >= 1 ? 1 : MIN_RATING)
      return
    }
    onChange(clampRating(value + delta))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = e.shiftKey ? 1 : 0.1
    const keys: Record<string, () => void> = {
      ArrowRight: () => step(big),
      ArrowUp: () => step(big),
      ArrowLeft: () => step(-big),
      ArrowDown: () => step(-big),
      PageUp: () => step(1),
      PageDown: () => step(-1),
      Home: () => onChange(MIN_RATING),
      End: () => onChange(MAX_RATING),
      Delete: () => onChange(null),
      Backspace: () => onChange(null),
    }
    if (keys[e.key]) {
      e.preventDefault()
      keys[e.key]()
    }
  }

  const commitDraft = () => {
    if (draft == null) return
    const text = draft.trim().replace(",", ".")
    setDraft(null)
    if (!text) return onChange(null)
    const n = Number(text)
    if (Number.isFinite(n)) onChange(clampRating(n))
  }

  const stepBtn =
    "inline-flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 sm:size-8"

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Rating"
          aria-valuemin={MIN_RATING}
          aria-valuemax={MAX_RATING}
          aria-valuenow={value ?? undefined}
          aria-valuetext={value ? `${formatRating(value)} out of 5` : "Not rated"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null
            setPreview(null)
          }}
          onPointerLeave={(e) => e.pointerType === "mouse" && !drag.current && setPreview(null)}
          onKeyDown={onKeyDown}
          // pan-y: a sideways slide sets the rating, a vertical swipe still scrolls the page.
          className="inline-flex cursor-pointer touch-pan-y select-none items-center gap-1 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Stars value={shown} size={size} starRefs={starRefs} muted="text-muted-foreground/40" />
        </div>

        <div className="inline-flex items-center overflow-hidden rounded-full border bg-background shadow-xs">
          <button type="button" onClick={() => step(-0.1)} disabled={value == null || value <= MIN_RATING} className={stepBtn} aria-label="Lower rating by 0.1">
            <Minus className="size-3.5" />
          </button>
          <input
            value={draft ?? (preview != null ? formatRating(preview) : value != null ? formatRating(value) : "")}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, "").slice(0, 3))}
            onFocus={(e) => e.target.select()}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitDraft()
              }
            }}
            inputMode="decimal"
            placeholder="–"
            aria-label="Rating out of 5"
            className="h-9 w-11 border-x bg-transparent text-center text-base font-semibold tabular-nums outline-none placeholder:text-muted-foreground focus:bg-muted/50 sm:h-8 sm:text-sm"
          />
          <button type="button" onClick={() => step(0.1)} disabled={value != null && value >= MAX_RATING} className={stepBtn} aria-label="Raise rating by 0.1">
            <Plus className="size-3.5" />
          </button>
        </div>
        <span className="-ml-1.5 text-xs text-muted-foreground">/ 5</span>

        {value != null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Tap a star, or slide across the stars for decimals like 4.3.
      </p>
    </div>
  )
}
