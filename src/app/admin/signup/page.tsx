"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/* ── Google icon ── */

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

/* ── Password strength ── */

interface PasswordCheck {
  label: string;
  met: boolean;
}

function usePasswordStrength(password: string) {
  return useMemo(() => {
    const checks: PasswordCheck[] = [
      { label: "8+ characters", met: password.length >= 8 },
      { label: "Uppercase letter", met: /[A-Z]/.test(password) },
      { label: "Number", met: /\d/.test(password) },
      { label: "Special character", met: /[^a-zA-Z0-9]/.test(password) },
    ];
    const metCount = checks.filter((c) => c.met).length;

    let level: "none" | "weak" | "fair" | "good" | "strong" = "none";
    let label = "";
    if (password.length === 0) {
      level = "none";
      label = "";
    } else if (metCount <= 1) {
      level = "weak";
      label = "Weak";
    } else if (metCount === 2) {
      level = "fair";
      label = "Fair";
    } else if (metCount === 3) {
      level = "good";
      label = "Good";
    } else {
      level = "strong";
      label = "Strong";
    }

    return { checks, metCount, level, label };
  }, [password]);
}

const STRENGTH_COLORS = {
  none: "bg-border",
  weak: "bg-destructive",
  fair: "bg-warning",
  good: "bg-warning",
  strong: "bg-success",
} as const;

const STRENGTH_LABEL_COLORS = {
  none: "",
  weak: "text-destructive",
  fair: "text-warning",
  good: "text-warning",
  strong: "text-success",
} as const;

function PasswordStrengthIndicator({ password }: { password: string }) {
  const { checks, metCount, level, label } = usePasswordStrength(password);

  if (password.length === 0) return null;

  return (
    <div className="mt-3 space-y-2.5">
      {/* Segment bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < metCount ? STRENGTH_COLORS[level] : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* Label */}
      <div className="flex items-center justify-between">
        <span className={`text-[12px] font-medium ${STRENGTH_LABEL_COLORS[level]}`}>
          {label}
        </span>
      </div>

      {/* Checklist */}
      <div className="space-y-1">
        {checks.map((check) => (
          <div
            key={check.label}
            className="flex items-center gap-2 text-[12px]"
          >
            {check.met ? (
              <svg
                className="h-3.5 w-3.5 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border border-border" />
            )}
            <span
              className={
                check.met ? "text-muted-foreground" : "text-muted-foreground/50"
              }
            >
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SIGNUP FORM — TWO STEPS: EMAIL → PASSWORD
   ═══════════════════════════════════════════════════════ */

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkingSession, setCheckingSession] = useState(true);

  // Two-step flow: "email" | "password"
  const [step, setStep] = useState<"email" | "password">("email");

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Password can proceed if >= 8 chars
  const canSubmit = password.length >= 8;

  // Show error from OAuth callback redirect
  useEffect(() => {
    const callbackError = searchParams.get("error");
    if (callbackError) {
      setError(callbackError);
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  // Session check on mount — redirect if already logged in with org
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setCheckingSession(false);
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Check if user has an org
          const res = await fetch("/api/auth/check-org");
          const data = await res.json();
          if (data.has_org) {
            router.replace("/admin/");
          } else if (data.authenticated) {
            router.replace("/admin/onboarding/");
          } else {
            setCheckingSession(false);
          }
        } else {
          setCheckingSession(false);
        }
      } catch {
        setCheckingSession(false);
      }
    })();
  }, [router]);

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setStep("password");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Signup failed");
        setLoading(false);
        return;
      }

      // Set session from returned tokens
      if (data.data?.session) {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.auth.setSession({
            access_token: data.data.session.access_token,
            refresh_token: data.data.session.refresh_token,
          });
        }
      }

      // Redirect to onboarding wizard
      router.replace("/admin/onboarding/");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication service unavailable");
      setGoogleLoading(false);
      return;
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback/?next=/admin/onboarding/&signup=1`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div
        data-admin
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <span
            className="font-mono text-[36px] font-bold uppercase tracking-[8px] select-none"
            style={{
              background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Entry
          </span>
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-admin
      className="flex min-h-screen items-center justify-center bg-background"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[480px] px-5">
        {/* Brand */}
        <div className="mb-8 text-center">
          <span
            className="font-mono text-[36px] font-bold uppercase tracking-[8px] select-none"
            style={{
              background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Entry
          </span>
          <h1 className="mt-4 text-xl font-bold text-foreground">
            Your events, your brand, your platform
          </h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Free to start. No card needed.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/20">
          {error && (
            <div className="mb-5 rounded-lg border border-destructive/15 bg-destructive/8 px-4 py-2.5 text-[13px] text-destructive">
              {error}
            </div>
          )}

          {step === "email" ? (
            <>
              {/* Step 1: Email */}
              <form onSubmit={handleEmailContinue}>
                <div className="mb-5">
                  <label className="mb-2 block text-[13px] font-medium text-foreground">
                    Email address
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    className="h-12 w-full rounded-xl border border-input bg-background/50 px-4 text-[15px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    autoComplete="email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)]"
                >
                  Continue with email
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-[12px] text-muted-foreground/50">
                    or
                  </span>
                </div>
              </div>

              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-background/50 text-[14px] font-medium text-foreground transition-all duration-200 hover:border-border/80 hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                {googleLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </button>
            </>
          ) : (
            <>
              {/* Step 2: Password */}
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setError("");
                }}
                className="mb-5 flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft size={14} />
                <span className="truncate">{email}</span>
              </button>

              <h2 className="mb-5 text-lg font-bold text-foreground">
                Create your password
              </h2>

              <form onSubmit={handleSubmit}>
                <div className="mb-2">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="8+ characters"
                      className="h-12 w-full rounded-xl border border-input bg-background/50 px-4 pr-12 text-[15px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>

                  <PasswordStrengthIndicator password={password} />
                </div>

                <div className="mt-6">
                  <button
                    type="submit"
                    disabled={!canSubmit || loading}
                    className="h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Creating account...
                      </span>
                    ) : (
                      "Create account"
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Sign in link */}
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/admin/login/"
            className="font-medium text-primary transition-colors hover:text-primary/80"
          >
            Sign in
          </Link>
        </p>

        {/* Footer */}
        <p className="mt-6 text-center font-mono text-[10px] tracking-wider text-muted-foreground/40">
          Powered by Entry
        </p>
      </div>
    </div>
  );
}

/* ── Page wrapper with Suspense ── */

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div
          data-admin
          className="flex min-h-screen items-center justify-center bg-background"
        >
          <div className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
          </div>
          <div className="flex flex-col items-center gap-4">
            <span
              className="font-mono text-[36px] font-bold uppercase tracking-[8px] select-none"
              style={{
                background:
                  "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Entry
            </span>
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
