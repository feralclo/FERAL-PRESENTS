"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");

  const [phase, setPhase] = useState<"verifying" | "success" | "error" | "check-email">(
    token ? "verifying" : "check-email"
  );
  const [error, setError] = useState("");
  const [repStatus, setRepStatus] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [email, setEmail] = useState(emailParam || "");
  const attempted = useRef(false);

  // Auto-verify if token is present
  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const res = await fetch("/api/rep-portal/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Verification failed");
          setPhase("error");
          return;
        }

        if (json.data?.already_verified) {
          setRepStatus(json.data.status);
          setPhase("success");
          return;
        }

        setRepStatus(json.data?.status || "");
        setPhase("success");

        // Auto-redirect after verification
        if (json.data?.status === "active") {
          setTimeout(() => router.push("/rep/login?verified=1"), 2500);
        }
      } catch {
        setError("Connection error. Please try again.");
        setPhase("error");
      }
    })();
  }, [token, router]);

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    setResent(false);
    try {
      const res = await fetch("/api/rep-portal/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      if (res.ok) {
        setResent(true);
      }
    } catch {
      // silent
    }
    setResending(false);
  };

  // ── Verifying ──
  if (phase === "verifying") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm rep-fade-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/20 mb-6">
            <Loader2 size={28} className="text-[var(--rep-accent)] animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Verifying...</h2>
          <p className="text-sm text-[var(--rep-text-muted)]">
            Hold tight, confirming your email.
          </p>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (phase === "success") {
    const isActive = repStatus === "active";
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm rep-fade-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--rep-success)]/10 border border-[var(--rep-success)]/20 mb-6">
            <CheckCircle2 size={28} className="text-[var(--rep-success)]" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Email Verified</h2>
          <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed mb-8 max-w-[280px] mx-auto">
            {isActive
              ? "You're all set. Time to start earning."
              : "Your email is confirmed. We're reviewing your application and will be in touch."}
          </p>
          <Link
            href={isActive ? "/rep/login?verified=1" : "/rep/login"}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--rep-accent)] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            {isActive ? "Continue to Dashboard" : "Go to Login"}
            <ArrowRight size={14} />
          </Link>
          {isActive && (
            <p className="mt-4 text-xs text-[var(--rep-text-muted)]">
              Redirecting automatically...
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm rep-fade-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 mb-6">
            <XCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Verification Failed</h2>
          <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed mb-8 max-w-[280px] mx-auto">
            {error || "This link may have expired. Request a new one below."}
          </p>
          {email && (
            <button
              onClick={handleResend}
              disabled={resending}
              className="rounded-xl bg-[var(--rep-accent)] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50 mb-4"
            >
              {resending ? "Sending..." : resent ? "Sent!" : "Resend Verification Email"}
            </button>
          )}
          <div>
            <Link
              href="/rep/login"
              className="text-sm text-[var(--rep-text-muted)] hover:text-white transition-colors"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Check Email (no token — shown after signup or from layout gate) ──
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center max-w-sm rep-fade-in">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/20 mb-6">
          <Mail size={28} className="text-[var(--rep-accent)]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Check Your Email</h2>
        <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed mb-2 max-w-[280px] mx-auto">
          We sent a verification link to
        </p>
        {email && (
          <p className="font-mono text-sm text-white mb-6">{email}</p>
        )}
        {!email && (
          <p className="text-sm text-[var(--rep-text-muted)] mb-6">your email address</p>
        )}

        <p className="text-xs text-[var(--rep-text-muted)] mb-8">
          Click the link in the email to verify your account. Check spam if you don&apos;t see it.
        </p>

        <button
          onClick={handleResend}
          disabled={resending || !email}
          className="rounded-xl border border-[var(--rep-border)] px-6 py-3 text-sm font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 hover:text-white transition-colors disabled:opacity-50"
        >
          {resending ? "Sending..." : resent ? "Email Sent!" : "Resend Email"}
        </button>

        <p className="mt-6 text-xs text-[var(--rep-text-muted)]">
          Wrong email?{" "}
          <Link href="/rep/join" className="text-[var(--rep-accent)] hover:underline">
            Sign up again
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 size={24} className="text-[var(--rep-accent)] animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
