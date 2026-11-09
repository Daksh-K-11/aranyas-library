"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PaginationBarProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}

/** Page numbers with ellipses: 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, total: number, siblings: number): (number | "…")[] {
  const pages: (number | "…")[] = []
  const start = Math.max(2, page - siblings)
  const end = Math.min(total - 1, page + siblings)
  pages.push(1)
  if (start > 2) pages.push("…")
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < total - 1) pages.push("…")
  if (total > 1) pages.push(total)
  return pages
}

export function PaginationBar({ page, totalPages, total, pageSize, onPageChange, className }: PaginationBarProps) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}
    >
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="gap-1 px-2"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Prev</span>
          </Button>

          {/* compact on phones, full list from sm up */}
          <span className="px-2 text-sm tabular-nums sm:hidden">
            {page} / {totalPages}
          </span>
          <div className="hidden items-center gap-1 sm:flex">
            {pageList(page, totalPages, 1).map((p, i) =>
              p === "…" ? (
                <span key={`e${i}`} className="px-1.5 text-muted-foreground" aria-hidden>
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onPageChange(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Page ${p}`}
                  className="min-w-9 tabular-nums"
                >
                  {p}
                </Button>
              ),
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="gap-1 px-2"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </nav>
  )
}
