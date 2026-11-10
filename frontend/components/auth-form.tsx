"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, MailCheck, User } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { ApiError, api, errorMessage } from "@/lib/api"
import { getToken, storeToken } from "@/lib/auth"
import { cn } from "@/lib/utils"

type Mode = "login" | "register" | "verify" | "forgot" | "reset"

const COPY: Record<Mode, { title: string; subtitle: string }> = {
  login: { title: "Welcome back", subtitle: "Sign in to continue to your books." },
  register: { title: "Create your library", subtitle: "It's free. All you need is an email." },
  verify: { title: "Check your email", subtitle: "Enter the 6-digit code we sent to" },
  forgot: { title: "Forgot password?", subtitle: "Enter your email and we'll send you a code to reset it." },
  reset: { title: "Set a new password", subtitle: "Enter the code we sent to" },
}

function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 8, label: "8+ characters" },
    { ok: /[A-Za-z]/.test(pw), label: "a letter" },
    { ok: /\d/.test(pw), label: "a number" },
  ]
}

export function AuthForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = React.useState<Mode>("login")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [code, setCode] = React.useState("")
  const [cooldown, setCooldown] = React.useState(0)

  React.useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard")
      return
    }
    if (params.get("expired")) toast.info("Your session expired. Please sign in again.")
  }, [router, params])

  React.useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const go = (m: Mode) => {
    setMode(m)
    setError(null)
    setCode("")
    if (m !== "reset") setConfirm("")
    if (m === "reset" || m === "register") setPassword("")
  }

  const signedIn = (token: string, message: string) => {
    storeToken(token)
    toast.success(message)
    router.replace("/dashboard")
  }

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setLoading(true)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  // ------------------------------------------------------------ handlers
  const submitLogin = () =>
    run(async () => {
      try {
        const { access_token } = await api.login(email.trim(), password)
        signedIn(access_token, "Welcome back")
      } catch (e) {
        if (e instanceof ApiError && e.status === 403 && e.data?.code === "email_not_verified") {
          go("verify")
          setCooldown(e.data.resend_after ?? 60)
          toast.info("Please verify your email. We've sent you a code.")
          return
        }
        throw e
      }
    })

  const submitRegister = (name: string) =>
    run(async () => {
      if (!passwordChecks(password).every((c) => c.ok)) {
        throw new Error("Password needs at least 8 characters, including a letter and a number.")
      }
      const res = await api.register(email.trim(), password, name)
      go("verify")
      setCooldown(res.resend_after ?? 60)
    })

  const submitVerify = (value = code) =>
    run(async () => {
      const { access_token } = await api.verifyEmail(email.trim(), value)
      signedIn(access_token, "Email verified. Welcome!")
    })

  const submitForgot = () =>
    run(async () => {
      const res = await api.forgotPassword(email.trim())
      go("reset")
      setCooldown(res.resend_after ?? 60)
    })

  const submitReset = () =>
    run(async () => {
      if (code.length !== 6) throw new Error("Enter the 6-digit code from the email.")
      if (!passwordChecks(password).every((c) => c.ok)) {
        throw new Error("Password needs at least 8 characters, including a letter and a number.")
      }
      if (password !== confirm) throw new Error("The passwords don't match.")
      const { access_token } = await api.resetPassword(email.trim(), code, password)
      signedIn(access_token, "Password updated. Other devices have been signed out.")
    })

  const resend = () =>
    run(async () => {
      const res = mode === "reset" ? await api.forgotPassword(email.trim()) : await api.resendVerification(email.trim())
      setCooldown(res.resend_after ?? 60)
      toast.success("If the address is valid, a new code is on its way.")
    })

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (loading) return
    const fd = new FormData(e.currentTarget)
    if (mode === "login") submitLogin()
    else if (mode === "register") submitRegister(String(fd.get("name") || "").trim())
    else if (mode === "verify") submitVerify()
    else if (mode === "forgot") submitForgot()
    else submitReset()
  }

  const copy = COPY[mode]
  const codeMode = mode === "verify" || mode === "reset"

  return (
    <div className="w-full max-w-md">
      <div className="rounded-3xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-10">
        {codeMode || mode === "forgot" ? (
          <button
            type="button"
            onClick={() => go("login")}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to sign in
          </button>
        ) : null}
        {codeMode ? (
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
            <MailCheck className="size-6 text-primary" />
          </div>
        ) : null}
        <h2 className="font-serif text-3xl text-card-foreground">{copy.title}</h2>
        <p className="mb-8 mt-1 text-sm text-muted-foreground">
          {copy.subtitle}
          {codeMode ? <span className="block break-all font-medium text-foreground">{email}</span> : null}
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {mode === "register" && (
            <Field id="name" label="Name (optional)" icon={User}>
              <Input id="name" name="name" autoComplete="name" maxLength={80} placeholder="Your name" className="h-12 pl-11" />
            </Field>
          )}

          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <Field id="email" label="Email" icon={Mail}>
              <Input
                key={`email-${mode}`}
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 pl-11"
                autoFocus={mode === "forgot"}
              />
            </Field>
          )}

          {codeMode && (
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Code</Label>
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                onChange={(v) => {
                  setCode(v)
                  setError(null)
                }}
                onComplete={(v: string) => mode === "verify" && submitVerify(v)}
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                containerClassName="justify-center"
              >
                <InputOTPGroup className="gap-1.5 sm:gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="size-11 rounded-lg border text-lg sm:size-12" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <p className="text-center text-xs text-muted-foreground">
                Didn&apos;t get it? Check spam, or{" "}
                {cooldown > 0 ? (
                  <span>resend in {cooldown}s</span>
                ) : (
                  <button type="button" onClick={resend} disabled={loading} className="font-semibold text-primary hover:underline">
                    send a new code
                  </button>
                )}
                . Codes expire after 10 minutes.
              </p>
            </div>
          )}

          {(mode === "login" || mode === "register" || mode === "reset") && (
            <PasswordField
              id="password"
              label={mode === "reset" ? "New password" : "Password"}
              value={password}
              onChange={setPassword}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              showRules={mode !== "login"}
              action={
                mode === "login" ? (
                  <button
                    type="button"
                    onClick={() => go("forgot")}
                    className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </button>
                ) : null
              }
            />
          )}

          {mode === "reset" && (
            <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading || (codeMode && code.length !== 6)} className="group h-12 rounded-xl text-base">
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                {
                  {
                    login: "Sign in",
                    register: "Create account",
                    verify: "Verify email",
                    forgot: "Send code",
                    reset: "Update password",
                  }[mode]
                }
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </form>

        {mode === "login" || mode === "register" ? (
          <p className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => go(mode === "login" ? "register" : "login")}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  showRules,
  action,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  showRules?: boolean
  action?: React.ReactNode
}) {
  const [show, setShow] = React.useState(false)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        {action}
      </div>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          maxLength={128}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="h-12 pl-11 pr-11"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {showRules && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {passwordChecks(value).map((c) => (
            <li key={c.label} className={cn(c.ok ? "text-[color:var(--success)]" : "text-muted-foreground")}>
              {c.ok ? "✓" : "•"} {c.label}
            </li>
          ))}
        </ul>
      )}
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
