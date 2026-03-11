"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";

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
  const [phase, setPhase] = useState<"welcome" | "quiz" | "review" | "submitting" | "done">("welcome");
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [error, setError] = useState("");

  /* ── Google OAuth ── */
  const [googleLoading, setGoogleLoading] = useState(false);

  /* ── Branding ── */
  const [branding, setBranding] = useState<{ org_name?: string; logo_url?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/branding");
        const json = await res.json();
        if (json.data) setBranding(json.data);
      } catch { /* ignore */ }
    })();
  }, []);

  /* ── Form values ── */
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");

  /* ── Auto-focus input on step change ── */
  useEffect(() => {
    if (phase === "quiz") {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [step, phase]);

  /* ── Google OAuth ── */
  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError("");
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
      setError(oauthError.message || "Failed to start Google sign up");
      setGoogleLoading(false);
    }
  };

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
      case 4: return true;
      case 5: return true;
      case 6: return true;
      case 7: return true;
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

  /* ══ WELCOME — Google OAuth hero, email signup secondary ══ */
  if (phase === "welcome") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm rep-fade-in">
          <div className="mb-8">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt="" className="h-14 w-auto mx-auto mb-4" />
            ) : null}
            <span className="font-mono text-xs font-bold uppercase tracking-[4px] text-primary">
              {branding?.org_name || "Entry"} Reps
            </span>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
            Join the Crew
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-[280px] mx-auto">
            Sell tickets, earn rewards, and climb the leaderboard.
          </p>

          {/* Google OAuth — Primary CTA */}
          <Button
            size="lg"
            className="w-full max-w-[300px] h-14 gap-3 font-semibold rounded-2xl text-base"
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </Button>

          <p className="text-xs text-muted-foreground/60 mt-3 max-w-[260px] mx-auto">
            One tap to apply — we&apos;ll use your Google name and photo
          </p>

          {error && (
            <div className="mt-4 w-full max-w-[300px] mx-auto rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          {/* Email signup — Secondary */}
          <p className="mt-10 text-sm text-muted-foreground">
            No Google account?{" "}
            <button
              onClick={() => { setPhase("quiz"); setStep(0); setStepKey(0); }}
              className="text-primary hover:underline font-medium"
            >
              Apply with email
            </button>
          </p>

          <p className="mt-4 text-xs text-muted-foreground/50">
            Already a rep?{" "}
            <Link href="/rep/login" className="text-primary/70 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  /* ══ DONE ══ */
  if (phase === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm rep-celebrate">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-success/10 border border-success/20 mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Application Sent
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-[280px] mx-auto">
            Check your email for a verification link to activate your account.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Redirecting...
          </p>
        </div>
      </div>
    );
  }

  /* ══ REVIEW ══ */
  if (phase === "review" || phase === "submitting") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-md rep-step-in">
          {/* XP bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-primary">
                Review
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">READY</span>
            </div>
            <div className="h-1 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full bg-primary rep-xp-fill" style={{ width: "100%" }} />
            </div>
          </div>

          <h2 className="text-xl font-bold text-foreground mb-1">Ready?</h2>
          <p className="text-sm text-muted-foreground mb-6">Here&apos;s what we&apos;ve got.</p>

          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {[
              { label: "Name", value: `${firstName} ${lastName}` },
              { label: "Email", value: email },
              ...(instagram ? [{ label: "Instagram", value: `@${instagram}` }] : []),
              ...(tiktok ? [{ label: "TikTok", value: `@${tiktok}` }] : []),
              ...(dob ? [{ label: "Birthday", value: new Date(dob + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) }] : []),
              ...(gender ? [{ label: "Gender", value: GENDER_OPTIONS.find((g) => g.value === gender)?.label || gender }] : []),
            ].map((row) => (
              <div key={row.label} className="flex justify-between px-5 py-3.5">
                <span className="text-[13px] text-muted-foreground">{row.label}</span>
                <span className="text-[13px] text-foreground font-medium">{row.value}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              className="flex-1"
              onClick={goBack}
            >
              Back
            </Button>
            <Button
              className="flex-1 uppercase tracking-wider"
              onClick={handleSubmit}
              disabled={phase === "submitting"}
            >
              {phase === "submitting" ? (
                <><Loader2 size={14} className="animate-spin" /> Sending...</>
              ) : "Submit"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ══ QUIZ STEPS ══ */
  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              What do people call you?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">Your first name</p>
            <Input
              ref={inputRef}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-14 rounded-2xl bg-secondary"
              placeholder="First name"
              autoComplete="given-name"
            />
          </>
        );

      case 1:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              And your surname?
            </h2>
            <Input
              ref={inputRef}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-14 rounded-2xl bg-secondary"
              placeholder="Last name"
              autoComplete="family-name"
            />
          </>
        );

      case 2:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Drop your email
            </h2>
            <p className="text-sm text-muted-foreground mb-6">So we can reach you</p>
            <Input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-14 rounded-2xl bg-secondary"
              placeholder="your@email.com"
              autoComplete="email"
            />
          </>
        );

      case 3:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Create your passcode
            </h2>
            <p className="text-sm text-muted-foreground mb-6">Minimum 6 characters</p>
            <Input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-14 rounded-2xl bg-secondary"
              placeholder="••••••"
              autoComplete="new-password"
            />
          </>
        );

      case 4:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Got Instagram?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">Optional — skip if you don&apos;t use it</p>
            <div className="relative">
              <span className="absolute left-[18px] top-1/2 -translate-y-1/2 text-base text-muted-foreground pointer-events-none">@</span>
              <Input
                ref={inputRef}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace("@", ""))}
                onKeyDown={handleKeyDown}
                className="h-14 rounded-2xl bg-secondary pl-9"
                placeholder="yourhandle"
              />
            </div>
          </>
        );

      case 5:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              On TikTok?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">Optional</p>
            <div className="relative">
              <span className="absolute left-[18px] top-1/2 -translate-y-1/2 text-base text-muted-foreground pointer-events-none">@</span>
              <Input
                ref={inputRef}
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value.replace("@", ""))}
                onKeyDown={handleKeyDown}
                className="h-14 rounded-2xl bg-secondary pl-9"
                placeholder="yourhandle"
              />
            </div>
          </>
        );

      case 6:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              When were you born?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">Optional</p>
            <Input
              ref={inputRef}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-14 rounded-2xl bg-secondary"
            />
          </>
        );

      case 7:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              How do you identify?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">Choose one, or skip</p>
            <div className="grid grid-cols-2 gap-3">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setGender(opt.value);
                    setTimeout(advance, 300);
                  }}
                  className={cn(
                    "rounded-[14px] border border-border bg-secondary px-5 py-3.5 text-sm font-medium text-muted-foreground text-center transition-all duration-200",
                    "hover:border-primary/40 hover:text-foreground hover:bg-primary/5",
                    gender === opt.value && "border-primary bg-primary/10 text-foreground shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                  )}
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

  const isSkippableStep = step >= 4;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* XP progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-primary">
              {step < 4 ? "The Basics" : step < 6 ? "Socials" : "About You"}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {step + 1}/{STEP_COUNT}
            </span>
          </div>
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out rep-xp-fill"
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
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>

          <div className="flex gap-2">
            {isSkippableStep && step !== 7 && (
              <Button
                variant="outline"
                size="sm"
                onClick={advance}
              >
                Skip
              </Button>
            )}
            {step !== 7 && (
              <Button
                size="sm"
                onClick={advance}
                disabled={!canAdvance()}
              >
                Continue
                <ChevronRight size={14} />
              </Button>
            )}
            {step === 7 && (
              <Button
                variant="outline"
                size="sm"
                onClick={advance}
              >
                {gender ? "Continue" : "Skip"}
              </Button>
            )}
          </div>
        </div>

        {/* Enter hint */}
        {step < 7 && (
          <p className="text-center text-[10px] text-muted-foreground/60 mt-6 font-mono">
            Press Enter ↵ to continue
          </p>
        )}
      </div>
    </div>
  );
}
