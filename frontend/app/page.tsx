import { Suspense } from "react"
import { BookMarked, Library, ScanLine, Share2 } from "lucide-react"
import { AuthForm } from "@/components/auth-form"
import { ThemeToggle } from "@/components/theme-toggle"

const FEATURES = [
  { icon: ScanLine, text: "Scan a barcode or type an ISBN. We search several free catalogues at once." },
  { icon: BookMarked, text: "Can't find it? Add it by hand, with a cover photo and text read from the blurb." },
  { icon: Share2, text: "Group books into libraries and share any of them with a public link." },
]

export default function LoginPage() {
  return (
    <main className="relative grid min-h-[100dvh] grid-cols-1 bg-background lg:grid-cols-2">
      <ThemeToggle className="absolute right-4 top-4 z-10" />

      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-secondary/60 p-12 lg:flex lg:flex-col lg:justify-between xl:p-20">
        <div className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-center gap-3 text-primary">
          <Library className="size-8" />
          <span className="font-serif text-2xl font-bold tracking-tight">Athenaeum</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="font-serif text-5xl leading-[1.1] text-foreground xl:text-6xl">
            Every book you own, <span className="italic text-muted-foreground">beautifully catalogued.</span>
          </h1>
          <ul className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-muted-foreground">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs uppercase tracking-widest text-muted-foreground/70">Your personal library</p>
      </section>

      {/* Form */}
      <section className="flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="mb-8 flex items-center gap-2 text-primary lg:hidden">
          <Library className="size-7" />
          <span className="font-serif text-2xl font-bold tracking-tight">Athenaeum</span>
        </div>
        <Suspense>
          <AuthForm />
        </Suspense>
      </section>
    </main>
  )
}
