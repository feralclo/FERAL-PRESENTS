"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

interface InviteData {
  member: {
    email: string;
    first_name: string;
    last_name: string;
    perm_events: boolean;
    perm_orders: boolean;
    perm_marketing: boolean;
    perm_finance: boolean;
  };
  org: {
    name: string;
    accent_color: string | null;
    logo: string | null;
  };
}

const PERM_LABELS: { key: string; label: string; icon: string }[] = [
  { key: "perm_events", label: "Events", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { key: "perm_orders", label: "Orders", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { key: "perm_marketing", label: "Marketing", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
  { key: "perm_finance", label: "Finance", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" },
];

function InviteForm() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<"loading" | "valid" | "success" | "error">("loading");
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showContent, setShowContent] = useState(false);

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
          setInviteData({ member: data.member, org: data.org });
          setState("valid");
          // Stagger the entrance animation
          setTimeout(() => setShowContent(true), 100);
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

      // Set session via the proper browser client (cookies persist for redirect)
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

      setTimeout(() => {
        router.replace("/admin/");
      }, 2000);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const orgName = inviteData?.org?.name || "the team";
  const firstName = inviteData?.member?.first_name || "";
  const enabledPerms = inviteData
    ? PERM_LABELS.filter((p) => inviteData.member[p.key as keyof typeof inviteData.member])
    : [];

  return (
    <div data-admin className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute left-1/2 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[140px]"
          style={{
            background: state === "success"
              ? "radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)",
            transition: "background 1s ease",
          }}
        />
        <div className="absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-[100px]" />
      </div>

      {/* Loading */}
      {state === "loading" && (
        <div className="relative text-center">
          <EntryWordmark />
          <div className="mt-6 flex items-center justify-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60" style={{ animationDelay: "0ms" }} />
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60" style={{ animationDelay: "300ms" }} />
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60" style={{ animationDelay: "600ms" }} />
          </div>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="relative w-full max-w-[420px] px-5">
          <EntryWordmark />
          <div className="mt-8 rounded-2xl border border-border/60 bg-card p-10 shadow-2xl shadow-black/30 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mb-2 text-base font-semibold text-foreground">Invite Not Valid</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{errorMessage}</p>
            <div className="mt-6 rounded-xl bg-background/50 px-4 py-3">
              <p className="text-[12px] text-muted-foreground/60">
                Contact your team admin to get a new invite link.
              </p>
            </div>
          </div>
          <Footer />
        </div>
      )}

      {/* Success */}
      {state === "success" && (
        <div className="relative w-full max-w-[420px] px-5 text-center">
          <div
            className="transition-all duration-700 ease-out"
            style={{ opacity: 1, transform: "translateY(0)" }}
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10 ring-1 ring-success/20">
              <svg className="h-10 w-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-foreground">
              Welcome to {orgName}!
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;re all set, {firstName}. Taking you to your dashboard...
            </p>
            <div className="mt-8">
              <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-success"
                  style={{
                    animation: "invite-progress 2s ease-in-out forwards",
                  }}
                />
              </div>
            </div>
          </div>
          <style>{`
            @keyframes invite-progress {
              from { width: 0; }
              to { width: 100%; }
            }
          `}</style>
        </div>
      )}

      {/* Valid — the main invite form */}
      {state === "valid" && (
        <div
          className="relative w-full max-w-[440px] px-5 transition-all duration-500 ease-out"
          style={{
            opacity: showContent ? 1 : 0,
            transform: showContent ? "translateY(0)" : "translateY(12px)",
          }}
        >
          {/* Welcome header */}
          <div className="mb-8 text-center">
            <div className="mb-5">
              <EntryWordmark />
            </div>
            <h1 className="text-[22px] font-bold text-foreground leading-tight">
              {firstName ? `${firstName}, you're invited` : "You're invited"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Join <span className="font-semibold text-foreground">{orgName}</span> on Entry
            </p>
          </div>

          {/* Permissions preview */}
          {enabledPerms.length > 0 && (
            <div className="mb-6 rounded-xl border border-primary/10 bg-primary/[0.03] p-4">
              <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-primary/70">
                Your access
              </p>
              <div className="flex flex-wrap gap-2">
                {enabledPerms.map((perm) => (
                  <div
                    key={perm.key}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={perm.icon} />
                    </svg>
                    {perm.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form card */}
          <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-2xl shadow-black/30">
            <form onSubmit={handleSubmit}>
              {/* Email (read-only, styled as context) */}
              <div className="mb-5 flex items-center gap-3 rounded-xl bg-background/50 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                  {(firstName?.[0] || inviteData?.member?.email?.[0] || "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {firstName} {inviteData?.member?.last_name || ""}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {inviteData?.member?.email}
                  </p>
                </div>
              </div>

              {/* Password */}
              <div className="mb-4">
                <label className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                  Create Password
                </label>
                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15 focus:bg-background"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
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
                className="w-full rounded-lg bg-primary py-3 font-mono text-[12px] font-bold uppercase tracking-[2px] text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/85 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Setting up your account...
                  </span>
                ) : (
                  "Get Started"
                )}
              </button>
            </form>
          </div>

          <Footer />
        </div>
      )}
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
          <div className="pointer-events-none fixed inset-0">
            <div className="absolute left-1/2 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-[140px]" />
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
          </div>
        </div>
      }
    >
      <InviteForm />
    </Suspense>
  );
}
