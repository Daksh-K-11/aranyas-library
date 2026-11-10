"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StarRating } from "@/components/star-rating"
import { StatusPicker } from "@/components/status"
import { TagInput } from "@/components/tag-input"
import { PREDEFINED_GENRES, PREDEFINED_TAGS, mergeSuggestions } from "@/lib/constants"
import type { Library, UserFields } from "@/lib/types"
import { cn } from "@/lib/utils"

export function UserFieldsForm({
  value,
  onChange,
  genreSuggestions = [],
  tagSuggestions = [],
}: {
  value: UserFields
  onChange: (v: UserFields) => void
  genreSuggestions?: string[]
  tagSuggestions?: string[]
}) {
  const set = <K extends keyof UserFields>(k: K, v: UserFields[K]) => onChange({ ...value, [k]: v })

  const mergedGenres = React.useMemo(
    () => mergeSuggestions(PREDEFINED_GENRES, genreSuggestions),
    [genreSuggestions],
  )
  const mergedTags = React.useMemo(
    () => mergeSuggestions(PREDEFINED_TAGS, tagSuggestions),
    [tagSuggestions],
  )

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Reading status</Label>
        <StatusPicker value={value.read_status} onChange={(v) => set("read_status", v)} />
      </div>
      <div className="grid gap-2">
        <Label>Your rating</Label>
        <StarRating value={value.rating} onChange={(v) => set("rating", v)} size="lg" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="uf-genres">Genres</Label>
          <TagInput
            id="uf-genres"
            value={value.genres}
            onChange={(v) => set("genres", v)}
            suggestions={mergedGenres}
            placeholder="Fantasy, Thriller…"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="uf-tags">Tags</Label>
          <TagInput
            id="uf-tags"
            value={value.tags}
            onChange={(v) => set("tags", v)}
            suggestions={mergedTags}
            prefix="#"
            placeholder="signed, gift…"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="uf-notes">Personal notes</Label>
        <Textarea
          id="uf-notes"
          value={value.personal_notes ?? ""}
          onChange={(e) => set("personal_notes", e.target.value || null)}
          placeholder="Only you can see these"
          maxLength={5000}
          className="min-h-24"
        />
      </div>
    </div>
  )
}

export function LibraryPicker({
  libraries,
  value,
  onChange,
  disabledIds = [],
}: {
  libraries: Library[]
  value: string[]
  onChange: (v: string[]) => void
  disabledIds?: string[]
}) {
  if (!libraries.length) return null
  return (
    <div className="grid gap-2">
      <Label>Also add to libraries</Label>
      <div className="flex flex-wrap gap-2">
        {libraries.map((lib) => {
          const disabled = disabledIds.includes(lib.id)
          const active = disabled || value.includes(lib.id)
          return (
            <button
              key={lib.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(active ? value.filter((v) => v !== lib.id) : [...value, lib.id])}
              className={cn(
                "max-w-full truncate rounded-full border px-3 py-1.5 text-sm transition",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                disabled && "cursor-default opacity-60",
              )}
            >
              {active ? "✓ " : ""}
              {lib.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
