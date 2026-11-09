"use client"

import * as React from "react"
import {
  ArrowLeft,
  Barcode,
  BookPlus,
  CheckCircle2,
  Keyboard,
  Loader2,
  PenLine,
  ScanLine,
  Search,
  SearchX,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResponsiveModal } from "@/components/responsive-modal"
import { BookCover } from "@/components/book-cover"
import { BarcodeScanner } from "@/components/add-book/barcode-scanner"
import { LibraryPicker, UserFieldsForm } from "@/components/add-book/user-fields-form"
import { BookMetaForm, EMPTY_META, metaProblem, metaToPayload, type BookMeta } from "@/components/add-book/book-meta-form"
import { EMPTY_COVER, type CoverValue } from "@/components/add-book/cover-picker"
import { ApiError, api, errorMessage } from "@/lib/api"
import { cleanIsbn, isbnProblem } from "@/lib/isbn"
import { EMPTY_USER_FIELDS, type Book, type Library, type SearchCandidate, type UserBook, type UserFields } from "@/lib/types"

type Step = "find" | "notfound" | "review" | "manual"

const SOURCE_LABEL: Record<string, string> = {
  google_books: "Google Books",
  open_library: "Open Library",
  open_library_search: "Open Library",
  library_of_congress: "Library of Congress",
}

interface AddBookModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  libraries: Library[]
  activeLibraryId: string | null
  facets: { genres: string[]; tags: string[] }
  onAdded: (item: UserBook) => void
}

export function AddBookModal({ open, onOpenChange, libraries, activeLibraryId, facets, onAdded }: AddBookModalProps) {
  const [step, setStep] = React.useState<Step>("find")
  const [tab, setTab] = React.useState<"isbn" | "scan" | "search">("isbn")
  const [isbn, setIsbn] = React.useState("")
  const [isbnError, setIsbnError] = React.useState<string | null>(null)
  const [looking, setLooking] = React.useState(false)
  const [found, setFound] = React.useState<Book | null>(null)
  const [notFound, setNotFound] = React.useState<{ isbn: string; sources: string[] } | null>(null)

  const [query, setQuery] = React.useState("")
  const [searching, setSearching] = React.useState(false)
  const [candidates, setCandidates] = React.useState<SearchCandidate[] | null>(null)
  const [picking, setPicking] = React.useState<number | null>(null)

  const [meta, setMeta] = React.useState<BookMeta>(EMPTY_META)
  const [cover, setCover] = React.useState<CoverValue>(EMPTY_COVER)
  const [fields, setFields] = React.useState<UserFields>(EMPTY_USER_FIELDS)
  const [libraryIds, setLibraryIds] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const reset = React.useCallback(() => {
    setStep("find")
    setTab("isbn")
    setIsbn("")
    setIsbnError(null)
    setFound(null)
    setNotFound(null)
    setQuery("")
    setCandidates(null)
    setMeta(EMPTY_META)
    setCover(EMPTY_COVER)
    setFields(EMPTY_USER_FIELDS)
    setFormError(null)
    setLibraryIds(activeLibraryId ? [activeLibraryId] : [])
  }, [activeLibraryId])

  React.useEffect(() => {
    if (open) reset()
  }, [open, reset])

  // ------------------------------------------------------------ lookup
  const lookup = async (raw: string) => {
    const problem = isbnProblem(raw)
    if (problem) {
      setIsbnError(problem)
      return
    }
    const clean = cleanIsbn(raw)
    setIsbn(clean)
    setIsbnError(null)
    setLooking(true)
    try {
      const book = await api.lookupIsbn(clean)
      setFound(book)
      setStep("review")
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && e.data?.manual_allowed) {
        setNotFound({ isbn: clean, sources: e.data.checked_sources ?? [] })
        setStep("notfound")
      } else {
        setIsbnError(errorMessage(e))
        if (tab === "scan") setTab("isbn")
      }
    } finally {
      setLooking(false)
    }
  }

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (query.trim().length < 2) return
    setSearching(true)
    try {
      const { items } = await api.searchBooks(query.trim())
      setCandidates(items)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  const pickCandidate = async (c: SearchCandidate, i: number) => {
    if (c.isbn_13) {
      setPicking(i)
      try {
        const book = await api.lookupIsbn(c.isbn_13)
        setFound(book)
        setStep("review")
        return
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) {
          toast.error(errorMessage(e))
          return
        }
      } finally {
        setPicking(null)
      }
    }
    startManual({
      title: c.title,
      subtitle: c.subtitle ?? "",
      authors: c.authors,
      isbn: c.isbn_13 ?? "",
      publisher: c.publisher ?? "",
      published_year: c.published_year ? String(c.published_year) : "",
      description: c.description ?? "",
      categories: c.categories,
    }, c.cover_url ?? null)
  }

  const startManual = (prefill?: Partial<BookMeta>, coverUrl: string | null = null) => {
    setMeta({ ...EMPTY_META, ...prefill })
    setCover({ ...EMPTY_COVER, url: coverUrl })
    setFormError(null)
    setStep("manual")
  }

  // ------------------------------------------------------------ save
  const finish = (res: { created: boolean; item: UserBook; added_to_libraries: number }) => {
    if (res.created) toast.success(`Added “${res.item.book.title}”`)
    else if (res.added_to_libraries) toast.success("Already in your books. Added to the selected libraries.")
    else toast.info("This book is already in your collection.")
    onAdded(res.item)
    onOpenChange(false)
  }

  const saveFound = async () => {
    if (!found?.id) return
    setSaving(true)
    try {
      finish(await api.addBook(found.id, fields, libraryIds))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const saveManual = async () => {
    const problem = metaProblem(meta, true)
    if (problem) {
      setFormError(problem)
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      const payload = {
        ...metaToPayload(meta),
        cover_url: !cover.blob && cover.url?.startsWith("https://") ? cover.url : null,
        ...fields,
        library_ids: libraryIds,
      }
      finish(await api.addManualBook(payload, cover.blob))
    } catch (e) {
      setFormError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // ------------------------------------------------------------ render
  const back = () => {
    setFormError(null)
    setStep("find")
  }

  const title =
    step === "review" ? "Add this book?" : step === "manual" ? "Add a book manually" : step === "notfound" ? "Book not found" : "Add a book"

  const footer =
    step === "review" ? (
      <div className="flex gap-2">
        <Button variant="outline" onClick={back} className="gap-1">
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button onClick={saveFound} disabled={saving} className="flex-1 sm:flex-none sm:ml-auto">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <BookPlus className="size-4" />}
          {found?.user_book_id ? "Update libraries" : "Add to my books"}
        </Button>
      </div>
    ) : step === "manual" ? (
      <div className="flex flex-col gap-2">
        {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
        <div className="flex gap-2">
          <Button variant="outline" onClick={back} className="gap-1">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button onClick={saveManual} disabled={saving} className="flex-1 sm:flex-none sm:ml-auto">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <BookPlus className="size-4" />}
            Save book
          </Button>
        </div>
      </div>
    ) : undefined

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title={title}
      description={step === "find" ? "Scan the barcode, type the ISBN or search by title." : undefined}
      footer={footer}
      dismissible={!saving && step !== "manual"}
      size={step === "find" || step === "notfound" ? "md" : "lg"}
    >
      {step === "find" && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-5">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="isbn" className="gap-1.5">
              <Keyboard className="size-4" /> ISBN
            </TabsTrigger>
            <TabsTrigger value="scan" className="gap-1.5">
              <ScanLine className="size-4" /> Scan
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="size-4" /> Title
            </TabsTrigger>
          </TabsList>

          <TabsContent value="isbn">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                lookup(isbn)
              }}
              className="grid gap-3"
            >
              <Label htmlFor="isbn-input">ISBN (10 or 13 digits)</Label>
              <div className="relative">
                <Barcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="isbn-input"
                  value={isbn}
                  onChange={(e) => {
                    setIsbn(e.target.value)
                    setIsbnError(null)
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  placeholder="978-0-14-118280-3"
                  maxLength={20}
                  aria-invalid={!!isbnError}
                  className="h-12 pl-11 font-mono text-base tracking-wide"
                />
              </div>
              {isbnError ? <p className="text-sm text-destructive">{isbnError}</p> : null}
              <Button type="submit" disabled={looking || !isbn.trim()} className="h-11">
                {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {looking ? "Searching catalogues…" : "Find book"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="scan">
            {tab === "scan" && !looking ? (
              <BarcodeScanner onDetected={(code) => lookup(code)} />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center gap-2 rounded-xl border text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" /> Looking up {isbn}…
              </div>
            )}
          </TabsContent>

          <TabsContent value="search" className="grid gap-3">
            <form onSubmit={search} className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title, author or both"
                maxLength={200}
                className="h-11"
                autoFocus
              />
              <Button type="submit" disabled={searching || query.trim().length < 2} className="h-11">
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                <span className="sr-only sm:not-sr-only">Search</span>
              </Button>
            </form>
            {candidates && candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No matches. Try fewer words, or add it manually.</p>
            ) : null}
            {candidates?.length ? (
              <ul className="grid gap-2">
                {candidates.map((c, i) => (
                  <li key={`${c.isbn_13 ?? c.title}-${i}`}>
                    <button
                      type="button"
                      onClick={() => pickCandidate(c, i)}
                      disabled={picking !== null}
                      className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-muted disabled:opacity-60"
                    >
                      <BookCover url={c.cover_url} title={c.title} className="w-11 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium">{c.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {[c.authors.join(", "), c.published_year].filter(Boolean).join(" · ") || "Unknown author"}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70">
                          {c.isbn_13 ? `ISBN ${c.isbn_13}` : "No ISBN"} · {SOURCE_LABEL[c.source] ?? c.source}
                        </p>
                      </div>
                      {picking === i ? <Loader2 className="size-4 animate-spin" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>

          <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="ghost" onClick={() => startManual()} className="gap-2">
            <PenLine className="size-4" /> Enter details manually
          </Button>
        </Tabs>
      )}

      {step === "notfound" && notFound && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <SearchX className="size-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">
              No catalogue has ISBN <span className="font-mono">{notFound.isbn}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Checked {notFound.sources.join(", ") || "all sources"}. Small publishers and regional editions are often missing.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2">
            <Button onClick={() => startManual({ isbn: notFound.isbn })}>
              <PenLine className="size-4" /> Add it manually
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep("find")
                setTab("search")
              }}
            >
              <Search className="size-4" /> Search by title
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowLeft className="size-4" /> Try another ISBN
          </Button>
        </div>
      )}

      {step === "review" && found && (
        <div className="grid gap-6">
          <div className="flex gap-4">
            <BookCover url={found.cover_url} title={found.title} className="w-24 shrink-0 sm:w-32" eager />
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-xl font-semibold leading-tight sm:text-2xl">{found.title}</h3>
              {found.subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{found.subtitle}</p> : null}
              <p className="mt-1 text-sm">{found.authors.join(", ") || "Unknown author"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[found.publisher, found.published_year, found.isbn_13 && `ISBN ${found.isbn_13}`].filter(Boolean).join(" · ")}
              </p>
              {found.sources?.length || found.source === "user_submitted" ? (
                <p className="mt-2 text-[11px] text-muted-foreground/80">
                  Source:{" "}
                  {found.source === "user_submitted"
                    ? "added by a reader"
                    : found.sources?.map((s) => SOURCE_LABEL[s] ?? s).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                </p>
              ) : null}
              {found.user_book_id ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-[color:var(--success)]">
                  <CheckCircle2 className="size-3.5" /> Already in your books
                </p>
              ) : null}
            </div>
          </div>
          {found.description ? (
            <p className="line-clamp-5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{found.description}</p>
          ) : null}

          <LibraryPicker libraries={libraries} value={libraryIds} onChange={setLibraryIds} />
          {!found.user_book_id ? (
            <UserFieldsForm value={fields} onChange={setFields} genreSuggestions={facets.genres} tagSuggestions={facets.tags} />
          ) : null}
        </div>
      )}

      {step === "manual" && (
        <div className="grid gap-8">
          <BookMetaForm value={meta} onChange={setMeta} cover={cover} onCoverChange={setCover} />
          <div className="grid gap-5 border-t pt-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your copy</h4>
            <LibraryPicker libraries={libraries} value={libraryIds} onChange={setLibraryIds} />
            <UserFieldsForm value={fields} onChange={setFields} genreSuggestions={facets.genres} tagSuggestions={facets.tags} />
          </div>
        </div>
      )}
    </ResponsiveModal>
  )
}
