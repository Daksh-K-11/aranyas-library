"use client"

import * as React from "react"
import { X } from "lucide-react"
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
}: TagInputProps) {
  const [draft, setDraft] = React.useState("")
  const listId = React.useId()

  const add = (raw: string) => {
    const parts = raw
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

  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
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
            className="inline-flex size-4 items-center justify-center rounded-full hover:bg-foreground/10"
            aria-label={`Remove ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        list={remaining.length ? listId : undefined}
        maxLength={maxLength * 3}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(",")) add(v)
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add(draft)
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length >= max ? "" : placeholder}
        disabled={value.length >= max}
        enterKeyHint="done"
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground"
      />
      {remaining.length ? (
        <datalist id={listId}>
          {remaining.slice(0, 50).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </div>
  )
}
