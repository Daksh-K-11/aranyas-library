"use client"

import * as React from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  value: number | null
  onChange?: (value: number | null) => void
  size?: "sm" | "md" | "lg"
  className?: string
}

const SIZE = { sm: "size-3.5", md: "size-5", lg: "size-7" }

export function StarRating({ value, onChange, size = "md", className }: StarRatingProps) {
  const [hover, setHover] = React.useState<number | null>(null)
  const shown = hover ?? value ?? 0
  const readOnly = !onChange

  if (readOnly) {
    return (
      <div className={cn("flex items-center gap-0.5", className)} aria-label={`Rated ${value ?? 0} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden
            className={cn(SIZE[size], n <= shown ? "fill-star text-star" : "text-muted-foreground/30")}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      className={cn("flex items-center gap-1", className)}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault()
              onChange(Math.min(5, (value ?? 0) + 1))
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault()
              const next = (value ?? 0) - 1
              onChange(next < 1 ? null : next)
            }
          }}
          className="rounded-sm p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <Star className={cn(SIZE[size], n <= shown ? "fill-star text-star" : "text-muted-foreground/40")} />
        </button>
      ))}
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}
