"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/**
 * Login form component — uses useSearchParams so must be inside Suspense.
 */
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

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // If already authenticated, redirect to admin dashboard
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const redirect = searchParams.get("redirect") || "/admin/";
        router.replace(redirect);
      } else {
        setCheckingSession(false);
      }
    });
  }, [router, searchParams]);

  // Show error from OAuth callback redirect
  useEffect(() => {
    const callbackError = searchParams.get("error");
    if (callbackError) {
      setError(callbackError);
      // Clean up the URL
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

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
        redirectTo: `${window.location.origin}/auth/callback/?next=/admin/`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication service unavailable");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Tag this user as admin via the login API (sets is_admin flag in app_metadata).
    // This is best-effort — the dashboard works regardless, but the flag helps
    // distinguish admin users from rep-only users for future role checks.
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => {});

    // Redirect to the intended page or admin dashboard
    const redirect = searchParams.get("redirect") || "/admin/";
    router.replace(redirect);
  };

  if (checkingSession) {
    return (
      <div data-admin className="flex min-h-screen items-center justify-center bg-background">
        {/* Ambient glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-[380px] px-5">
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

  return (
    <div data-admin className="flex min-h-screen items-center justify-center bg-background">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[380px] px-5">
        {/* Brand */}
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
          <p className="mt-3 text-[13px] text-muted-foreground">
            Sign in to your dashboard
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/20">
          {error && (
            <div className="mb-5 rounded-lg bg-destructive/8 border border-destructive/15 px-4 py-2.5 text-[13px] text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} action="/admin/login/" method="POST">
            <div className="mb-4">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username email"
                required
              />
            </div>
            <div className="mb-6">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-lg bg-primary py-2.5 font-mono text-[12px] font-bold uppercase tracking-[2px] text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/85 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/50">
                or
              </span>
            </div>
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background/50 py-2.5 text-[13px] font-medium text-foreground transition-all duration-200 hover:bg-background hover:border-border/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <GoogleIcon />
            )}
            Sign in with Google
          </button>
        </div>

        {/* Signup link */}
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/admin/signup/" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Get started for free
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

/**
 * Admin login page using Supabase Auth (email + password).
 */
export default function AdminLoginPage() {
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
      <LoginForm />
    </Suspense>
  );
}
