"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BookOpen, Globe, Loader2, Plus, Search, Share2, SlidersHorizontal, X } from "lucide-react"
import { toast } from "sonner"
import { AppSidebar, ShareLibraryDialog } from "@/components/app-sidebar"
import { AddBookModal } from "@/components/add-book/add-book-modal"
import { BookCard, BookCardSkeleton } from "@/components/book-card"
import { BookDetailView } from "@/components/book-detail-view"
import { PaginationBar } from "@/components/pagination-bar"
import { STATUS_META } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useDebounce } from "@/hooks/use-debounce"
import { api, errorMessage } from "@/lib/api"
import { getToken } from "@/lib/auth"
import type { Library, ReadStatus, UserBook } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 24

const SORTS: { value: string; label: string; order: "asc" | "desc"; libraryOnly?: boolean }[] = [
  { value: "added_at:desc", label: "Recently added to library", order: "desc", libraryOnly: true },
  { value: "updated_at:desc", label: "Recently updated", order: "desc" },
  { value: "created_at:desc", label: "Newest first", order: "desc" },
  { value: "created_at:asc", label: "Oldest first", order: "asc" },
  { value: "title:asc", label: "Title A–Z", order: "asc" },
  { value: "title:desc", label: "Title Z–A", order: "desc" },
  { value: "author:asc", label: "Author A–Z", order: "asc" },
  { value: "rating:desc", label: "Highest rated", order: "desc" },
  { value: "published_year:desc", label: "Publication year", order: "desc" },
]

function DashboardContent() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // ---- URL state
  const activeLibraryId = params.get("lib")
  const page = Math.max(1, Number(params.get("page")) || 1)
  const genre = params.get("genre") ?? ""
  const status = (params.get("status") ?? "") as ReadStatus | ""
  const minRating = Number(params.get("rating")) || 0
  const defaultSort = activeLibraryId ? "added_at:desc" : "updated_at:desc"
  const sortParam = params.get("sort") ?? defaultSort
  const sortValue = SORTS.some((s) => s.value === sortParam && (!s.libraryOnly || activeLibraryId)) ? sortParam : defaultSort
  const [sort, order] = sortValue.split(":") as [string, "asc" | "desc"]

  const setParams = React.useCallback(
    (patch: Record<string, string | number | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === 0) next.delete(k)
        else next.set(k, String(v))
      }
      if (resetPage && !("page" in patch)) next.delete("page")
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const [search, setSearch] = React.useState(params.get("q") ?? "")
  const debouncedSearch = useDebounce(search.trim(), 350)
  React.useEffect(() => {
    if ((params.get("q") ?? "") !== debouncedSearch) setParams({ q: debouncedSearch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])
  const q = params.get("q") ?? ""

  // ---- auth guard
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    if (!getToken()) router.replace("/")
    else setReady(true)
  }, [router])

  // ---- data
  const [user, setUser] = React.useState<{ email: string; name?: string | null } | null>(null)
  const [libraries, setLibraries] = React.useState<Library[]>([])
  const [librariesLoading, setLibrariesLoading] = React.useState(true)
  const [facets, setFacets] = React.useState<{ genres: string[]; tags: string[] }>({ genres: [], tags: [] })
  const [books, setBooks] = React.useState<UserBook[]>([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(0)
  const [allCount, setAllCount] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  const [selected, setSelected] = React.useState<UserBook | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [shareLib, setShareLib] = React.useState<Library | null>(null)
  const [mobileSearch, setMobileSearch] = React.useState(false)

  const loadLibraries = React.useCallback(async () => {
    try {
      setLibraries(await api.libraries())
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLibrariesLoading(false)
    }
  }, [])

  const loadFacets = React.useCallback(() => {
    api.facets().then(setFacets).catch(() => {})
  }, [])

  React.useEffect(() => {
    if (!ready) return
    api.me().then(setUser).catch(() => {})
    loadLibraries()
    loadFacets()
  }, [ready, loadLibraries, loadFacets])

  React.useEffect(() => {
    if (!ready) return
    const ctrl = new AbortController()
    setLoading(true)
    setLoadError(null)
    const query = {
      q,
      genre,
      read_status: status,
      min_rating: minRating || "",
      page,
      page_size: PAGE_SIZE,
      sort,
      order,
    } as const
    const req = activeLibraryId
      ? api.listLibraryBooks(activeLibraryId, query, ctrl.signal)
      : api.listBooks(query, ctrl.signal)
    req
      .then((res) => {
        setBooks(res.items)
        setTotal(res.total)
        setTotalPages(res.total_pages)
        if (!activeLibraryId && !q && !genre && !status && !minRating) setAllCount(res.total)
        if (res.total_pages && page > res.total_pages) setParams({ page: res.total_pages }, false)
      })
      .catch((e) => {
        if ((e as Error)?.name === "AbortError") return
        if ((e as { status?: number }).status === 404 && activeLibraryId) {
          toast.error("That library no longer exists")
          setParams({ lib: null })
          return
        }
        setLoadError(errorMessage(e))
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [ready, activeLibraryId, q, genre, status, minRating, page, sort, order, reloadKey, setParams])

  React.useEffect(() => {
    if (!ready || allCount !== null) return
    api.listBooks({ page_size: 1 }).then((r) => setAllCount(r.total)).catch(() => {})
  }, [ready, allCount])

  const refreshAll = () => {
    setReloadKey((k) => k + 1)
    setAllCount(null)
    loadLibraries()
    loadFacets()
  }

  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const filterCount = (genre ? 1 : 0) + (status ? 1 : 0) + (minRating ? 1 : 0)
  const hasQuery = !!(q || filterCount)

  // Only genres the user actually has; a predefined genre with no books
  // would always filter to an empty list.
  const filterGenres = facets.genres

  const clearFilters = () => {
    setSearch("")
    setParams({ q: null, genre: null, status: null, rating: null })
  }

  if (!ready) return null

  return (
    <SidebarProvider>
      <AppSidebar
        libraries={libraries}
        loading={librariesLoading}
        activeLibraryId={activeLibraryId}
        onLibrarySelect={(id) => {
          setSearch("")
          const qs = id ? `?lib=${id}` : ""
          router.replace(`${pathname}${qs}`, { scroll: false })
        }}
        onLibrariesChange={loadLibraries}
        totalBooks={allCount}
        user={user}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:h-16 sm:gap-3 sm:px-6 md:rounded-t-xl">
          <SidebarTrigger className="-ml-1 shrink-0" />
          <div className={cn("flex min-w-0 items-center gap-2", mobileSearch && "hidden sm:flex")}>
            <h1 className="truncate font-serif text-lg font-semibold sm:text-xl">
              {activeLibraryId ? activeLibrary?.name ?? "Library" : "All my books"}
            </h1>
            {activeLibrary ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-full"
                onClick={() => setShareLib(activeLibrary)}
                aria-label="Share library"
                title={activeLibrary.is_public ? "Public. Click to share." : "Private. Click to share."}
              >
                {activeLibrary.is_public ? <Globe className="size-4 text-[color:var(--success)]" /> : <Share2 className="size-4" />}
              </Button>
            ) : null}
          </div>

          <div className={cn("ml-auto flex min-w-0 items-center gap-2", mobileSearch && "flex-1")}>
            <div className={cn("relative hidden w-full sm:block sm:w-56 lg:w-80", mobileSearch && "block")}>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, author, tag…"
                maxLength={200}
                autoFocus={mobileSearch}
                onBlur={() => !search && setMobileSearch(false)}
                className="h-9 rounded-full bg-muted/60 pl-9 sm:h-10"
                aria-label="Search books"
              />
            </div>
            {!mobileSearch ? (
              <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setMobileSearch(true)} aria-label="Search">
                <Search className="size-5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                onClick={() => {
                  setSearch("")
                  setMobileSearch(false)
                }}
                aria-label="Close search"
              >
                <X className="size-5" />
              </Button>
            )}

            <FilterPopover
              genres={filterGenres}
              genre={genre}
              status={status}
              minRating={minRating}
              sortValue={sortValue}
              inLibrary={!!activeLibraryId}
              count={filterCount}
              onChange={setParams}
            />

            <Button onClick={() => setAddOpen(true)} className="h-9 shrink-0 gap-1.5 rounded-full px-3 sm:h-10 sm:px-4">
              <Plus className="size-4" />
              <span className="hidden sm:inline">Add book</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6">
          {/* Controls & Filter Bar: visible & working on all screen sizes */}
          <div className="mb-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap">
              {/* Genre Dropdown */}
              <div className="shrink-0">
                <Select value={genre || "all"} onValueChange={(v) => setParams({ genre: v === "all" ? null : v })}>
                  <SelectTrigger
                    className={cn(
                      "h-9 rounded-full px-3 text-xs sm:text-sm font-medium border transition-colors",
                      genre
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="Filter by genre"
                  >
                    <span className="truncate max-w-[120px] sm:max-w-[160px]">
                      {genre ? `Genre: ${genre}` : "All genres"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-80 z-[100]">
                    <SelectItem value="all">All genres</SelectItem>
                    {filterGenres.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Dropdown */}
              <div className="shrink-0">
                <Select value={status || "all"} onValueChange={(v) => setParams({ status: v === "all" ? null : v })}>
                  <SelectTrigger
                    className={cn(
                      "h-9 rounded-full px-3 text-xs sm:text-sm font-medium border transition-colors",
                      status
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="Filter by status"
                  >
                    <span className="truncate max-w-[120px] sm:max-w-[160px]">
                      {status ? `Status: ${STATUS_META[status]?.label || status}` : "All status"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-80 z-[100]">
                    <SelectItem value="all">All status</SelectItem>
                    {(Object.keys(STATUS_META) as ReadStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Dropdown */}
              <div className="shrink-0">
                <Select value={sortValue} onValueChange={(v) => setParams({ sort: v })}>
                  <SelectTrigger
                    className="h-9 rounded-full px-3 text-xs sm:text-sm font-medium border bg-background text-muted-foreground hover:text-foreground"
                    aria-label="Sort books"
                  >
                    <span className="truncate max-w-[140px] sm:max-w-[200px]">
                      Sort: {SORTS.find((s) => s.value === sortValue)?.label || "Sort"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-80 z-[100]">
                    {SORTS.filter((s) => !s.libraryOnly || !!activeLibraryId).map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rating Dropdown */}
              <div className="shrink-0">
                <Select
                  value={minRating ? String(minRating) : "all"}
                  onValueChange={(v) => setParams({ rating: v === "all" ? null : Number(v) })}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 rounded-full px-3 text-xs sm:text-sm font-medium border transition-colors",
                      minRating
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                    aria-label="Filter by rating"
                  >
                    <span className="truncate">
                      {minRating ? `${minRating}★ & up` : "Rating"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-80 z-[100]">
                    <SelectItem value="all">Any rating</SelectItem>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        {r}★ & up
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clear filters shortcut */}
              {hasQuery ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 rounded-full"
                >
                  Clear all
                </Button>
              ) : null}
            </div>

            {/* Active Query & Filter Summary Chips */}
            {hasQuery ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {loading ? "Searching…" : `${total} result${total === 1 ? "" : "s"}`}
                </span>
                {q ? <Chip onRemove={() => { setSearch(""); setParams({ q: null }) }}>“{q}”</Chip> : null}
                {genre ? <Chip onRemove={() => setParams({ genre: null })}>{genre}</Chip> : null}
                {status ? <Chip onRemove={() => setParams({ status: null })}>{STATUS_META[status]?.label}</Chip> : null}
                {minRating ? <Chip onRemove={() => setParams({ rating: null })}>{minRating}★ and up</Chip> : null}
              </div>
            ) : null}
          </div>

          {loadError ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
              <p className="text-muted-foreground">{loadError}</p>
              <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          ) : loading && !books.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <BookCardSkeleton key={i} />
              ))}
            </div>
          ) : books.length ? (
            <>
              <div
                className={cn(
                  "grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4",
                  loading && "opacity-60",
                )}
                aria-busy={loading}
              >
                {books.map((b) => (
                  <BookCard key={b.user_book_id} data={b} onOpen={setSelected} />
                ))}
              </div>
              <PaginationBar
                className="mt-8"
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => {
                  setParams({ page: p }, false)
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }}
              />
            </>
          ) : hasQuery ? (
            <EmptyState
              title="No books match"
              text="Try a different search or remove some filters."
              action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              title={activeLibraryId ? "This library is empty" : "Your library is waiting"}
              text={
                activeLibraryId
                  ? "Add a new book here, or open any book in All my books and add it to this library."
                  : "Scan a barcode, type an ISBN or add a book by hand to start your collection."
              }
              action={
                <Button onClick={() => setAddOpen(true)} className="rounded-full px-6">
                  <Plus className="size-4" /> Add your first book
                </Button>
              }
            />
          )}
          {loading && books.length ? (
            <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-foreground/90 px-3 py-1.5 text-xs text-background shadow-lg">
              <Loader2 className="mr-1 inline size-3 animate-spin" /> Loading
            </div>
          ) : null}
        </main>
      </SidebarInset>

      <AddBookModal
        open={addOpen}
        onOpenChange={setAddOpen}
        libraries={libraries}
        activeLibraryId={activeLibraryId}
        facets={facets}
        onAdded={refreshAll}
      />

      {selected ? (
        <BookDetailView
          book={selected}
          onClose={() => setSelected(null)}
          libraryId={activeLibraryId}
          libraries={libraries}
          facets={facets}
          onChanged={(updated) => {
            setSelected(updated)
            setBooks((prev) => prev.map((b) => (b.user_book_id === updated.user_book_id ? { ...b, ...updated } : b)))
            loadLibraries()
            loadFacets()
          }}
          onRemoved={() => {
            setSelected(null)
            refreshAll()
          }}
        />
      ) : null}

      <ShareLibraryDialog
        library={shareLib}
        onClose={() => setShareLib(null)}
        onChanged={(lib) => {
          setShareLib(lib)
          loadLibraries()
        }}
      />
    </SidebarProvider>
  )
}

function FilterPopover({
  genres,
  genre,
  status,
  minRating,
  sortValue,
  inLibrary,
  count,
  onChange,
}: {
  genres: string[]
  genre: string
  status: string
  minRating: number
  sortValue: string
  inLibrary: boolean
  count: number
  onChange: (p: Record<string, string | number | null>) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative size-9 shrink-0 rounded-full sm:size-10" aria-label="Filter and sort">
          <SlidersHorizontal className="size-4" />
          {count ? (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null
          if (target?.closest?.('[data-slot="select-content"]') || target?.closest?.('[data-slot="select-item"]')) {
            e.preventDefault()
          }
        }}
        className="w-[min(20rem,calc(100vw-1.5rem))] space-y-4 z-50"
      >
        <div className="grid gap-1.5">
          <Label>Sort by</Label>
          <Select value={sortValue} onValueChange={(v) => onChange({ sort: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.filter((s) => !s.libraryOnly || inLibrary).map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Reading status</Label>
          <Select value={status || "all"} onValueChange={(v) => onChange({ status: v === "all" ? null : v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {(Object.keys(STATUS_META) as ReadStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Genre</Label>
          <Select value={genre || "all"} onValueChange={(v) => onChange({ genre: v === "all" ? null : v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">Any genre</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Minimum rating</Label>
          <div className="grid grid-cols-6 gap-1">
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChange({ rating: r || null })}
                className={cn(
                  "rounded-md border py-1.5 text-xs font-medium transition",
                  minRating === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {r ? `${r}★` : "Any"}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary py-0.5 pl-3 pr-1 text-xs text-secondary-foreground">
      <span className="truncate">{children}</span>
      <button onClick={onRemove} className="inline-flex size-5 items-center justify-center rounded-full hover:bg-foreground/10" aria-label="Remove filter">
        <X className="size-3" />
      </button>
    </span>
  )
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-secondary">
        <BookOpen className="size-8 text-muted-foreground" />
      </div>
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <p className="mb-6 mt-2 max-w-sm text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <React.Suspense fallback={null}>
      <DashboardContent />
    </React.Suspense>
  )
}
