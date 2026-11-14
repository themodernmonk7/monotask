import { useMemo, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
  Sparkles,
  Timer,
  BarChart3,
  Cloud,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup" | "magic"

const MODES: { id: Mode; label: string }[] = [
  { id: "signin", label: "Sign In" },
  { id: "signup", label: "Sign Up" },
  { id: "magic", label: "Magic Link" },
]

const COPY: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  signin: {
    title: "Welcome back",
    subtitle: "Sign in to pick up your deep work where you left off.",
    cta: "Sign In",
  },
  signup: {
    title: "Create your account",
    subtitle: "Track focused hours and keep every session in sync.",
    cta: "Create Account",
  },
  magic: {
    title: "Passwordless sign in",
    subtitle: "We'll email you a link that signs you straight in.",
    cta: "Send Magic Link",
  },
}

const FEATURES = [
  { icon: Timer, text: "One task at a time, timed to the second" },
  { icon: BarChart3, text: "Daily targets and working-hour reports" },
  { icon: Cloud, text: "Synced across every device you use" },
]

function passwordStrength(password: string): { score: number; label: string } {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const label = ["Too short", "Weak", "Fair", "Good", "Strong", "Excellent"][
    score
  ]
  return { score, label }
}

export function AuthScreen() {
  const { signIn, signUp, signInWithOtp } = useAuth()

  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const copy = COPY[mode]
  const strength = useMemo(() => passwordStrength(password), [password])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setSuccess(null)
    setConfirm("")
  }

  const validate = (): string | null => {
    if (mode === "signup" && !name.trim()) return "Enter your name."
    if (!email.trim()) return "Enter your email address."
    if (mode === "magic") return null
    if (password.length < 6) return "Password must be at least 6 characters."
    if (mode === "signup" && password !== confirm)
      return "Passwords do not match."
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const invalid = validate()
    if (invalid) {
      setError(invalid)
      return
    }

    setLoading(true)
    try {
      if (mode === "signin") {
        const { error } = await signIn(email.trim(), password)
        if (error) setError(error.message)
        // On success the auth listener swaps this screen out.
      } else if (mode === "signup") {
        const { error } = await signUp(email.trim(), password, name.trim())
        if (error) {
          setError(error.message)
        } else {
          setSuccess(
            "Account created. If your project requires email confirmation, check your inbox to finish signing in.",
          )
        }
      } else {
        const { error } = await signInWithOtp(email.trim())
        if (error) {
          setError(error.message)
        } else {
          setSuccess(
            `Magic link sent to ${email.trim()}. Open it on this device to sign in.`,
          )
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background, matching the app shell */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-25%] left-[-10%] w-[55%] h-[55%] rounded-full bg-primary/10 blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-25%] right-[-10%] w-[55%] h-[55%] rounded-full bg-emerald-500/5 blur-[160px] animate-pulse [animation-delay:2s]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl grid lg:grid-cols-2 rounded-3xl overflow-hidden border border-white/5 bg-card/40 backdrop-blur-xl shadow-2xl">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/5 border-r border-white/5">
          <div>
            <h1 className="text-4xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
              Monotask
            </h1>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.25em] mt-1">
              Focus · Flow · Finish
            </p>
          </div>

          <ul className="space-y-4 my-10">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <span className="mt-0.5 p-1.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </span>
                <span className="leading-snug">{text}</span>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Your tasks, sessions and notes live in your own Supabase project.
          </p>
        </div>

        {/* Form panel */}
        <div className="p-7 sm:p-10">
          {/* Mobile brand */}
          <div className="lg:hidden mb-7">
            <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
              Monotask
            </h1>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.25em] mt-0.5">
              Focus · Flow · Finish
            </p>
          </div>

          {/* Mode switcher */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-3 p-1 bg-muted/30 rounded-xl border border-white/5 text-xs font-semibold mb-7"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                role="tab"
                type="button"
                aria-selected={mode === m.id}
                onClick={() => switchMode(m.id)}
                className={cn(
                  "py-2 rounded-lg transition-all cursor-pointer",
                  mode === m.id
                    ? "bg-card text-foreground shadow-sm font-bold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">{copy.title}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {copy.subtitle}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 mb-5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {success && (
            <div
              role="status"
              className="p-3 mb-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-name"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5 text-primary" />
                  Your name
                </label>
                <Input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  maxLength={80}
                  className="bg-card/50 border-white/10 h-11 rounded-xl"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5 text-primary" />
                Email
              </label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-card/50 border-white/10 h-11 rounded-xl"
                autoFocus={mode !== "signup"}
              />
            </div>

            {mode !== "magic" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-password"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 text-primary" />
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-card/50 border-white/10 h-11 rounded-xl pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-1 top-1 h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {mode === "signup" && password.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "flex-1 rounded-full transition-colors",
                            i < strength.score
                              ? strength.score <= 2
                                ? "bg-destructive"
                                : strength.score <= 3
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                              : "bg-transparent",
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>
            )}

            {mode === "signup" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-confirm"
                  className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 text-primary" />
                  Confirm password
                </label>
                <Input
                  id="auth-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={confirm.length > 0 && confirm !== password}
                  className="bg-card/50 border-white/10 h-11 rounded-xl"
                />
                {confirm.length > 0 && confirm !== password && (
                  <p className="text-[11px] text-destructive">
                    Passwords do not match.
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl gap-2 font-bold"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "magic" ? (
                <Sparkles className="w-4 h-4" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {copy.cta}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            {mode === "signin" ? (
              <>
                New to Monotask?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="text-primary font-semibold hover:underline cursor-pointer"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="text-primary font-semibold hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
