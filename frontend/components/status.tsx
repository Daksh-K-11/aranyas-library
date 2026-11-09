"use client"

import { BookCheck, BookMarked, BookOpenText } from "lucide-react"
import type { ReadStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export const STATUS_META: Record<ReadStatus, { label: string; className: string; icon: typeof BookCheck }> = {
  unread: {
    label: "To read",
    className: "bg-warning/15 border-warning/40 text-[color:var(--warning)]",
    icon: BookMarked,
  },
  reading: {
    label: "Reading",
    className: "bg-info/15 border-info/40 text-[color:var(--info)]",
    icon: BookOpenText,
  },
  completed: {
    label: "Finished",
    className: "bg-success/15 border-success/40 text-[color:var(--success)]",
    icon: BookCheck,
  },
}

export function StatusBadge({ status, className }: { status: ReadStatus; className?: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.unread
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  )
}

export function StatusPicker({ value, onChange }: { value: ReadStatus; onChange: (v: ReadStatus) => void }) {
  return (
    <div role="radiogroup" aria-label="Reading status" className="grid grid-cols-3 gap-2">
      {(Object.keys(STATUS_META) as ReadStatus[]).map((s) => {
        const meta = STATUS_META[s]
        const Icon = meta.icon
        const active = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(s)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition sm:text-sm",
              active ? meta.className : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
