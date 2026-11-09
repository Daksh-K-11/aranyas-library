import type { Metadata } from "next"
import { PublicLibrary } from "./public-library"

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "")

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const res = await fetch(`${API}/public/library/${encodeURIComponent(slug)}/meta`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const meta = (await res.json()) as { name: string; book_count: number }
      const description = `${meta.book_count} book${meta.book_count === 1 ? "" : "s"} in this shared library.`
      return {
        title: meta.name,
        description,
        openGraph: { title: meta.name, description, type: "website" },
        robots: { index: false, follow: false },
      }
    }
  } catch {
    // Backend may be cold-starting. The page still renders client-side.
  }
  return { title: "Shared library", robots: { index: false, follow: false } }
}

export default async function PublicLibraryPage({ params }: Props) {
  const { slug } = await params
  return <PublicLibrary slug={slug} />
}
