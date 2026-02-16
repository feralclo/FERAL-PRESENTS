"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";

/* ── Boot sequence lines ── */
const BOOT_LINES = [
  { text: "ENTRY REPS // v2.0", delay: 0 },
  { text: "Loading modules...", delay: 400 },
  { text: "Connecting...", delay: 700 },
  { text: "System ready.", delay: 1100 },
];

/* ── Gender options ── */
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Rather not say" },
];

/* ── Step definitions ── */
const STEP_COUNT = 8;

export default function RepJoinPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Phase & step ── */
  const [phase, setPhase] = useState<"boot" | "welcome" | "quiz" | "review" | "submitting" | "done">("boot");
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0); // for re-triggering animations
  const [error, setError] = useState("");

  /* ── Boot ── */
  const [visibleLines, setVisibleLines] = useState(0);

  /* ── Form values ── */
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");

  /* ── Boot sequence ── */
  useEffect(() => {
    if (phase !== "boot") return;
    const timers = BOOT_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLines(i + 1);
        if (i === BOOT_LINES.length - 1) {
          setTimeout(() => setPhase("welcome"), 500);
        }
      }, line.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  /* ── Auto-focus input on step change ── */
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
      setPhase("review");
    }
  };

  const goBack = () => {
    if (phase === "review") {
      setPhase("quiz");
      setStep(STEP_COUNT - 1);
      setStepKey((k) => k + 1);
      return;
    }
    if (step > 0) {
      setStep((s) => s - 1);
      setStepKey((k) => k + 1);
    } else {
      setPhase("welcome");
    }
  };

  /* ── Can advance check per step ── */
  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return firstName.trim().length > 0;
      case 1: return lastName.trim().length > 0;
      case 2: return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      case 3: return password.length >= 6;
      case 4: return true; // instagram optional
      case 5: return true; // tiktok optional
      case 6: return true; // dob optional
      case 7: return true; // gender optional (but auto-advances on select)
      default: return false;
    }
  };

  /* ── Enter to advance ── */
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
      const res = await fetch("/api/rep-portal/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          instagram: instagram.trim() || undefined,
          tiktok: tiktok.trim() || undefined,
          date_of_birth: dob || undefined,
          gender: gender || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Signup failed");
        setPhase("review");
        return;
      }

      // Always redirect to verify-email — verification required before access
      setPhase("done");
      setTimeout(() => {
        router.push(`/rep/verify-email?email=${encodeURIComponent(email.toLowerCase().trim())}`);
      }, 1800);
    } catch {
      setError("Connection lost. Try again.");
      setPhase("review");
    }
  };

  /* ── Progress ── */
  const progress =
    phase === "quiz" ? ((step + 1) / STEP_COUNT) * 100 :
    phase === "review" || phase === "submitting" || phase === "done" ? 100 : 0;

  /* ══════════════════════════════════════════════════════════════════
     RENDER: BOOT
     ══════════════════════════════════════════════════════════════════ */
  if (phase === "boot") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-3">
          {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
            <p
              key={i}
              className="rep-boot-line font-mono text-[13px] text-[var(--rep-text-muted)]"
              style={{ animationDelay: `${i * 50}ms` }}
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
     RENDER: WELCOME
     ══════════════════════════════════════════════════════════════════ */
  if (phase === "welcome") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm rep-fade-in">
          {/* Logo mark */}
          <div className="mb-8">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[4px] text-[var(--rep-accent)]">
              Entry Reps
            </span>
          </div>

          <h1 className="rep-title-reveal text-3xl font-bold text-white mb-3 tracking-tight">
            Join the Crew
          </h1>
          <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed mb-10 max-w-[260px] mx-auto">
            Sell tickets. Earn points. Climb the leaderboard. Claim rewards.
          </p>

          <button
            onClick={() => { setPhase("quiz"); setStep(0); setStepKey(0); }}
            className="rep-start-btn rounded-2xl bg-[var(--rep-accent)] px-10 py-4 text-sm font-bold uppercase tracking-[3px] text-white transition-all hover:brightness-110"
          >
            Press Start
          </button>
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
          <h2 className="text-2xl font-bold text-white mb-2">
            Application Sent
          </h2>
          <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed mb-8 max-w-[280px] mx-auto">
            Check your email for a verification link to activate your account.
          </p>
          <p className="mt-4 text-xs text-[var(--rep-text-muted)]">
            Redirecting...
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER: REVIEW
     ══════════════════════════════════════════════════════════════════ */
  if (phase === "review" || phase === "submitting") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-md rep-step-in">
          {/* XP bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-[var(--rep-accent)]">
                Review
              </span>
              <span className="text-[10px] text-[var(--rep-text-muted)] font-mono">READY</span>
            </div>
            <div className="h-1 rounded-full bg-[var(--rep-border)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--rep-accent)] rep-xp-fill" style={{ width: "100%" }} />
            </div>
          </div>

          <h2 className="text-xl font-bold text-white mb-1">Ready?</h2>
          <p className="text-sm text-[var(--rep-text-muted)] mb-6">Here&apos;s what we&apos;ve got.</p>

          <div className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-surface)] divide-y divide-[var(--rep-border)]">
            {[
              { label: "Name", value: `${firstName} ${lastName}` },
              { label: "Email", value: email },
              ...(instagram ? [{ label: "Instagram", value: `@${instagram}` }] : []),
              ...(tiktok ? [{ label: "TikTok", value: `@${tiktok}` }] : []),
              ...(dob ? [{ label: "Birthday", value: new Date(dob + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) }] : []),
              ...(gender ? [{ label: "Gender", value: GENDER_OPTIONS.find((g) => g.value === gender)?.label || gender }] : []),
            ].map((row) => (
              <div key={row.label} className="flex justify-between px-5 py-3.5">
                <span className="text-[13px] text-[var(--rep-text-muted)]">{row.label}</span>
                <span className="text-[13px] text-white font-medium">{row.value}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={goBack}
              className="flex-1 rounded-xl border border-[var(--rep-border)] px-4 py-3.5 text-sm font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={phase === "submitting"}
              className="flex-1 rounded-xl bg-[var(--rep-accent)] px-4 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              {phase === "submitting" ? "Sending..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER: QUIZ STEPS
     ══════════════════════════════════════════════════════════════════ */

  /* Step renderers */
  const renderStepContent = () => {
    switch (step) {
      /* ── 0: First name ── */
      case 0:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              What do people call you?
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">Your first name</p>
            <input
              ref={inputRef}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="rep-input"
              placeholder="First name"
              autoComplete="given-name"
            />
          </>
        );

      /* ── 1: Last name ── */
      case 1:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              And your surname?
            </h2>
            <input
              ref={inputRef}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="rep-input"
              placeholder="Last name"
              autoComplete="family-name"
            />
          </>
        );

      /* ── 2: Email ── */
      case 2:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              Drop your email
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">So we can reach you</p>
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              className="rep-input"
              placeholder="your@email.com"
              autoComplete="email"
            />
          </>
        );

      /* ── 3: Password ── */
      case 3:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              Create your passcode
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">Minimum 6 characters</p>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="rep-input"
              placeholder="••••••"
              autoComplete="new-password"
            />
          </>
        );

      /* ── 4: Instagram ── */
      case 4:
        return (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              Got Instagram?
            </h2>
            <p className="text-sm text-[var(--rep-text-muted)] mb-6">Optional — skip if you don&apos;t use it</p>
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

      /* ── 5: TikTok ── */
      case 5:
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

      /* ── 6: Birthday ── */
      case 6:
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

      /* ── 7: Gender ── */
      case 7:
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
                    // Auto-advance after selection
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

  const isSkippableStep = step >= 4; // Steps 4-7 are optional

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* XP progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-[var(--rep-accent)]">
              {step < 4 ? "The Basics" : step < 6 ? "Socials" : "About You"}
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

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-[var(--rep-text-muted)] hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>

          <div className="flex gap-2">
            {isSkippableStep && step !== 7 && (
              <button
                onClick={advance}
                className="rounded-xl border border-[var(--rep-border)] px-5 py-2.5 text-[13px] font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 hover:text-white transition-colors"
              >
                Skip
              </button>
            )}
            {step !== 7 && (
              <button
                onClick={advance}
                disabled={!canAdvance()}
                className="rounded-xl bg-[var(--rep-accent)] px-6 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-30 flex items-center gap-1.5"
              >
                Continue
                <ChevronRight size={14} />
              </button>
            )}
            {step === 7 && (
              <button
                onClick={advance}
                className="rounded-xl border border-[var(--rep-border)] px-5 py-2.5 text-[13px] font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 hover:text-white transition-colors"
              >
                {gender ? "Continue" : "Skip"}
              </button>
            )}
          </div>
        </div>

        {/* Enter hint */}
        {step < 7 && (
          <p className="text-center text-[10px] text-[var(--rep-text-muted)]/60 mt-6 font-mono">
            Press Enter ↵ to continue
          </p>
        )}
      </div>
    </div>
  );
}
