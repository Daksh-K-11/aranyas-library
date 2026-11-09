"use client"

import * as React from "react"
import { BookOpen } from "lucide-react"
import { coverSrc } from "@/lib/api"
import { cn } from "@/lib/utils"

interface BookCoverProps {
  url?: string | null
  title?: string
  className?: string
  iconClassName?: string
  eager?: boolean
}

export function BookCover({ url, title, className, iconClassName, eager }: BookCoverProps) {
  const src = coverSrc(url)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => setFailed(false), [src])

  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-md bg-gradient-to-br from-secondary to-muted shadow-sm ring-1 ring-black/5",
        className,
      )}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={title ? `Cover of ${title}` : "Book cover"}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center">
          <BookOpen className={cn("size-7 text-muted-foreground/50", iconClassName)} aria-hidden />
          {title ? (
            <span className="line-clamp-3 font-serif text-[11px] leading-tight text-muted-foreground">{title}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
