"use client"

import { Lock, PenLine } from "lucide-react"
import { BookCover } from "@/components/book-cover"
import { StarRating } from "@/components/star-rating"
import { StatusBadge } from "@/components/status"
import type { UserBook } from "@/lib/types"
import { cn } from "@/lib/utils"

/** @deprecated use UserBook from lib/types */
export type ApiBook = UserBook

interface BookCardProps {
  data: UserBook
  onOpen: (book: UserBook) => void
}

export function BookCard({ data, onOpen }: BookCardProps) {
  const { book } = data
  return (
    <button
      type="button"
      onClick={() => onOpen(data)}
      className={cn(
        "group flex h-full w-full gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "sm:gap-4 sm:p-4",
      )}
    >
      <BookCover url={book.cover_url} title={book.title} className="w-16 shrink-0 sm:w-20" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 font-serif text-base font-semibold leading-snug text-card-foreground sm:text-lg">
          {book.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
          {book.authors?.length ? book.authors.join(", ") : "Unknown author"}
          {book.published_year ? <span className="text-muted-foreground/70"> · {book.published_year}</span> : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={data.read_status} />
          {data.rating ? <StarRating value={data.rating} size="sm" /> : null}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
          {data.genres.slice(0, 2).map((g) => (
            <span key={g} className="max-w-[9rem] truncate rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
              {g}
            </span>
          ))}
          {data.genres.length > 2 ? (
            <span className="text-[11px] text-muted-foreground">+{data.genres.length - 2}</span>
          ) : null}
          {book.is_private ? (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Added manually, only visible to you">
              <Lock className="size-3" /> Private
            </span>
          ) : data.has_overrides ? (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="You edited this book's details">
              <PenLine className="size-3" /> Edited
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

export function BookCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border bg-card p-3 sm:gap-4 sm:p-4">
      <div className="aspect-[2/3] w-16 shrink-0 animate-pulse rounded-md bg-muted sm:w-20" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-20 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  )
}
