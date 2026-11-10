"use client"

import * as React from "react"
import { Plus, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  /** Options offered as one-tap pills, most relevant first. */
  suggestions?: readonly string[]
  /** Options picked for this book (e.g. from its catalogue subjects). Shown first, highlighted. */
  featured?: readonly string[]
  max?: number
  maxLength?: number
  prefix?: string
  id?: string
  className?: string
  /** Set false for free-text lists such as authors. */
  showQuickSuggestions?: boolean
}

// Pills shown before "Show all". Fewer on phones so the form stays short.
const PREVIEW_MOBILE = 6
const PREVIEW_DESKTOP = 10

const lower = (s: string) => s.toLowerCase()

export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  suggestions = [],
  featured = [],
  max = 30,
  maxLength = 40,
  prefix = "",
  id,
  className,
  showQuickSuggestions = true,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("")
  const [showAll, setShowAll] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const full = value.length >= max
  const chosen = React.useMemo(() => new Set(value.map(lower)), [value])

  // Every option once, featured first, in a lookup so typed text can be
  // matched to its canonical spelling ("fantasy" -> "Fantasy").
  const options = React.useMemo(() => {
    const seen = new Set<string>()
    const out: { label: string; featured: boolean }[] = []
    for (const [list, isFeatured] of [[featured, true], [suggestions, false]] as const) {
      for (const s of list) {
        const k = lower(s)
        if (!s || seen.has(k)) continue
        seen.add(k)
        out.push({ label: s, featured: isFeatured })
      }
    }
    return out
  }, [featured, suggestions])

  const canonical = (s: string) => options.find((o) => lower(o.label) === lower(s))?.label ?? s

  const stripPrefix = (s: string) => {
    const t = s.trim()
    return prefix && t.startsWith(prefix) ? t.slice(prefix.length).trim() : t
  }

  const add = (raw: string) => {
    const parts = stripPrefix(raw)
      .split(",")
      .map((s) => canonical(stripPrefix(s).slice(0, maxLength)))
      .filter(Boolean)
    setDraft("")
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) {
      if (next.length >= max) break
      if (!next.some((v) => lower(v) === lower(p))) next.push(p)
    }
    if (next.length !== value.length) onChange(next)
  }

  const query = lower(stripPrefix(draft))
  const available = options.filter((o) => !chosen.has(lower(o.label)))
  const matching = query ? available.filter((o) => lower(o.label).includes(query)) : available
  const exactMatch = !!query && (chosen.has(query) || options.some((o) => lower(o.label) === query))
  const showCustom = !!query && !exactMatch

  const collapsed = !showAll && !query
  const moreMobile = collapsed ? matching.length - PREVIEW_MOBILE : 0
  const moreDesktop = collapsed ? matching.length - PREVIEW_DESKTOP : 0

  // Tapping a pill must not blur the input first: blur commits the draft,
  // which would add the half-typed text as well as the pill.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  const pillBase =
    "inline-flex h-8 max-w-full items-center gap-1 rounded-full border px-3 text-xs transition-colors sm:h-7 sm:px-2.5"

  return (
    <div className="grid gap-2">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-xs transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
          className,
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs font-medium text-secondary-foreground sm:h-6"
          >
            <span className="truncate">
              {prefix}
              {tag}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange(value.filter((t) => t !== tag))
              }}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground"
              aria-label={`Remove ${tag}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          maxLength={maxLength * 3}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(",")) add(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              // Enter on a partial match picks the single remaining option.
              if (!exactMatch && matching.length === 1) add(matching[0].label)
              else if (draft.trim()) add(draft)
            } else if (e.key === "Escape" && draft) {
              e.stopPropagation()
              setDraft("")
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={full ? `Limit of ${max} reached` : value.length ? "Add more…" : placeholder}
          disabled={full}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="done"
          className="h-7 min-w-[6rem] flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm"
        />
      </div>

      {showQuickSuggestions && !full && (matching.length > 0 || showCustom) ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Suggestions">
          {showCustom ? (
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => add(draft)}
              className={cn(pillBase, "border-primary/40 bg-primary/10 font-medium text-primary hover:bg-primary/20")}
            >
              <Plus className="size-3 shrink-0" />
              <span className="truncate">
                Add &ldquo;{prefix}
                {stripPrefix(draft)}&rdquo;
              </span>
            </button>
          ) : null}

          {matching.map((o, i) => (
            <button
              key={o.label}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => add(o.label)}
              title={o.featured ? "Suggested from this book's details" : undefined}
              className={cn(
                pillBase,
                o.featured
                  ? "border-primary/40 bg-primary/5 text-foreground hover:bg-primary/15"
                  : "border-border bg-muted/40 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
                collapsed && i >= PREVIEW_MOBILE && "max-sm:hidden",
                collapsed && i >= PREVIEW_DESKTOP && "sm:hidden",
              )}
            >
              {o.featured ? <Sparkles className="size-3 shrink-0 text-primary" /> : <Plus className="size-3 shrink-0 opacity-60" />}
              <span className="truncate">
                {prefix}
                {o.label}
              </span>
            </button>
          ))}

          {moreMobile > 0 ? (
            <button type="button" onMouseDown={keepFocus} onClick={() => setShowAll(true)} className={cn(moreClass, "sm:hidden")}>
              +{moreMobile} more
            </button>
          ) : null}
          {moreDesktop > 0 ? (
            <button type="button" onMouseDown={keepFocus} onClick={() => setShowAll(true)} className={cn(moreClass, "max-sm:hidden")}>
              +{moreDesktop} more
            </button>
          ) : null}
          {showAll && !query && matching.length > PREVIEW_MOBILE ? (
            <button type="button" onMouseDown={keepFocus} onClick={() => setShowAll(false)} className={moreClass}>
              Show fewer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const moreClass =
  "inline-flex h-8 items-center px-2 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline sm:h-7"
