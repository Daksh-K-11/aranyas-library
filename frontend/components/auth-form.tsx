"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, errorMessage } from "@/lib/api"
import { getToken, storeToken } from "@/lib/auth"
import { cn } from "@/lib/utils"

type Mode = "login" | "register"

export function AuthForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = React.useState<Mode>("login")
  const [loading, setLoading] = React.useState(false)
  const [showPw, setShowPw] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [password, setPassword] = React.useState("")

  React.useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard")
      return
    }
    if (params.get("expired")) toast.info("Your session expired. Please sign in again.")
  }, [router, params])

  const pwChecks = [
    { ok: password.length >= 8, label: "8+ characters" },
    { ok: /[A-Za-z]/.test(password), label: "a letter" },
    { ok: /\d/.test(password), label: "a number" },
  ]

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get("email") || "").trim()
    const name = String(fd.get("name") || "").trim()

    if (mode === "register" && !pwChecks.every((c) => c.ok)) {
      setError("Password needs at least 8 characters, including a letter and a number.")
      return
    }

    setLoading(true)
    try {
      if (mode === "register") {
        await api.register(email, password, name)
        toast.success("Account created. Welcome!")
      }
      const { access_token } = await api.login(email, password)
      storeToken(access_token)
      router.replace("/dashboard")
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"))
    setError(null)
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-3xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-10">
        <h2 className="font-serif text-3xl text-card-foreground">
          {mode === "login" ? "Welcome back" : "Create your library"}
        </h2>
        <p className="mb-8 mt-1 text-sm text-muted-foreground">
          {mode === "login" ? "Sign in to continue to your books." : "It's free. All you need is an email."}
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate={false}>
          {mode === "register" && (
            <Field id="name" label="Name (optional)" icon={User}>
              <Input id="name" name="name" autoComplete="name" maxLength={80} placeholder="Your name" className="h-12 pl-11" />
            </Field>
          )}

          <Field id="email" label="Email" icon={Mail}>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
              className="h-12 pl-11"
            />
          </Field>

          <div>
            <Field id="password" label="Password" icon={Lock}>
              <Input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 8 : 1}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 pl-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </Field>
            {mode === "register" && (
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {pwChecks.map((c) => (
                  <li key={c.label} className={cn(c.ok ? "text-[color:var(--success)]" : "text-muted-foreground")}>
                    {c.ok ? "✓" : "•"} {c.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="group h-12 rounded-xl text-base">
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                {mode === "login" ? "Sign in" : "Create account"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button type="button" onClick={switchMode} className="font-semibold text-primary underline-offset-4 hover:underline">
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
    </div>
  )
}
