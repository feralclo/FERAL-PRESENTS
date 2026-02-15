"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ArrowLeft, ChevronRight } from "lucide-react";

/* ── Gender options ── */
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Rather not say" },
];

const VERIFY_LINES = [
  { text: "Verifying invite token...", delay: 0 },
  { text: "Checking access...", delay: 500 },
  { text: "Decrypting credentials...", delay: 900 },
];

const STEP_COUNT = 5;

export default function RepInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Verification ── */
  const [phase, setPhase] = useState<"verifying" | "denied" | "granted" | "quiz" | "submitting" | "done">("verifying");
  const [repInfo, setRepInfo] = useState<{ first_name?: string; email?: string } | null>(null);
  const [visibleLines, setVisibleLines] = useState(0);

  /* ── Quiz ── */
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [error, setError] = useState("");

  /* ── Form ── */
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");

  /* ── Verify token with terminal animation ── */
  useEffect(() => {
    let cancelled = false;

    // Start verification lines
    const timers = VERIFY_LINES.map((line, i) =>
      setTimeout(() => {
        if (!cancelled) setVisibleLines(i + 1);
      }, line.delay)
    );

    // Actually verify
    (async () => {
      try {
        const res = await fetch(`/api/rep-portal/invite/${token}`);
        const json = await res.json();

        // Wait at least 1.2s for the animation
        await new Promise((r) => setTimeout(r, 1200));
        if (cancelled) return;

        if (json.valid) {
          setRepInfo(json.rep);
          // Pre-fill email if it's a real one (not a placeholder)
          const repEmail = json.rep?.email || "";
          if (repEmail && !repEmail.endsWith("@pending.entry")) {
            setEmail(repEmail);
          }
          setPhase("granted");
          // Auto-advance to quiz after 2s
          setTimeout(() => { if (!cancelled) setPhase("quiz"); }, 2000);
        } else {
          setPhase("denied");
        }
      } catch {
        if (!cancelled) setPhase("denied");
      }
    })();

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [token]);

  /* ── Auto-focus input ── */
  useEffect(() => {
    if (phase === "quiz") {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [step, phase]);

  /* ── Navigation ── */
  const advance = () => {
    if (step < STEP_COUNT - 1) {
      setStep((s) => s + 1);
      setStepKey((k) => k + 1);
    } else {
      handleSubmit();
    }
  };

  const goBack = () => {
    if (step > 0) {
      setStep((s) => s - 1);
      setStepKey((k) => k + 1);
    }
  };

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return email.trim().length > 0 && password.length >= 6;
      case 1: return true; // instagram optional
      case 2: return true; // tiktok optional
      case 3: return true; // dob optional
      case 4: return true; // gender optional
      default: return false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canAdvance()) {
      e.preventDefault();
      advance();
    }
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    setPhase("submitting");
    setError("");
    try {
      const res = await fetch(`/api/rep-portal/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          instagram: instagram.trim() || undefined,
          tiktok: tiktok.trim() || undefined,
          date_of_birth: dob || undefined,
          gender: gender || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to accept invite");
        setPhase("quiz");
        return;
      }
      setPhase("done");
      // Auto-login with browser-side Supabase client
      // Use the email returned by the server (the actual auth email) — NOT the form field
      const loginEmail = json.data?.email || email.trim().toLowerCase();
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.auth.signInWithPassword({
            email: loginEmail,
            password,
          });
        }
      } catch { /* login will happen manually if auto-login fails */ }
      // Auto-redirect to dashboard after celebration
      setTimeout(() => router.push("/rep"), 2500);
    } catch {
      setError("Connection lost. Try again.");
      setPhase("quiz");
    }
  };

  const progress = phase === "quiz" ? ((step + 1) / STEP_COUNT) * 100 : phase === "done" ? 100 : 0;

  /* ══════════════════════════════════════════════════════════════════
     RENDER: VERIFYING
     ══════════════════════════════════════════════════════════════════ */
  if (phase === "verifying") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-3">
          {VERIFY_LINES.slice(0, visibleLines).map((line, i) => (
            <p
              key={i}
              className="rep-boot-line font-mono text-[13px] text-[var(--rep-text-muted)]"
            >
              <span className="text-[var(--rep-accent)] mr-2">&gt;</span>
              {line.text}
              {i === visibleLines - 1 && <span className="rep-cursor" />}
            </p>
          ))}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER: DENIED
     ══════════════════════════════════════════════════════════════════ */
  if (phase === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm rep-fade-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-sm text-[var(--rep-text-muted)] mb-6 leading-relaxed">
            This invite link has expired or has already been used.
          </p>
          <Link
            href="/rep/join"
            className="inline-block rounded-xl bg-[var(--rep-accent)] px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            Apply Instead
          </Link>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER: ACCESS GRANTED (brief reveal)
     ══════════════════════════════════════════════════════════════════ */
  if (phase === "granted") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm rep-access-reveal">
          <div className="mb-6">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[4px] text-[var(--rep-accent)]">
              Access Granted
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            {repInfo?.first_name ? `Welcome, ${repInfo.first_name}` : "You\u2019re in"}
          </h1>
          <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed">
            You&apos;ve been personally invited to the crew.
          </p>
          <div className="mt-8">
            <div className="animate-spin h-5 w-5 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER: DONE
     ══════════════════════════════════════════════════════════════════ */
  if (phase === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm rep-celebrate">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--rep-success)]/10 border border-[var(--rep-success)]/20 mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--rep-success)]">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">You&apos;re In</h2>
          <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed mb-8 max-w-[280px] mx-auto">
            Your account is live and your discount code is ready. Time to start earning.
          </p>
          <button
            onClick={() => router.push("/rep")}
            className="rounded-xl bg-[var(--rep-accent)] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            Go to Dashboard
          </button>
          <p className="mt-4 text-xs text-[var(--rep-text-muted)]">Redirecting automatically...</p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER: QUIZ (setup steps)
     ══════════════════════════════════════════════════════════════════ */
  const renderStepContent = () => {
    switch (step) {
      /* ── 0: Email + Password ── */
      case 0:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              Set up your login
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">
              This is what you&apos;ll use to sign in
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[2px] text-[var(--rep-text-muted)] mb-2 block">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="rep-input opacity-60 cursor-not-allowed"
                  autoComplete="email"
                />
                <p className="text-[10px] text-[var(--rep-text-muted)] mt-1.5">
                  This is the email your invite was sent to
                </p>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[2px] text-[var(--rep-text-muted)] mb-2 block">
                  Password
                </label>
                <input
                  ref={inputRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="rep-input"
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </>
        );

      /* ── 1: Instagram ── */
      case 1:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              Got Instagram?
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">Optional</p>
            <div className="rep-social-wrap">
              <span className="rep-at">@</span>
              <input
                ref={inputRef}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace("@", ""))}
                onKeyDown={handleKeyDown}
                className="rep-input"
                placeholder="yourhandle"
              />
            </div>
          </>
        );

      /* ── 2: TikTok ── */
      case 2:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              On TikTok?
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">Optional</p>
            <div className="rep-social-wrap">
              <span className="rep-at">@</span>
              <input
                ref={inputRef}
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value.replace("@", ""))}
                onKeyDown={handleKeyDown}
                className="rep-input"
                placeholder="yourhandle"
              />
            </div>
          </>
        );

      /* ── 3: Birthday ── */
      case 3:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              When were you born?
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">Optional</p>
            <input
              ref={inputRef}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              onKeyDown={handleKeyDown}
              className="rep-input"
            />
          </>
        );

      /* ── 4: Gender ── */
      case 4:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              How do you identify?
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">Choose one, or skip</p>
            <div className="grid grid-cols-2 gap-3">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setGender(opt.value);
                    setTimeout(advance, 300);
                  }}
                  className={`rep-choice-tile ${gender === opt.value ? "selected" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const isSkippable = step >= 1; // All except password are optional

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Greeting */}
        {repInfo?.first_name && step === 0 && (
          <p className="text-[11px] text-[var(--rep-accent)] font-mono uppercase tracking-[3px] mb-6 rep-fade-in">
            Hey {repInfo.first_name}
          </p>
        )}

        {/* XP progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-[var(--rep-accent)]">
              Account Setup
            </span>
            <span className="text-[10px] text-[var(--rep-text-muted)] font-mono">
              {step + 1}/{STEP_COUNT}
            </span>
          </div>
          <div className="h-1 rounded-full bg-[var(--rep-border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--rep-accent)] transition-all duration-500 ease-out rep-xp-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="rep-step-in" key={stepKey}>
          {renderStepContent()}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <div>
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-sm text-[var(--rep-text-muted)] hover:text-white transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {isSkippable && step !== 4 && (
              <button
                onClick={advance}
                className="rounded-xl border border-[var(--rep-border)] px-5 py-2.5 text-[13px] font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 hover:text-white transition-colors"
              >
                Skip
              </button>
            )}
            {step !== 4 && (
              <button
                onClick={advance}
                disabled={!canAdvance()}
                className="rounded-xl bg-[var(--rep-accent)] px-6 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-30 flex items-center gap-1.5"
              >
                {step === STEP_COUNT - 1 && step !== 4 ? "Finish" : "Continue"}
                <ChevronRight size={14} />
              </button>
            )}
            {step === 4 && (
              <button
                onClick={advance}
                className="rounded-xl border border-[var(--rep-border)] px-5 py-2.5 text-[13px] font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 hover:text-white transition-colors"
              >
                {gender ? "Finish" : "Skip & Finish"}
              </button>
            )}
          </div>
        </div>

        {/* Enter hint */}
        {step < 4 && (
          <p className="text-center text-[10px] text-[var(--rep-text-muted)]/60 mt-6 font-mono">
            Press Enter ↵ to continue
          </p>
        )}
      </div>
    </div>
  );
}
