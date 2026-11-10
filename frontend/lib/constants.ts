/**
 * Standard predefined options for genres, categories, and tags.
 * Users can pick from these presets or create their own custom ones on any screen.
 */

export const PREDEFINED_GENRES = [
  "Action & Adventure",
  "Art & Photography",
  "Biography & Memoir",
  "Business & Economics",
  "Children's Fiction",
  "Classics",
  "Contemporary Fiction",
  "Cookbooks & Food",
  "Crime & Mystery",
  "Dystopian",
  "Essays & Journalism",
  "Fantasy",
  "Graphic Novels & Manga",
  "Health & Wellness",
  "Historical Fiction",
  "History",
  "Horror",
  "Humor & Satire",
  "Literary Fiction",
  "Music & Performing Arts",
  "Philosophy",
  "Poetry",
  "Politics & Social Sciences",
  "Psychology",
  "Religion & Spirituality",
  "Romance",
  "Science & Technology",
  "Science Fiction",
  "Self-Help",
  "Short Stories",
  "Thriller & Suspense",
  "Travel & Adventure",
  "True Crime",
  "Young Adult",
] as const

export const PREDEFINED_CATEGORIES = [
  "Fiction",
  "Non-Fiction",
  "Literature",
  "Science",
  "Technology",
  "History",
  "Philosophy",
  "Social Sciences",
  "Arts & Humanities",
  "Business & Finance",
  "Health & Medicine",
  "Education & Reference",
  "Comics & Graphic Novels",
  "Children & Teens",
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
 * Merge a predefined list with user custom entries, deduplicating case-insensitively.
 */
export function mergeSuggestions(
  predefined: readonly string[],
  userItems: string[] = []
): string[] {
  const map = new Map<string, string>()

  // Add user items first so their exact casing takes precedence
  for (const item of userItems) {
    if (item && item.trim()) {
      map.set(item.trim().toLowerCase(), item.trim())
    }
  }

  // Add predefined items if not already present
  for (const item of predefined) {
    if (item && item.trim()) {
      const key = item.trim().toLowerCase()
      if (!map.has(key)) {
        map.set(key, item.trim())
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  )
}
