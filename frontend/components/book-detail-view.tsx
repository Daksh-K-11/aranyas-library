"use client"

import * as React from "react"
import { Edit2, FolderMinus, Globe, LibraryIcon, Loader2, Lock, PenLine, Plus, RotateCcw, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ResponsiveModal } from "@/components/responsive-modal"
import { BookCover } from "@/components/book-cover"
import { StarRating } from "@/components/star-rating"
import { StatusBadge } from "@/components/status"
import { UserFieldsForm } from "@/components/add-book/user-fields-form"
import { BookMetaForm, metaProblem, type BookMeta } from "@/components/add-book/book-meta-form"
import { EMPTY_COVER, type CoverValue } from "@/components/add-book/cover-picker"
import { api, errorMessage } from "@/lib/api"
import type { Library, UserBook, UserFields } from "@/lib/types"

interface BookDetailViewProps {
  book: UserBook | null
  onClose: () => void
  libraryId: string | null
  libraries: Library[]
  facets: { genres: string[]; tags: string[] }
  onChanged: (book: UserBook) => void
  onRemoved: (userBookId: string, scope: "library" | "everywhere") => void
}

function toMeta(b: UserBook["book"]): BookMeta {
  return {
    title: b.title ?? "",
    subtitle: b.subtitle ?? "",
    authors: b.authors ?? [],
    isbn: b.isbn_13 ?? "",
    publisher: b.publisher ?? "",
    published_year: b.published_year ? String(b.published_year) : "",
    description: b.description ?? "",
  }
}

function toFields(b: UserBook): UserFields {
  return {
    genres: b.genres,
    tags: b.tags,
    personal_notes: b.personal_notes,
    rating: b.rating,
    read_status: b.read_status,
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function BookDetailView({ book, onClose, libraryId, libraries, facets, onChanged, onRemoved }: BookDetailViewProps) {
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [fields, setFields] = React.useState<UserFields | null>(null)
  const [meta, setMeta] = React.useState<BookMeta | null>(null)
  const [cover, setCover] = React.useState<CoverValue>(EMPTY_COVER)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState<"library" | "everywhere" | null>(null)
  const [membership, setMembership] = React.useState<{ in: { id: string; name: string }[]; out: { id: string; name: string }[] } | null>(null)
  const [libBusy, setLibBusy] = React.useState<string | null>(null)

  const currentId = book?.user_book_id
  React.useEffect(() => {
    setEditing(false)
    setError(null)
    setMembership(null)
    if (!currentId) return
    let cancelled = false
    api
      .missingLibraries(currentId)
      .then((r) => !cancelled && setMembership({ in: r.member_of, out: r.libraries }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentId])

  if (!book) return null
  const b = book.book

  const startEdit = () => {
    setFields(toFields(book))
    setMeta(toMeta(b))
    setCover({ ...EMPTY_COVER, url: b.cover_url ?? null })
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (!fields || !meta) return
    const problem = metaProblem(meta, false)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const overrides: Record<string, unknown> = {}
      const original = toMeta(b)
      const year = meta.published_year.trim() ? Number(meta.published_year) : null
      const next = {
        title: meta.title.trim(),
        subtitle: meta.subtitle.trim() || null,
        authors: meta.authors,
        publisher: meta.publisher.trim() || null,
        published_year: year,
        description: meta.description.trim() || null,
      }
      const prev = {
        title: original.title,
        subtitle: original.subtitle || null,
        authors: original.authors,
        publisher: original.publisher || null,
        published_year: original.published_year ? Number(original.published_year) : null,
        description: original.description || null,
      }
      for (const k of Object.keys(next) as (keyof typeof next)[]) {
        if (!same(next[k], prev[k])) overrides[k] = next[k]
      }
      if (cover.blob) {
        const { cover_url } = await api.uploadCover(cover.blob)
        overrides.cover_url = cover_url
      } else if (!cover.url && b.cover_url) {
        overrides.cover_url = null
      }

      const body: Parameters<typeof api.updateBook>[1] = {}
      const orig = toFields(book)
      for (const k of Object.keys(fields) as (keyof UserFields)[]) {
        if (!same(fields[k], orig[k])) (body as Record<string, unknown>)[k] = fields[k]
      }
      if (Object.keys(overrides).length) body.overrides = overrides
      if (!Object.keys(body).length) {
        setEditing(false)
        return
      }
      const updated = await api.updateBook(book.user_book_id, body)
      onChanged(updated)
      toast.success("Saved")
      setEditing(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const resetOverrides = async () => {
    setSaving(true)
    try {
      const updated = await api.updateBook(book.user_book_id, { reset_overrides: true })
      onChanged(updated)
      toast.success("Restored the catalogue details")
      setEditing(false)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (scope: "library" | "everywhere") => {
    setDeleting(scope)
    try {
      if (scope === "library" && libraryId) await api.removeFromLibrary(libraryId, [book.user_book_id])
      else await api.deleteBooks([book.user_book_id])
      toast.success(scope === "library" ? "Removed from this library" : "Book deleted")
      setConfirmDelete(false)
      onRemoved(book.user_book_id, scope)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDeleting(null)
    }
  }

  const toggleLibrary = async (lib: { id: string; name: string }, add: boolean) => {
    setLibBusy(lib.id)
    try {
      if (add) await api.addToLibrary(lib.id, [book.user_book_id])
      else await api.removeFromLibrary(lib.id, [book.user_book_id])
      setMembership((m) =>
        m
          ? add
            ? { in: [...m.in, lib].sort((a, b) => a.name.localeCompare(b.name)), out: m.out.filter((x) => x.id !== lib.id) }
            : { in: m.in.filter((x) => x.id !== lib.id), out: [...m.out, lib].sort((a, b) => a.name.localeCompare(b.name)) }
          : m,
      )
      if (!add && lib.id === libraryId) onRemoved(book.user_book_id, "library")
      else onChanged(book)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLibBusy(null)
    }
  }

  const footer = editing ? (
    <div className="flex flex-col gap-2">
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
          <X className="size-4" /> Cancel
        </Button>
        {book.has_overrides ? (
          <Button variant="ghost" onClick={resetOverrides} disabled={saving} className="text-muted-foreground">
            <RotateCcw className="size-4" /> <span className="hidden sm:inline">Restore catalogue details</span>
            <span className="sm:hidden">Restore</span>
          </Button>
        ) : null}
        <Button onClick={save} disabled={saving} className="ml-auto">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
        <Trash2 className="size-4" /> {libraryId ? "Remove" : "Delete"}
      </Button>
      <Button onClick={startEdit} className="ml-auto">
        <Edit2 className="size-4" /> Edit
      </Button>
    </div>
  )

  return (
    <>
      <ResponsiveModal
        open
        onOpenChange={(o) => !o && !saving && onClose()}
        title={editing ? "Edit book" : b.title}
        description={editing ? "Changes to book details are saved for you only." : b.authors.join(", ") || undefined}
        footer={footer}
        dismissible={!editing && !saving}
        size="lg"
      >
        {editing && fields && meta ? (
          <div className="grid gap-8">
            <section className="grid gap-5">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your copy</h4>
              <UserFieldsForm
                value={fields}
                onChange={setFields}
                genreSuggestions={facets.genres}
                tagSuggestions={facets.tags}
                featured={{ genres: b.suggested_genres ?? [], tags: b.suggested_tags ?? [] }}
              />
            </section>
            <section className="grid gap-5 border-t pt-6">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Book details</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.is_private
                    ? "This book is private to you."
                    : "Corrections are saved to your copy only. Other readers keep seeing the catalogue version."}
                </p>
              </div>
              <BookMetaForm value={meta} onChange={setMeta} cover={cover} onCoverChange={setCover} showIsbn={false} />
            </section>
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="grid gap-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <BookCover url={b.cover_url} title={b.title} className="mx-auto w-36 sm:mx-0 sm:w-40" eager />
              <div className="min-w-0 space-y-4">
                <div>
                  {b.subtitle ? <p className="text-muted-foreground">{b.subtitle}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={book.read_status} />
                    {book.rating ? <StarRating value={book.rating} size="md" showValue /> : (
                      <span className="text-xs text-muted-foreground">Not rated</span>
                    )}
                    {b.is_private ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        <Lock className="size-3" /> Private book
                      </span>
                    ) : null}
                    {book.has_overrides ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        <PenLine className="size-3" /> Edited for you
                      </span>
                    ) : null}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                  <Meta label="Publisher" value={b.publisher} />
                  <Meta label="Published" value={b.published_year} />
                  <Meta label="Pages" value={b.page_count} />
                  <Meta label="ISBN" value={b.isbn_13 ?? b.isbn_10} mono />
                </dl>
                {book.genres.length || book.tags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {book.genres.map((g) => (
                      <span key={g} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                        {g}
                      </span>
                    ))}
                    {book.tags.map((t) => (
                      <span key={t} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {b.description ? (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">About this book</h4>
                <p className="whitespace-pre-line text-sm leading-relaxed">{b.description}</p>
              </section>
            ) : null}

            {book.personal_notes ? (
              <section className="rounded-xl border bg-muted/40 p-4">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your notes</h4>
                <p className="whitespace-pre-line text-sm italic leading-relaxed">{book.personal_notes}</p>
              </section>
            ) : null}

            {libraries.length ? (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Libraries</h4>
                {!membership ? (
                  <div className="h-8 w-48 animate-pulse rounded-full bg-muted" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {membership.in.map((l) => {
                      const pub = libraries.find((x) => x.id === l.id)?.is_public
                      return (
                        <span key={l.id} className="inline-flex items-center gap-1 rounded-full bg-primary py-1 pl-3 pr-1 text-xs text-primary-foreground">
                          {pub ? <Globe className="size-3" /> : <LibraryIcon className="size-3" />}
                          {l.name}
                          <button
                            type="button"
                            onClick={() => toggleLibrary(l, false)}
                            disabled={libBusy === l.id}
                            className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full hover:bg-primary-foreground/20"
                            aria-label={`Remove from ${l.name}`}
                          >
                            {libBusy === l.id ? <Loader2 className="size-3 animate-spin" /> : <FolderMinus className="size-3" />}
                          </button>
                        </span>
                      )
                    })}
                    {membership.out.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => toggleLibrary(l, true)}
                        disabled={libBusy === l.id}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground transition hover:border-solid hover:bg-muted hover:text-foreground"
                      >
                        {libBusy === l.id ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        )}
      </ResponsiveModal>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{libraryId ? "Remove this book?" : "Delete this book?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {libraryId
                ? "Remove it from this library only, or delete it from your collection completely, including every library and your notes."
                : "This removes the book, your notes and rating from your collection and from every library. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={!!deleting}>Cancel</AlertDialogCancel>
            {libraryId ? (
              <Button variant="outline" onClick={() => remove("library")} disabled={!!deleting}>
                {deleting === "library" && <Loader2 className="size-4 animate-spin" />} Remove from library
              </Button>
            ) : null}
            <Button variant="destructive" onClick={() => remove("everywhere")} disabled={!!deleting}>
              {deleting === "everywhere" && <Loader2 className="size-4 animate-spin" />} Delete everywhere
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Meta({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate"}>{value}</dd>
    </div>
  )
}
