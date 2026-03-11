"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import Link from "next/link";
import { CheckCircle2, LogIn, Loader2, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/rep";
  const redirect = rawRedirect.startsWith("/rep") ? rawRedirect : "/rep";
  const justVerified = searchParams.get("verified") === "1";
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(oauthError || "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) { setCheckingSession(false); return; }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCheckingSession(false); return; }

      try {
        const res = await fetch("/api/rep-portal/auth-check");
        if (!res.ok) { setCheckingSession(false); return; }
        const json = await res.json();

        if (!json.authenticated || !json.rep) {
          await supabase.auth.signOut();
          setCheckingSession(false);
          return;
        }

        router.replace(redirect);
        return;
      } catch { /* fall through */ }

      setCheckingSession(false);
    })();
  }, [router, redirect]);

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
        redirectTo: `${window.location.origin}/auth/rep-callback`,
        queryParams: { prompt: "select_account" },
      },
    });

    if (oauthError) {
      setError(oauthError.message || "Failed to start Google sign in");
      setGoogleLoading(false);
    }
  };

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

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (authError) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/rep-portal/auth-check");
      const json = await res.json();

      if (!json.authenticated || !json.rep) {
        await supabase.auth.signOut();
        setError(
          "No rep account found for this email. If you were invited, check your email for the invite link."
        );
        setLoading(false);
        return;
      }

      const rep = json.rep;

      if (rep.status === "suspended" || rep.status === "deactivated") {
        await supabase.auth.signOut();
        setError("Your account has been deactivated. Please contact support.");
        setLoading(false);
        return;
      }

      router.push(redirect);
    } catch {
      await supabase.auth.signOut();
      setError("Failed to verify rep account");
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8 rep-fade-in">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-[0_0_12px_rgba(139,92,246,0.08)] mb-4">
            <Zap size={20} className="text-primary" />
          </div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-[4px] text-primary">
            Entry Reps
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to your dashboard
          </p>
        </div>

        {/* Verified banner */}
        {justVerified && (
          <div className="flex items-center gap-2.5 rounded-xl bg-info/10 border border-info/20 px-4 py-3 mb-6 rep-slide-up">
            <CheckCircle2 size={16} className="text-info shrink-0" />
            <p className="text-sm text-info">
              Email verified! Sign in to continue.
            </p>
          </div>
        )}

        {/* Form */}
        <Card className="py-0 gap-0 rep-slide-up">
          <CardContent className="p-6">
            {/* Google OAuth */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 mb-4 gap-3 font-medium"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Continue with Google
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                <span className="bg-card px-3 text-muted-foreground">or</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoFocus
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-12"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <LogIn size={14} />
                    Sign In
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Want to become a rep?{" "}
          <Link href="/rep/join" className="text-primary hover:underline font-medium">
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
