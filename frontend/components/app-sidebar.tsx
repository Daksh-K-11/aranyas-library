"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  LibraryIcon,
  Loader2,
  Lock,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ThemeToggle } from "@/components/theme-toggle"
import { api, errorMessage } from "@/lib/api"
import { clearToken } from "@/lib/auth"
import type { Library } from "@/lib/types"

interface AppSidebarProps {
  libraries: Library[]
  loading: boolean
  activeLibraryId: string | null
  onLibrarySelect: (id: string | null) => void
  onLibrariesChange: () => void
  totalBooks: number | null
  user?: { email: string; name?: string | null } | null
}

export function publicLibraryUrl(slug: string) {
  return `${window.location.origin}/library/${slug}`
}

export function AppSidebar({
  libraries,
  loading,
  activeLibraryId,
  onLibrarySelect,
  onLibrariesChange,
  totalBooks,
  user,
}: AppSidebarProps) {
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [renameLib, setRenameLib] = React.useState<Library | null>(null)
  const [shareLib, setShareLib] = React.useState<Library | null>(null)
  const [deleteLib, setDeleteLib] = React.useState<Library | null>(null)

  const select = (id: string | null) => {
    onLibrarySelect(id)
    if (isMobile) setOpenMobile(false)
  }

  const logout = () => {
    clearToken()
    router.replace("/")
  }

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="px-4 pt-5 pb-2">
        <div className="flex items-center gap-2.5 text-primary">
          <LibraryIcon className="size-6" />
          <span className="font-serif text-xl font-bold tracking-tight">Athenaeum</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeLibraryId === null}
                onClick={() => select(null)}
                className="h-10"
              >
                <BookOpen />
                <span className="font-medium">All my books</span>
              </SidebarMenuButton>
              {totalBooks !== null ? <SidebarMenuBadge>{totalBooks}</SidebarMenuBadge> : null}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider">Libraries</SidebarGroupLabel>
          <SidebarGroupAction title="New library" onClick={() => setCreateOpen(true)}>
            <Plus /> <span className="sr-only">New library</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))
                : libraries.map((lib) => (
                    <SidebarMenuItem key={lib.id}>
                      <SidebarMenuButton
                        isActive={activeLibraryId === lib.id}
                        onClick={() => select(lib.id)}
                        className="h-10 pr-14"
                        tooltip={lib.name}
                      >
                        {lib.is_public ? <Globe className="text-[color:var(--success)]" /> : <LibraryIcon />}
                        <span className="truncate font-medium">{lib.name}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="right-8">{lib.book_count}</SidebarMenuBadge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction showOnHover aria-label={`Options for ${lib.name}`}>
                            <MoreHorizontal />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="start" className="w-52">
                          <DropdownMenuItem onClick={() => setShareLib(lib)}>
                            <Share2 /> Share…
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRenameLib(lib)}>
                            <Edit3 /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteLib(lib)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
              {!loading && libraries.length === 0 ? (
                <li className="px-2 py-3 text-xs text-muted-foreground">
                  Group books into libraries, like &ldquo;Lent out&rdquo; or &ldquo;Sci-fi&rdquo;, and share them.
                </li>
              ) : null}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setCreateOpen(true)} className="h-10 text-muted-foreground">
                  <Plus />
                  <span>New library</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold uppercase text-primary-foreground">
            {(user?.name || user?.email || "?").slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name || "Reader"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
          </div>
          <ThemeToggle />
        </div>
        <Button variant="ghost" onClick={logout} className="justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="size-4" /> Sign out
        </Button>
      </SidebarFooter>

      <CreateLibraryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(lib) => {
          onLibrariesChange()
          select(lib.id)
        }}
      />
      <RenameLibraryDialog library={renameLib} onClose={() => setRenameLib(null)} onSaved={onLibrariesChange} />
      <ShareLibraryDialog
        library={shareLib}
        onClose={() => setShareLib(null)}
        onChanged={(lib) => {
          setShareLib(lib)
          onLibrariesChange()
        }}
      />
      <DeleteLibraryDialog
        library={deleteLib}
        onClose={() => setDeleteLib(null)}
        onDeleted={(id) => {
          if (activeLibraryId === id) onLibrarySelect(null)
          onLibrariesChange()
        }}
      />
    </Sidebar>
  )
}

// ---------------------------------------------------------------- dialogs
function CreateLibraryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (lib: Library) => void
}) {
  const [name, setName] = React.useState("")
  const [isPublic, setIsPublic] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName("")
      setIsPublic(false)
    }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const { library } = await api.createLibrary(name.trim(), isPublic)
      toast.success(`Created “${library.name}”`)
      onOpenChange(false)
      onCreated(library)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New library</DialogTitle>
            <DialogDescription>A library is a shelf for grouping books. A book can be on many shelves.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="lib-name">Name</Label>
            <Input
              id="lib-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Favourites"
              maxLength={100}
              autoFocus
              required
            />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Public link</span>
              <span className="block text-xs text-muted-foreground">Anyone with the link can browse this library.</span>
            </span>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()} className="w-full sm:w-auto">
              {busy && <Loader2 className="size-4 animate-spin" />} Create library
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RenameLibraryDialog({
  library,
  onClose,
  onSaved,
}: {
  library: Library | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => setName(library?.name ?? ""), [library])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!library || !name.trim()) return
    setBusy(true)
    try {
      await api.updateLibrary(library.id, { name: name.trim() })
      toast.success("Library renamed")
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!library} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Rename library</DialogTitle>
            <DialogDescription>Shared links keep working after a rename.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus required />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || name.trim() === library?.name}>
              {busy && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ShareLibraryDialog({
  library,
  onClose,
  onChanged,
}: {
  library: Library | null
  onClose: () => void
  onChanged: (lib: Library) => void
}) {
  const [busy, setBusy] = React.useState<"toggle" | "regen" | null>(null)
  const url = library ? publicLibraryUrl(library.slug) : ""

  const toggle = async (value: boolean) => {
    if (!library) return
    setBusy("toggle")
    try {
      const { library: updated } = await api.updateLibrary(library.id, { is_public: value })
      onChanged(updated)
      toast.success(value ? "Library is now public" : "Library is now private")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const regenerate = async () => {
    if (!library) return
    setBusy("regen")
    try {
      const { library: updated } = await api.regenerateLink(library.id)
      onChanged(updated)
      toast.success("New link created. The old link no longer works.")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied")
    } catch {
      toast.error("Could not copy. Select the link and copy it manually.")
    }
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: library?.name, url })
      } catch {}
    } else copy()
  }

  return (
    <Dialog open={!!library} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{library?.name}”</DialogTitle>
          <DialogDescription>
            Visitors see covers, titles, authors, descriptions and genres. Your ratings, notes, tags and reading status stay private.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span className="flex items-center gap-3">
            {library?.is_public ? (
              <Globe className="size-5 text-[color:var(--success)]" />
            ) : (
              <Lock className="size-5 text-muted-foreground" />
            )}
            <span>
              <span className="block text-sm font-medium">{library?.is_public ? "Public" : "Private"}</span>
              <span className="block text-xs text-muted-foreground">
                {library?.is_public ? "Anyone with the link can view" : "Only you can see this library"}
              </span>
            </span>
          </span>
          <Switch checked={!!library?.is_public} disabled={busy !== null} onCheckedChange={toggle} />
        </label>

        {library?.is_public ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button variant="secondary" size="icon" onClick={copy} aria-label="Copy link">
                <Copy className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={share}>
                <Share2 className="size-4" /> Share
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> Open
                </a>
              </Button>
              <Button variant="ghost" size="sm" onClick={regenerate} disabled={busy !== null} className="sm:ml-auto">
                {busy === "regen" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                New link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Creating a new link stops the old one from working, in case it was shared too widely.
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Turn on the public link to get a URL you can share.
          </p>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteLibraryDialog({
  library,
  onClose,
  onDeleted,
}: {
  library: Library | null
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [countdown, setCountdown] = React.useState(3)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!library) return
    setCountdown(3)
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? (clearInterval(t), 0) : c - 1)), 1000)
    return () => clearInterval(t)
  }, [library])

  const confirm = async () => {
    if (!library) return
    setBusy(true)
    try {
      await api.deleteLibrary(library.id)
      toast.success(`Deleted “${library.name}”`)
      onDeleted(library.id)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={!!library} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{library?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The library and its public link will be removed. The {library?.book_count ?? 0} book
            {library?.book_count === 1 ? "" : "s"} in it stay in <strong>All my books</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={countdown > 0 || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {countdown > 0 ? `Delete (${countdown})` : "Delete library"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
