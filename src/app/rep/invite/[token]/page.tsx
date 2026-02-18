"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

    const timers = VERIFY_LINES.map((line, i) =>
      setTimeout(() => {
        if (!cancelled) setVisibleLines(i + 1);
      }, line.delay)
    );

    (async () => {
      try {
        const res = await fetch(`/api/rep-portal/invite/${token}`);
        const json = await res.json();

        await new Promise((r) => setTimeout(r, 1200));
        if (cancelled) return;

        if (json.valid) {
          setRepInfo(json.rep);
          const repEmail = json.rep?.email || "";
          if (repEmail && !repEmail.endsWith("@pending.entry")) {
            setEmail(repEmail);
          }
          setPhase("granted");
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
      case 1: return true;
      case 2: return true;
      case 3: return true;
      case 4: return true;
      default: return false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canAdvance()) {
      e.preventDefault();
      advance();
    }
  };

  const [autoLoginFailed, setAutoLoginFailed] = useState(false);

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

      const sessionTokens = json.data?.session;
      let loggedIn = false;

      if (sessionTokens?.access_token && sessionTokens?.refresh_token) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: sessionTokens.access_token,
            refresh_token: sessionTokens.refresh_token,
          });
          if (!sessionError) {
            loggedIn = true;
          }
        }
      }

      if (loggedIn) {
        setTimeout(() => router.push("/rep"), 2500);
      } else {
        setAutoLoginFailed(true);
      }
    } catch {
      setError("Connection lost. Try again.");
      setPhase("quiz");
    }
  };

  const progress = phase === "quiz" ? ((step + 1) / STEP_COUNT) * 100 : phase === "done" ? 100 : 0;

  /* ══ VERIFYING ══ */
  if (phase === "verifying") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-3">
          {VERIFY_LINES.slice(0, visibleLines).map((line, i) => (
            <p
              key={i}
              className="rep-boot-line font-mono text-[13px] text-muted-foreground"
            >
              <span className="text-primary mr-2">&gt;</span>
              {line.text}
              {i === visibleLines - 1 && <span className="rep-cursor" />}
            </p>
          ))}
        </div>
      </div>
    );
  }

  /* ══ DENIED ══ */
  if (phase === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm rep-fade-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20 mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            This invite link has expired or has already been used.
          </p>
          <Button asChild>
            <Link href="/rep/join">Apply Instead</Link>
          </Button>
        </div>
      </div>
    );
  }

  /* ══ ACCESS GRANTED ══ */
  if (phase === "granted") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm rep-access-reveal">
          <div className="mb-6">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[4px] text-primary">
              Access Granted
            </span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            {repInfo?.first_name ? `Welcome, ${repInfo.first_name}` : "You\u2019re in"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;ve been personally invited to the crew.
          </p>
          <div className="mt-8">
            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
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
          <h2 className="text-2xl font-bold text-foreground mb-2">You&apos;re In</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-[280px] mx-auto">
            Your account is live and your discount code is ready. Time to start earning.
          </p>
          {autoLoginFailed ? (
            <>
              <Button asChild>
                <Link href="/rep/login">Log In to Dashboard</Link>
              </Button>
              <p className="mt-4 text-xs text-muted-foreground">
                Use the email and password you just created
              </p>
            </>
          ) : (
            <>
              <Button onClick={() => router.push("/rep")}>
                Go to Dashboard
              </Button>
              <p className="mt-4 text-xs text-muted-foreground">Redirecting automatically...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ══ QUIZ ══ */
  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Set up your login
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              This is what you&apos;ll use to sign in
            </p>
            <div className="space-y-4">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground mb-2 block">
                  Email
                </Label>
                <Input
                  type="email"
                  value={email}
                  readOnly
                  className="rep-input opacity-60 cursor-not-allowed"
                  autoComplete="email"
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  This is the email your invite was sent to
                </p>
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground mb-2 block">
                  Password
                </Label>
                <Input
                  ref={inputRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-14 rounded-2xl bg-secondary"
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </>
        );

      case 1:
        return (
          <>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Got Instagram?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">Optional</p>
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

      case 2:
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

      case 3:
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

      case 4:
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

  const isSkippable = step >= 1;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Greeting */}
        {repInfo?.first_name && step === 0 && (
          <p className="text-[11px] text-primary font-mono uppercase tracking-[3px] mb-6 rep-fade-in">
            Hey {repInfo.first_name}
          </p>
        )}

        {/* XP progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] text-primary">
              Account Setup
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

        {error && (
          <div className="mt-4 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <div>
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {isSkippable && step !== 4 && (
              <Button
                variant="outline"
                size="sm"
                onClick={advance}
              >
                Skip
              </Button>
            )}
            {step !== 4 && (
              <Button
                size="sm"
                onClick={advance}
                disabled={!canAdvance()}
              >
                {step === STEP_COUNT - 1 && step !== 4 ? "Finish" : "Continue"}
                <ChevronRight size={14} />
              </Button>
            )}
            {step === 4 && (
              <Button
                variant="outline"
                size="sm"
                onClick={advance}
              >
                {gender ? "Finish" : "Skip & Finish"}
              </Button>
            )}
          </div>
        </div>

        {/* Enter hint */}
        {step < 4 && (
          <p className="text-center text-[10px] text-muted-foreground/60 mt-6 font-mono">
            Press Enter ↵ to continue
          </p>
        )}
      </div>
    </div>
  );
}
