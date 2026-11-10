"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"
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
  featured,
  autoFilledFrom,
}: {
  value: UserFields
  onChange: (v: UserFields) => void
  /** Genres/tags the user already uses. Offered before the predefined ones. */
  genreSuggestions?: string[]
  tagSuggestions?: string[]
  /** Suggestions derived from this particular book's catalogue subjects. */
  featured?: { genres: string[]; tags: string[] }
  /** Name of the catalogue the genres were pre-filled from, for the hint. */
  autoFilledFrom?: string | null
}) {
  const set = <K extends keyof UserFields>(k: K, v: UserFields[K]) => onChange({ ...value, [k]: v })

  const mergedGenres = React.useMemo(
    () => mergeSuggestions(genreSuggestions, PREDEFINED_GENRES),
    [genreSuggestions],
  )
  const mergedTags = React.useMemo(
    () => mergeSuggestions(tagSuggestions, PREDEFINED_TAGS),
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
      {/* Full width rather than two columns: the suggestion pills need room. */}
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <Label htmlFor="uf-genres">Genres</Label>
          {autoFilledFrom && value.genres.length ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="size-3 text-primary" /> Filled in from {autoFilledFrom}
            </span>
          ) : null}
        </div>
        <TagInput
          id="uf-genres"
          value={value.genres}
          onChange={(v) => set("genres", v)}
          suggestions={mergedGenres}
          featured={featured?.genres}
          placeholder="Pick below or type your own"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="uf-tags">Tags</Label>
        <TagInput
          id="uf-tags"
          value={value.tags}
          onChange={(v) => set("tags", v)}
          suggestions={mergedTags}
          featured={featured?.tags}
          prefix="#"
          placeholder="signed, gift, to-lend…"
        />
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
