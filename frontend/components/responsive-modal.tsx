"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ResponsiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  size?: "sm" | "md" | "lg" | "xl"
  /** Prevent closing on outside click (e.g. while saving or editing). */
  dismissible?: boolean
  className?: string
}

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
}

/**
 * A dialog that is a full-screen sheet on phones and a centered card from
 * the `sm` breakpoint up. Header and footer stay put, the body scrolls.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  footer,
  children,
  size = "lg",
  dismissible = true,
  className,
}: ResponsiveModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onInteractOutside={(e) => {
            if (!dismissible) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault()
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-background text-foreground shadow-2xl outline-none",
            // phone: full screen
            "inset-0 h-[100dvh] w-full",
            // tablet+: centered card
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(90dvh,900px)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
            SIZES[size],
            className,
          )}
        >
          <div className="flex items-start gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-lg font-semibold leading-tight sm:text-xl">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Dialog</DialogPrimitive.Description>
              )}
            </div>
            {headerActions}
            <DialogPrimitive.Close
              className="-mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <XIcon className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          {footer ? <div className="border-t px-4 py-3 pb-safe sm:px-6 sm:py-4">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
