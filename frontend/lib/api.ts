import { clearToken, getToken } from "@/lib/auth"
import type {
  Book,
  BookOverrides,
  Library,
  LibraryPage,
  ListParams,
  Paginated,
  PublicLibraryPage,
  SearchCandidate,
  UserBook,
  UserFields,
} from "@/lib/types"

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "")

export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, message: string, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

function messageFrom(data: any, status: number): string {
  const detail = data?.detail ?? data?.error
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d: any) => {
        const loc = Array.isArray(d.loc) ? d.loc.filter((x: any) => x !== "body") : []
        const field = loc.length ? String(loc[loc.length - 1]).replace(/_/g, " ") : ""
        const msg = String(d.msg || "Invalid value").replace(/^Value error, /, "")
        return field ? `${field}: ${msg}` : msg
      })
      .join("; ")
  }
  if (status === 429) return "Too many requests. Please wait a moment and try again."
  if (status >= 500) return "The server had a problem. Please try again."
  return "Request failed"
}

type QueryValue = string | number | boolean | undefined | null
type FetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  auth?: boolean
  query?: Record<string, QueryValue>
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { auth = true, query, body, headers, ...rest } = opts
  const url = new URL(API_BASE_URL + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v))
    }
  }
  const h = new Headers(headers)
  if (auth) {
    const token = getToken()
    if (!token) {
      handleUnauthorized()
      throw new ApiError(401, "Please sign in again")
    }
    h.set("Authorization", `Bearer ${token}`)
  }
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    h.set("Content-Type", "application/json")
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), { ...rest, headers: h, body: payload })
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e
    throw new ApiError(0, "Can't reach the server. Check your connection.")
  }

  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    if (res.status === 401 && auth) handleUnauthorized()
    throw new ApiError(res.status, messageFrom(data, res.status), data)
  }
  return data as T
}

function handleUnauthorized() {
  clearToken()
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard")) {
    window.location.replace("/?expired=1")
  }
}

/** Resolve a stored cover URL into something an <img> can load. */
export function coverSrc(url?: string | null): string | null {
  if (!url) return null
  if (url.startsWith("/covers/")) return API_BASE_URL + url
  if (url.startsWith("http://")) return "https://" + url.slice(7)
  if (url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) return url
  return null
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return "Something went wrong"
}

type AddResult = { created: boolean; item: UserBook; message: string; added_to_libraries: number }
type UpdateBody = Partial<UserFields> & {
  overrides?: { [K in keyof BookOverrides]?: BookOverrides[K] | null }
  reset_overrides?: boolean
}

function listQuery(p: ListParams): Record<string, QueryValue> {
  return { ...p } as Record<string, QueryValue>
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string }>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (email: string, password: string, name?: string) =>
    apiFetch("/auth/register", { method: "POST", body: { email, password, name: name || null }, auth: false }),
  me: () => apiFetch<{ id: string; email: string; name?: string | null }>("/auth/me"),

  listBooks: (p: ListParams, signal?: AbortSignal) =>
    apiFetch<Paginated<UserBook>>("/books", { query: listQuery(p), signal }),
  listLibraryBooks: (libraryId: string, p: ListParams, signal?: AbortSignal) =>
    apiFetch<LibraryPage>(`/librarybooks/${libraryId}`, { query: listQuery(p), signal }),
  facets: () => apiFetch<{ genres: string[]; tags: string[] }>("/books/facets"),
  getBook: (userBookId: string) => apiFetch<UserBook>(`/books/${userBookId}`),

  lookupIsbn: (isbn: string) => apiFetch<Book>("/isbn", { query: { isbn } }),
  searchBooks: (q: string) => apiFetch<{ items: SearchCandidate[] }>("/isbn/search", { query: { q } }),

  addBook: (bookId: string, fields: UserFields, libraryIds: string[]) =>
    apiFetch<AddResult>("/books", {
      method: "POST",
      body: { book_id: bookId, ...fields, library_ids: libraryIds },
    }),
  addManualBook: (data: Record<string, unknown>, cover?: Blob | null) => {
    const fd = new FormData()
    fd.set("data", JSON.stringify(data))
    if (cover) fd.set("cover", cover, cover.type === "image/jpeg" ? "cover.jpg" : "cover.webp")
    return apiFetch<AddResult>("/books/manual", { method: "POST", body: fd })
  },
  updateBook: (userBookId: string, body: UpdateBody) =>
    apiFetch<UserBook>(`/books/${userBookId}`, { method: "PATCH", body }),
  deleteBooks: (ids: string[]) => apiFetch("/books", { method: "DELETE", body: { user_book_ids: ids } }),
  uploadCover: (file: Blob) => {
    const fd = new FormData()
    fd.set("file", file, file.type === "image/jpeg" ? "cover.jpg" : "cover.webp")
    return apiFetch<{ cover_url: string }>("/covers", { method: "POST", body: fd })
  },

  libraries: () => apiFetch<Library[]>("/library"),
  createLibrary: (name: string, is_public: boolean) =>
    apiFetch<{ library: Library }>("/library", { method: "POST", body: { name, is_public } }),
  updateLibrary: (id: string, body: { name?: string; is_public?: boolean }) =>
    apiFetch<{ library: Library }>(`/library/${id}`, { method: "PATCH", body }),
  regenerateLink: (id: string) => apiFetch<{ library: Library }>(`/library/${id}/regenerate-link`, { method: "POST" }),
  deleteLibrary: (id: string) => apiFetch(`/library/${id}`, { method: "DELETE" }),
  missingLibraries: (userBookId: string) =>
    apiFetch<{ libraries: { id: string; name: string }[]; member_of: { id: string; name: string }[] }>(
      "/librarybooks/missing-libraries",
      { query: { user_book_id: userBookId } },
    ),
  addToLibrary: (libraryId: string, ids: string[]) =>
    apiFetch(`/librarybooks/${libraryId}`, { method: "POST", body: { user_book_ids: ids } }),
  removeFromLibrary: (libraryId: string, ids: string[]) =>
    apiFetch(`/librarybooks/${libraryId}`, { method: "DELETE", body: { user_book_ids: ids } }),

  publicLibrary: (slug: string, p: ListParams, signal?: AbortSignal) =>
    apiFetch<PublicLibraryPage>(`/public/library/${encodeURIComponent(slug)}`, {
      query: listQuery(p),
      auth: false,
      signal,
    }),
}
