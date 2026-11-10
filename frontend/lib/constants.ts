/**
 * Predefined genres and tags. People can pick these or type their own.
 * Genres also cover what used to be "categories". Keep PREDEFINED_GENRES in
 * sync with PRESET_GENRES in backend/app/services/genres.py.
 */

// Most common first: the form shows the first few as quick picks.
export const PREDEFINED_GENRES = [
  "Fantasy",
  "Science Fiction",
  "Crime & Mystery",
  "Thriller & Suspense",
  "Romance",
  "Literary Fiction",
  "Historical Fiction",
  "Biography & Memoir",
  "Self-Help",
  "History",
  "Young Adult",
  "Classics",
  "Horror",
  "Business & Economics",
  "Science & Technology",
  "Philosophy",
  "Psychology",
  "Contemporary Fiction",
  "Action & Adventure",
  "Children's Fiction",
  "Dystopian",
  "Graphic Novels & Manga",
  "Poetry",
  "Religion & Spirituality",
  "Health & Wellness",
  "Politics & Social Sciences",
  "True Crime",
  "Humor & Satire",
  "Short Stories",
  "Essays & Journalism",
  "Travel & Adventure",
  "Cookbooks & Food",
  "Art & Photography",
  "Music & Performing Arts",
  "Fiction",
  "Non-Fiction",
] as const

export const PREDEFINED_TAGS = [
  "favorite",
  "tbr",
  "must-read",
  "recommended",
  "owned",
  "kindle",
  "audiobook",
  "hardcover",
  "paperback",
  "borrowed",
  "lent-out",
  "gift",
  "signed",
  "reread",
  "bookclub",
  "abandoned",
] as const

/**
 * Merge suggestion lists in priority order, dropping case-insensitive
 * duplicates. Order is kept (not sorted) so the most relevant options are
 * the ones shown first; the first spelling seen wins, so pass the user's own
 * entries before the predefined ones.
 */
export function mergeSuggestions(...lists: ReadonlyArray<readonly string[] | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const raw of list ?? []) {
      const item = raw?.trim()
      if (!item) continue
      const key = item.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

