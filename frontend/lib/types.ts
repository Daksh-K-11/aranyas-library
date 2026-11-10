export type ReadStatus = "unread" | "reading" | "completed"

export interface Book {
  id: string | null
  title: string
  subtitle?: string | null
  authors: string[]
  publisher?: string | null
  published_year?: number | null
  description?: string | null
  categories: string[]
  cover_url?: string | null
  isbn_13?: string | null
  isbn_10?: string | null
  source?: string | null
  sources?: string[]
  page_count?: number | null
  is_private?: boolean
  user_book_id?: string | null
  /** Preset genres / tags the server suggests from the catalogue subjects. */
  suggested_genres?: string[]
  suggested_tags?: string[]
}

export type OverridableField =
  | "title"
  | "subtitle"
  | "authors"
  | "publisher"
  | "published_year"
  | "description"
  | "categories"
  | "cover_url"

export type BookOverrides = Partial<Pick<Book, OverridableField>>

export interface UserBook {
  user_book_id: string
  book_id: string
  book: Book
  genres: string[]
  tags: string[]
  rating: number | null
  read_status: ReadStatus
  personal_notes: string | null
  created_at?: string
  updated_at?: string
  added_at?: string | null
  has_overrides: boolean
  overrides: BookOverrides
}

export interface Library {
  id: string
  name: string
  is_public: boolean
  is_default: boolean
  slug: string
  book_count: number
}

export interface Paginated<T> {
  items: T[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface LibraryPage extends Paginated<UserBook> {
  library: Pick<Library, "id" | "name" | "is_public" | "is_default" | "slug">
}

export interface PublicBook {
  title: string
  subtitle?: string | null
  authors: string[]
  publisher?: string | null
  published_year?: number | null
  description?: string | null
  categories: string[]
  cover_url?: string | null
  isbn_13?: string | null
  genres: string[]
}

export interface PublicLibraryPage extends Paginated<PublicBook> {
  library: { name: string; book_count: number; genres: string[]; updated_at?: string }
}

export interface SearchCandidate {
  title: string
  subtitle?: string | null
  authors: string[]
  publisher?: string | null
  published_year?: number | null
  description?: string | null
  categories: string[]
  cover_url?: string | null
  isbn_13?: string | null
  isbn_10?: string | null
  source: string
  suggested_genres?: string[]
  suggested_tags?: string[]
}

export interface UserFields {
  genres: string[]
  tags: string[]
  personal_notes: string | null
  rating: number | null
  read_status: ReadStatus
}

export interface ListParams {
  q?: string
  genre?: string
  read_status?: ReadStatus | ""
  min_rating?: number | ""
  page?: number
  page_size?: number
  sort?: string
  order?: "asc" | "desc"
}

export const EMPTY_USER_FIELDS: UserFields = {
  genres: [],
  tags: [],
  personal_notes: null,
  rating: null,
  read_status: "unread",
}
