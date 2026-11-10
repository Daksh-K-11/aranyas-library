"use client"

import * as React from "react"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  suggestions?: string[]
  max?: number
  maxLength?: number
  prefix?: string
  id?: string
  className?: string
  showQuickSuggestions?: boolean
}

export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  suggestions = [],
  max = 30,
  maxLength = 40,
  prefix = "",
  id,
  className,
  showQuickSuggestions = true,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("")
  const [showAll, setShowAll] = React.useState(false)
  const listId = React.useId()

  const add = (raw: string) => {
    let clean = raw.trim()
    if (prefix && clean.startsWith(prefix)) {
      clean = clean.slice(prefix.length).trim()
    }
    const parts = clean
      .split(",")
      .map((s) => s.trim().slice(0, maxLength))
      .filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) {
      if (next.length >= max) break
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p)
    }
    onChange(next)
    setDraft("")
  }

  const cleanDraft = draft.trim().replace(new RegExp(`^${prefix}`), "").toLowerCase()

  // Suggestions not already chosen
  const unselectedSuggestions = React.useMemo(() => {
    return suggestions.filter(
      (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())
    )
  }, [suggestions, value])

  // Filtered by current typing
  const filteredSuggestions = React.useMemo(() => {
    if (!cleanDraft) return unselectedSuggestions
    return unselectedSuggestions.filter((s) =>
      s.toLowerCase().includes(cleanDraft)
    )
  }, [unselectedSuggestions, cleanDraft])

  // Is draft a completely new custom tag not matching any existing selection or suggestions?
  const isCustomDraft =
    cleanDraft.length > 0 &&
    !value.some((v) => v.toLowerCase() === cleanDraft) &&
    !suggestions.some((s) => s.toLowerCase() === cleanDraft)

  // How many suggestions to preview by default
  const previewLimit = 8
  const displayedSuggestions =
    showAll || cleanDraft
      ? filteredSuggestions
      : filteredSuggestions.slice(0, previewLimit)
  const hasMore =
    !showAll && !cleanDraft && filteredSuggestions.length > previewLimit

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-xs transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
          className,
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
          >
            <span className="truncate">
              {prefix}
              {tag}
            </span>
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="inline-flex size-4 items-center justify-center rounded-full hover:bg-foreground/15 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          list={unselectedSuggestions.length ? listId : undefined}
          maxLength={maxLength * 3}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(",")) add(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (draft.trim()) add(draft)
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft)
          }}
          placeholder={value.length >= max ? "" : placeholder}
          disabled={value.length >= max}
          enterKeyHint="done"
          className="min-w-[7rem] flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground text-sm"
        />
        {unselectedSuggestions.length ? (
          <datalist id={listId}>
            {unselectedSuggestions.slice(0, 50).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
      </div>

      {/* Quick Add Pills / Suggestions */}
      {showQuickSuggestions && (filteredSuggestions.length > 0 || isCustomDraft) && (
        <div className="flex flex-col gap-1.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* If user typed custom tag, offer an instant 1-tap add pill */}
            {isCustomDraft && (
              <button
                type="button"
                onClick={() => add(draft)}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="size-3" />
                Add custom &ldquo;{prefix}{draft.trim()}&rdquo;
              </button>
            )}

            {/* Clickable predefined / suggested tags */}
            {displayedSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground transition-colors"
              >
                <Plus className="size-3 text-muted-foreground/60" />
                {prefix}{s}
              </button>
            ))}

            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-muted-foreground/70 hover:text-primary transition-colors underline-offset-2 hover:underline"
              >
                +{filteredSuggestions.length - previewLimit} more
              </button>
            )}

            {showAll && filteredSuggestions.length > previewLimit && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-muted-foreground/70 hover:text-primary transition-colors underline-offset-2 hover:underline"
              >
                Show fewer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
