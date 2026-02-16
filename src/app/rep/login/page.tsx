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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 rep-glow mb-4">
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
          <div className="flex items-center gap-2.5 rounded-xl bg-success/10 border border-success/20 px-4 py-3 mb-6 rep-slide-up">
            <CheckCircle2 size={16} className="text-success shrink-0" />
            <p className="text-sm text-success">
              Email verified! Sign in to continue.
            </p>
          </div>
        )}

        {/* Form */}
        <Card className="py-0 gap-0 rep-slide-up">
          <CardContent className="p-6">
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
