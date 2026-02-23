"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
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

/** Animated checkmark for success state */
function AnimatedCheck() {
  return (
    <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success/15 ring-2 ring-success/30">
        <svg
          className="h-8 w-8 text-success"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M5 13l4 4L19 7"
            className="animate-[draw_0.4s_ease-out_0.2s_forwards]"
            style={{
              strokeDasharray: 24,
              strokeDashoffset: 24,
              animation: "draw 0.4s ease-out 0.2s forwards",
            }}
          />
        </svg>
      </div>
      <style>{`
        @keyframes draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkingSession, setCheckingSession] = useState(true);

  // Form state
  const [orgName, setOrgName] = useState(searchParams.get("org_name") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Slug availability
  const [slug, setSlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Success state
  const [success, setSuccess] = useState(false);
  const [progressWidth, setProgressWidth] = useState(0);

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

  // Session check on mount
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/admin/");
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  // Debounced slug check
  const checkSlug = useCallback((name: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);

    // Quick local slugify for preview
    const s = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

    setSlug(s);

    if (s.length < 3) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }

    setSlugChecking(true);
    slugTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-slug?slug=${encodeURIComponent(s)}`);
        const data = await res.json();
        setSlugAvailable(data.available === true);
        if (data.slug) setSlug(data.slug);
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 300);
  }, []);

  // Check slug when org name changes
  useEffect(() => {
    checkSlug(orgName);
  }, [orgName, checkSlug]);

  const orgReady = slug.length >= 3 && slugAvailable === true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          org_name: orgName.trim(),
        }),
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

      // Show success state
      setSuccess(true);
      // Animate progress bar then redirect
      requestAnimationFrame(() => setProgressWidth(100));
      setTimeout(() => {
        router.replace("/admin/?welcome=1");
      }, 2000);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!orgReady) return;
    setError("");
    setGoogleLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication service unavailable");
      setGoogleLoading(false);
      return;
    }

    // Set a cookie with the org name so the callback can read it
    document.cookie = `entry_signup_org=${encodeURIComponent(orgName.trim())}; path=/; max-age=600; SameSite=Lax`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback/?next=/admin/&signup=1`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div data-admin className="flex min-h-screen items-center justify-center bg-background">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-[420px] px-5">
          <div className="mb-10 text-center">
            <span
              className="font-mono text-[18px] font-bold uppercase tracking-[6px] select-none"
              style={{
                background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Entry
            </span>
          </div>
          <p className="text-center font-mono text-xs text-muted-foreground tracking-wider">
            Checking session...
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div data-admin className="flex min-h-screen items-center justify-center bg-background">
        {/* Green ambient glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-success/5 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-[420px] px-5">
          <div className="rounded-2xl border border-border/60 bg-card p-10 shadow-xl shadow-black/20 text-center">
            <AnimatedCheck />
            <h2 className="text-xl font-bold text-foreground">
              Welcome to Entry!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your dashboard is ready.
            </p>
            {/* Progress bar */}
            <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-success transition-all duration-[2000ms] ease-linear"
                style={{ width: `${progressWidth}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-admin className="flex min-h-screen items-center justify-center bg-background">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[420px] px-5">
        {/* Brand */}
        <div className="mb-8 text-center">
          <span
            className="font-mono text-[18px] font-bold uppercase tracking-[6px] select-none"
            style={{
              background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Entry
          </span>
          <h1 className="mt-3 text-lg font-bold text-foreground">
            Start selling tickets in minutes
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Free to start. No card needed.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/20">
          {error && (
            <div className="mb-5 rounded-lg bg-destructive/8 border border-destructive/15 px-4 py-2.5 text-[13px] text-destructive">
              {error}
            </div>
          )}

          {/* Org name — always visible */}
          <div className="mb-5">
            <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Organization name
            </label>
            <input
              type="text"
              placeholder="My Brand"
              className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              autoFocus
              maxLength={50}
            />
            {/* Slug preview */}
            {slug.length >= 3 && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                {slugChecking ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-muted-foreground">{slug}.entry.events</span>
                  </>
                ) : slugAvailable ? (
                  <>
                    <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-success">{slug}.entry.events</span>
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-destructive">{slug}.entry.events is taken</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Google OAuth — primary CTA */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={!orgReady || googleLoading || loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background/50 py-2.5 text-[13px] font-medium text-foreground transition-all duration-200 hover:bg-background hover:border-border/80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <GoogleIcon />
            )}
            Get started with Google
          </button>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">
                or use email
              </span>
            </div>
          </div>

          {/* Email + Password form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={!orgReady}
              />
            </div>
            <div className="mb-6">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                placeholder="6+ characters"
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
                disabled={!orgReady}
              />
            </div>
            <button
              type="submit"
              disabled={loading || googleLoading || !orgReady}
              className="w-full rounded-lg bg-primary py-2.5 font-mono text-[12px] font-bold uppercase tracking-[2px] text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/85 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading ? "Creating account..." : "Create your account"}
            </button>
          </form>
        </div>

        {/* Sign in link */}
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/admin/login/" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </p>

        {/* Footer */}
        <p className="mt-6 text-center font-mono text-[10px] text-muted-foreground/40 tracking-wider">
          Powered by Entry
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div data-admin className="flex min-h-screen items-center justify-center bg-background">
          <div className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
          </div>
          <div className="relative text-center">
            <span
              className="font-mono text-[18px] font-bold uppercase tracking-[6px] select-none"
              style={{
                background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Entry
            </span>
            <p className="mt-4 font-mono text-xs text-muted-foreground tracking-wider">
              Loading...
            </p>
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
