"use client"

import { Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TagInput } from "@/components/tag-input"
import { CoverPicker, type CoverValue } from "@/components/add-book/cover-picker"
import { OcrButton } from "@/components/add-book/ocr-button"
import { guessTitle } from "@/lib/ocr"
import { cleanIsbn, isbnProblem } from "@/lib/isbn"

export interface BookMeta {
  title: string
  subtitle: string
  authors: string[]
  isbn: string
  publisher: string
  published_year: string
  description: string
}

export const EMPTY_META: BookMeta = {
  title: "",
  subtitle: "",
  authors: [],
  isbn: "",
  publisher: "",
  published_year: "",
  description: "",
}

export function metaProblem(m: BookMeta, withIsbn: boolean): string | null {
  if (!m.title.trim()) return "Title is required"
  if (withIsbn && m.isbn.trim()) {
    const p = isbnProblem(m.isbn)
    if (p) return `ISBN: ${p}`
  }
  if (m.published_year && !/^\d{1,4}$/.test(m.published_year.trim())) return "Year must be a number"
  return null
}

export function BookMetaForm({
  value,
  onChange,
  cover,
  onCoverChange,
  showIsbn = true,
}: {
  value: BookMeta
  onChange: (v: BookMeta) => void
  cover: CoverValue
  onCoverChange: (v: CoverValue) => void
  showIsbn?: boolean
}) {
  const set = <K extends keyof BookMeta>(k: K, v: BookMeta[K]) => onChange({ ...value, [k]: v })
  const isbnIssue = value.isbn.trim() ? isbnProblem(value.isbn) : null

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Cover</Label>
        <CoverPicker value={cover} onChange={onCoverChange} title={value.title} />
      </div>

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor="bm-title">Title *</Label>
          {cover.original ? (
            <OcrButton
              label="Read title from cover"
              source={cover.original}
              onText={(t) => {
                const g = guessTitle(t)
                if (g) set("title", g)
              }}
            />
          ) : null}
        </div>
        <Input id="bm-title" value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={300} required />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bm-subtitle">Subtitle</Label>
        <Input id="bm-subtitle" value={value.subtitle} onChange={(e) => set("subtitle", e.target.value)} maxLength={300} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bm-authors">Authors</Label>
        <TagInput
          id="bm-authors"
          value={value.authors}
          onChange={(v) => set("authors", v)}
          max={20}
          maxLength={200}
          placeholder="Type a name and press Enter"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {showIsbn ? (
          <div className="grid gap-2">
            <Label htmlFor="bm-isbn">ISBN</Label>
            <Input
              id="bm-isbn"
              value={value.isbn}
              inputMode="numeric"
              onChange={(e) => set("isbn", e.target.value)}
              onBlur={() => value.isbn && set("isbn", cleanIsbn(value.isbn))}
              maxLength={20}
              aria-invalid={!!isbnIssue}
              placeholder="Optional"
            />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="bm-publisher">Publisher</Label>
          <Input id="bm-publisher" value={value.publisher} onChange={(e) => set("publisher", e.target.value)} maxLength={200} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bm-year">Year</Label>
          <Input
            id="bm-year"
            value={value.published_year}
            inputMode="numeric"
            onChange={(e) => set("published_year", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="e.g. 2009"
          />
        </div>
      </div>
      {showIsbn ? (
        isbnIssue ? (
          <p className="-mt-3 text-xs text-destructive">{isbnIssue}</p>
        ) : (
          <p className="-mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {value.isbn.trim()
              ? "Books with an ISBN are added to the shared catalogue, so other readers can find them too."
              : "Without an ISBN the book stays private to your account."}
          </p>
        )
      ) : null}

      <div className="grid gap-2">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor="bm-desc">Description</Label>
          <OcrButton
            label="Scan the blurb"
            onText={(t) => set("description", value.description ? `${value.description}\n\n${t}` : t)}
          />
        </div>
        <Textarea
          id="bm-desc"
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={8000}
          className="min-h-32"
          placeholder="Type it, or photograph the back cover and we'll read the text for you. You can correct it afterwards."
        />
      </div>
    </div>
  )
}

export function metaToPayload(m: BookMeta) {
  const year = m.published_year.trim() ? Number(m.published_year) : null
  return {
    title: m.title.trim(),
    subtitle: m.subtitle.trim() || null,
    authors: m.authors,
    isbn: cleanIsbn(m.isbn) || null,
    publisher: m.publisher.trim() || null,
    published_year: year,
    description: m.description.trim() || null,
  }
}
