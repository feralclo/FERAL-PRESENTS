"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

function InviteForm() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<"loading" | "valid" | "success" | "error">("loading");
  const [memberInfo, setMemberInfo] = useState<{ email: string; first_name: string; last_name: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMessage("No invite token provided");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/team/accept-invite?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.valid) {
          setMemberInfo(data.member);
          setState("valid");
        } else {
          setState("error");
          setErrorMessage(data.reason || "This invite link is invalid or has expired");
        }
      } catch {
        setState("error");
        setErrorMessage("Failed to validate invite. Please try again.");
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (password.length < 6) {
      setSubmitError("Password must be at least 6 characters");
      return;
    }
    if (password.length > 72) {
      setSubmitError("Password must be under 72 characters");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/team/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Failed to accept invite");
        setSubmitting(false);
        return;
      }

      // Set session if returned — use the proper browser client so
      // cookies are set and middleware picks up the session on redirect
      if (data.data?.session) {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.auth.setSession({
            access_token: data.data.session.access_token,
            refresh_token: data.data.session.refresh_token,
          });
        }
      }

      setState("success");

      // Redirect to admin after brief delay
      setTimeout(() => {
        router.replace("/admin/");
      }, 1500);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  // Loading state
  if (state === "loading") {
    return (
      <div data-admin className="flex min-h-screen items-center justify-center bg-background">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-[380px] px-5 text-center">
          <EntryWordmark />
          <p className="mt-4 font-mono text-xs text-muted-foreground tracking-wider">
            Validating invite...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div data-admin className="flex min-h-screen items-center justify-center bg-background">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-[380px] px-5">
          <EntryWordmark />
          <div className="mt-8 rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/20 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Invite Not Valid</h2>
            <p className="text-[13px] text-muted-foreground">{errorMessage}</p>
            <p className="mt-4 text-[12px] text-muted-foreground/60">
              Contact your team owner to get a new invite.
            </p>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // Success state
  if (state === "success") {
    return (
      <div data-admin className="flex min-h-screen items-center justify-center bg-background">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-[380px] px-5">
          <EntryWordmark />
          <div className="mt-8 rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/20 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">You're in!</h2>
            <p className="text-[13px] text-muted-foreground">Redirecting to your dashboard...</p>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // Valid state — show password form
  return (
    <div data-admin className="flex min-h-screen items-center justify-center bg-background">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[380px] px-5">
        <EntryWordmark />
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          Set your password to join the team
        </p>

        <div className="mt-8 rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/20">
          <form onSubmit={handleSubmit}>
            {/* Email (read-only) */}
            <div className="mb-4">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                value={memberInfo?.email || ""}
                disabled
                className="w-full rounded-lg border border-input bg-background/30 px-4 py-2.5 text-[14px] text-muted-foreground outline-none"
              />
            </div>

            {/* Name (read-only) */}
            <div className="mb-4">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Name
              </label>
              <input
                type="text"
                value={`${memberInfo?.first_name || ""} ${memberInfo?.last_name || ""}`.trim()}
                disabled
                className="w-full rounded-lg border border-input bg-background/30 px-4 py-2.5 text-[14px] text-muted-foreground outline-none"
              />
            </div>

            {/* Password */}
            <div className="mb-4">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                placeholder="Minimum 6 characters"
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={72}
              />
            </div>

            {/* Confirm Password */}
            <div className="mb-6">
              <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                Confirm Password
              </label>
              <input
                type="password"
                placeholder="Re-enter your password"
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {submitError && (
              <div className="mb-4 rounded-lg bg-destructive/8 border border-destructive/15 px-4 py-2.5 text-[13px] text-destructive">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary py-2.5 font-mono text-[12px] font-bold uppercase tracking-[2px] text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/85 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Setting up..." : "Accept Invite"}
            </button>
          </form>
        </div>

        <Footer />
      </div>
    </div>
  );
}

function EntryWordmark() {
  return (
    <div className="text-center">
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
  );
}

function Footer() {
  return (
    <p className="mt-8 text-center font-mono text-[10px] text-muted-foreground/40 tracking-wider">
      Powered by Entry
    </p>
  );
}

export default function InviteAcceptPage() {
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
      <InviteForm />
    </Suspense>
  );
}
