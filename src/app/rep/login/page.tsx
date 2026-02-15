"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Validate redirect is an internal path (prevent open redirect attacks)
  const rawRedirect = searchParams.get("redirect") || "/rep";
  const redirect = rawRedirect.startsWith("/rep") ? rawRedirect : "/rep";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) { setCheckingSession(false); return; }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace(redirect);
      } else {
        setCheckingSession(false);
      }
    });
  }, [router, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError("");
    setLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Service unavailable");
      setLoading(false);
      return;
    }

    // Sign in via browser-side Supabase client (sets session cookies automatically)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (authError) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    // Verify user has an active rep account
    try {
      const res = await fetch("/api/rep-portal/me");
      if (!res.ok) {
        // Not a rep — sign out and show error
        await supabase.auth.signOut();
        setError("No active rep account found for this email");
        setLoading(false);
        return;
      }
    } catch {
      await supabase.auth.signOut();
      setError("Failed to verify rep account");
      setLoading(false);
      return;
    }

    router.push(redirect);
  };

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-mono text-2xl font-bold uppercase tracking-[6px] mb-2 text-[var(--rep-accent)]">
            Entry Reps
          </h1>
          <p className="text-sm text-[var(--rep-text-muted)]">
            Sign in to your rep dashboard
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)] focus:border-[var(--rep-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--rep-accent)] transition-colors"
              placeholder="your@email.com"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)] focus:border-[var(--rep-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--rep-accent)] transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--rep-accent)] px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--rep-text-muted)]">
          Want to become a rep?{" "}
          <Link href="/rep/join" className="text-[var(--rep-accent)] hover:underline">
            Apply here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RepLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
