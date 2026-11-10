"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BookOpen, Library, Lock, Search } from "lucide-react"
import { BookCover } from "@/components/book-cover"
import { PaginationBar } from "@/components/pagination-bar"
import { ResponsiveModal } from "@/components/responsive-modal"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDebounce } from "@/hooks/use-debounce"
import { ApiError, api, errorMessage } from "@/lib/api"
import { PREDEFINED_GENRES } from "@/lib/constants"
import type { PublicBook, PublicLibraryPage } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 24
const SORTS = [
  { value: "added_at:desc", label: "Recently added" },
  { value: "title:asc", label: "Title A–Z" },
  { value: "author:asc", label: "Author A–Z" },
  { value: "published_year:desc", label: "Newest editions" },
]

export function PublicLibrary({ slug }: { slug: string }) {
  return (
    <React.Suspense fallback={null}>
      <PublicLibraryInner slug={slug} />
    </React.Suspense>
  )
}

function PublicLibraryInner({ slug }: { slug: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const page = Math.max(1, Number(params.get("page")) || 1)
  const genre = params.get("genre") ?? ""
  const sortValue = SORTS.some((s) => s.value === params.get("sort")) ? params.get("sort")! : SORTS[0].value
  const [sort, order] = sortValue.split(":") as [string, "asc" | "desc"]

  const [search, setSearch] = React.useState(params.get("q") ?? "")
  const q = useDebounce(search.trim(), 350)

  const [data, setData] = React.useState<PublicLibraryPage | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<{ notFound: boolean; message: string } | null>(null)
  const [selected, setSelected] = React.useState<PublicBook | null>(null)

  const setParams = React.useCallback(
    (patch: Record<string, string | number | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k)
        else next.set(k, String(v))
      }
      if (resetPage && !("page" in patch)) next.delete("page")
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  React.useEffect(() => {
    if ((params.get("q") ?? "") !== q) setParams({ q })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  React.useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    api
      .publicLibrary(slug, { q: params.get("q") ?? "", genre, page, page_size: PAGE_SIZE, sort, order }, ctrl.signal)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => {
        if ((e as Error)?.name === "AbortError") return
        setError({ notFound: e instanceof ApiError && e.status === 404, message: errorMessage(e) })
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false))
    return () => ctrl.abort()
  }, [slug, params, genre, page, sort, order])

  if (error?.notFound) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-secondary">
            <Lock className="size-7 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-2xl font-semibold">This library isn&apos;t available</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            The link may be wrong, or the owner has made the library private or created a new link.
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link href="/">Create your own library</Link>
          </Button>
        </div>
      </Shell>
    )
  }

  const lib = data?.library

  return (
    <Shell>
      <section className="border-b bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shared library</p>
          {lib ? (
            <>
              <h1 className="mt-2 break-words font-serif text-3xl font-semibold sm:text-5xl">{lib.name}</h1>
              <p className="mt-2 text-muted-foreground">
                {lib.book_count} book{lib.book_count === 1 ? "" : "s"}
              </p>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="h-10 w-64 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or author"
              maxLength={200}
              className="h-10 rounded-full pl-9"
              aria-label="Search this library"
            />
          </div>
          <div className="flex flex-wrap sm:flex-nowrap gap-2">
            <Select value={genre || "all"} onValueChange={(v) => setParams({ genre: v === "all" ? null : v })}>
              <SelectTrigger className="h-10 flex-1 sm:w-44 sm:flex-none rounded-full" aria-label="Genre">
                <SelectValue placeholder="All genres" />
              </SelectTrigger>
              <SelectContent className="max-h-80 z-[100]">
                <SelectItem value="all">All genres</SelectItem>
                {((lib?.genres && lib.genres.length > 0) ? lib.genres : PREDEFINED_GENRES).map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortValue} onValueChange={(v) => setParams({ sort: v })}>
              <SelectTrigger className="h-10 flex-1 sm:w-44 sm:flex-none rounded-full" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80 z-[100]">
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <p className="text-muted-foreground">{error.message}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : !data && loading ? (
          <Grid>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[2/3] w-full animate-pulse rounded-md bg-muted" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </Grid>
        ) : data && data.items.length ? (
          <>
            <Grid className={cn(loading && "opacity-60 transition-opacity")}>
              {data.items.map((b, i) => (
                <button
                  key={`${b.isbn_13 ?? b.title}-${i}`}
                  type="button"
                  onClick={() => setSelected(b)}
                  className="group text-left focus-visible:outline-none"
                >
                  <BookCover
                    url={b.cover_url}
                    title={b.title}
                    className="w-full transition group-hover:-translate-y-1 group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-ring"
                  />
                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{b.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{b.authors.join(", ") || "Unknown author"}</p>
                </button>
              ))}
            </Grid>
            <PaginationBar
              className="mt-10"
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              pageSize={data.page_size}
              onPageChange={(p) => {
                setParams({ page: p }, false)
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
            />
          </>
        ) : (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <BookOpen className="mb-3 size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {params.get("q") || genre ? "No books match your search." : "This library has no books yet."}
            </p>
          </div>
        )}
      </div>

      {selected ? (
        <ResponsiveModal open onOpenChange={(o) => !o && setSelected(null)} title={selected.title} description={selected.authors.join(", ")} size="lg">
          <div className="grid gap-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <BookCover url={selected.cover_url} title={selected.title} className="mx-auto w-36 sm:mx-0 sm:w-40" eager />
            <div className="min-w-0 space-y-4">
              {selected.subtitle ? <p className="text-muted-foreground">{selected.subtitle}</p> : null}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {selected.publisher ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Publisher</dt>
                    <dd>{selected.publisher}</dd>
                  </div>
                ) : null}
                {selected.published_year ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Published</dt>
                    <dd>{selected.published_year}</dd>
                  </div>
                ) : null}
                {selected.isbn_13 ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ISBN</dt>
                    <dd className="font-mono text-xs">{selected.isbn_13}</dd>
                  </div>
                ) : null}
              </dl>
              {selected.genres.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {selected.genres.map((g) => (
                    <span key={g} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}
              {selected.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed">{selected.description}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No description available.</p>
              )}
            </div>
          </div>
        </ResponsiveModal>
      ) : null}
    </Shell>
  )
}

function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-6 min-[480px]:grid-cols-3 sm:gap-x-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-primary">
            <Library className="size-5" />
            <span className="font-serif text-lg font-bold">Athenaeum</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href="/">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
