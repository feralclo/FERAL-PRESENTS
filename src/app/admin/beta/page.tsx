"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Music,
  Mic2,
  Tent,
  GraduationCap,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/* ══════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════ */

const EVENT_TYPES = [
  { id: "club-nights", label: "Club nights", icon: Music },
  { id: "live-music", label: "Live music", icon: Mic2 },
  { id: "festivals", label: "Festivals", icon: Tent },
  { id: "workshops", label: "Workshops", icon: GraduationCap },
  { id: "pop-ups", label: "Pop-ups", icon: Sparkles },
  { id: "other", label: "Other", icon: HelpCircle },
];

const SCALE_OPTIONS = [
  { id: "just-starting", label: "Just getting started", sub: "Planning first events" },
  { id: "growing", label: "Growing fast", sub: "Running regular events, ready to scale" },
  { id: "established", label: "Established", sub: "Consistent events, looking for better tools" },
  { id: "switching", label: "Switching platforms", sub: "Done with Skiddle / Eventbrite / DICE" },
];

/* ══════════════════════════════════════════════════════════
   SHARED UI
   ══════════════════════════════════════════════════════════ */

function EntryWordmark({ size = "lg" }: { size?: "sm" | "lg" }) {
  return (
    <span
      className={`font-mono font-bold uppercase select-none ${
        size === "lg"
          ? "text-[36px] tracking-[8px]"
          : "text-[18px] tracking-[6px]"
      }`}
      style={{
        background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      Entry
    </span>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-500 ${
            i <= step
              ? "bg-primary shadow-[0_0_8px_rgba(139,92,246,0.4)]"
              : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

/** Dot grid + cursor-tracking glow background */
function GridBackground() {
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(139, 92, 246, 0.25) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Cursor-following glow (desktop) */}
      <div
        className="absolute inset-0 hidden sm:block transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(139, 92, 246, 0.06), transparent 40%)`,
        }}
      />
      {/* Ambient floating glow (always, stronger on mobile) */}
      <div
        className="absolute -left-[200px] -top-[200px] h-[600px] w-[600px] rounded-full bg-violet-500/[0.04] blur-[150px]"
        style={{ animation: "betaFloat 20s ease-in-out infinite" }}
      />
      <div
        className="absolute -right-[100px] bottom-[10%] h-[400px] w-[400px] rounded-full bg-violet-400/[0.03] blur-[120px]"
        style={{ animation: "betaFloat 25s ease-in-out infinite reverse" }}
      />
      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes betaFloat {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(80px, 40px); }
          66% { transform: translate(-40px, 80px); }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP 0 — LANDING (INVITE CODE + REQUEST ACCESS)
   ══════════════════════════════════════════════════════════ */

function StepIntro({
  onRequestAccess,
  onCodeVerified,
}: {
  onRequestAccess: () => void;
  onCodeVerified: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setCodeError("");
    setCodeLoading(true);

    try {
      const res = await fetch("/api/beta/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();

      if (data.valid) {
        sessionStorage.setItem("entry_beta_invite", code.trim());
        onCodeVerified();
        router.push("/admin/signup/");
      } else {
        setCodeError("Invalid code. Check your invite and try again.");
      }
    } catch {
      setCodeError("Something went wrong. Try again.");
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <div
      className={`flex min-h-[100dvh] flex-col items-center justify-center px-5 transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <GridBackground />

      <div className="relative w-full max-w-[440px] text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-1.5">
          <div className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
          <span className="text-[11px] font-semibold tracking-[2.5px] uppercase text-primary">
            Invite Only
          </span>
        </div>

        {/* Wordmark */}
        <div className="mb-5">
          <EntryWordmark />
        </div>

        {/* Headline */}
        <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.15] text-foreground tracking-tight [text-wrap:balance]">
          Stop making other platforms famous
        </h1>

        <p className="mx-auto mt-4 max-w-[380px] text-[15px] leading-relaxed text-muted-foreground">
          Your brand on every page. Your money the second it lands. Your
          checkout in 30 seconds. We&apos;re letting in a small group of
          promoters who are ready to own their events.
        </p>

        {/* ── Invite code section ── */}
        <div className="mt-10 rounded-2xl border border-border/60 bg-card/80 p-6 text-left backdrop-blur-sm">
          <p className="mb-3 text-[13px] font-semibold text-foreground">
            Have an invite code?
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter code"
              className="h-11 flex-1 rounded-xl border border-input bg-background/50 px-4 font-mono text-[14px] uppercase tracking-wider text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/30 placeholder:normal-case placeholder:tracking-normal focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={handleVerifyCode}
              disabled={!code.trim() || codeLoading}
              className="h-11 rounded-xl bg-primary px-5 text-[13px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {codeLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
            </button>
          </div>
          {codeError && (
            <p className="mt-2 text-[12px] text-destructive">{codeError}</p>
          )}

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-[11px] text-muted-foreground/40">
                or
              </span>
            </div>
          </div>

          {/* Request access */}
          <button
            onClick={onRequestAccess}
            className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/50 text-[13px] font-medium text-foreground transition-all duration-200 hover:border-primary/30 hover:bg-background"
          >
            Request access without a code
            <ArrowRight
              size={14}
              className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </button>
        </div>

        {/* Value props */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground/50">
          <span>Instant Stripe payouts</span>
          <span className="text-border">|</span>
          <span>100% white-label</span>
          <span className="text-border">|</span>
          <span>30s checkout</span>
        </div>

        {/* Sign in */}
        <p className="mt-8 text-[13px] text-muted-foreground">
          Already have access?{" "}
          <Link
            href="/admin/login/"
            className="font-medium text-primary transition-colors hover:text-primary/80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP 1 — WHO ARE YOU
   ══════════════════════════════════════════════════════════ */

function StepCompany({
  companyName,
  onCompanyNameChange,
  selectedTypes,
  onToggleType,
  onContinue,
  onBack,
}: {
  companyName: string;
  onCompanyNameChange: (v: string) => void;
  selectedTypes: Set<string>;
  onToggleType: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const canContinue = companyName.trim().length >= 2;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <h1 className="text-[22px] font-bold text-foreground leading-tight">
        Tell us who you are
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        We hand-pick every promoter on the platform. This isn&apos;t a
        free-for-all.
      </p>

      {/* Company name */}
      <div className="mt-7">
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Brand or company name
        </label>
        <input
          type="text"
          placeholder="e.g. Night Shift Events"
          className="h-12 w-full rounded-xl border border-input bg-background/50 px-4 text-[15px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
          autoFocus
          maxLength={60}
        />
      </div>

      {/* Event types */}
      <div className="mt-5">
        <label className="mb-2.5 block text-[13px] font-medium text-foreground">
          What do you run?{" "}
          <span className="font-normal text-muted-foreground/50">
            Select all that apply
          </span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {EVENT_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedTypes.has(type.id);
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => onToggleType(type.id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all duration-200 ${
                  isSelected
                    ? "border-primary/40 bg-primary/[0.06] text-foreground"
                    : "border-border bg-card hover:border-border/80 text-foreground/60"
                }`}
              >
                <Icon
                  size={16}
                  className={
                    isSelected ? "text-primary" : "text-muted-foreground/50"
                  }
                />
                <span className="text-[11px] font-medium leading-tight text-center">
                  {type.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="mt-7 h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        Continue
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP 2 — YOUR SCALE
   ══════════════════════════════════════════════════════════ */

function StepScale({
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  selected: string | null;
  onSelect: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <h1 className="text-[22px] font-bold text-foreground leading-tight">
        Where are you at?
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        No wrong answer. We&apos;re looking for promoters at every stage who
        want better tools.
      </p>

      <div className="mt-7 flex flex-col gap-2">
        {SCALE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={`rounded-xl border px-5 py-4 text-left transition-all duration-200 ${
              selected === opt.id
                ? "border-primary/40 bg-primary/[0.06]"
                : "border-border bg-card hover:border-border/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-foreground">
                {opt.label}
              </span>
              {selected === opt.id && (
                <Check
                  size={16}
                  className="shrink-0 text-primary"
                  strokeWidth={2.5}
                />
              )}
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{opt.sub}</p>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-7 h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)]"
      >
        Continue
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP 3 — EMAIL + SUBMIT
   ══════════════════════════════════════════════════════════ */

function StepEmail({
  email,
  onEmailChange,
  onSubmit,
  loading,
  error,
  onBack,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
  onBack: () => void;
}) {
  const isValid = email.includes("@") && email.includes(".");

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <h1 className="text-[22px] font-bold text-foreground leading-tight">
        Where should we send your invite?
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Accepted promoters hear back within 48 hours.
      </p>

      {error && (
        <div className="mt-5 rounded-lg border border-destructive/15 bg-destructive/8 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="mt-7">
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Email address
        </label>
        <input
          type="email"
          placeholder="you@company.com"
          className="h-12 w-full rounded-xl border border-input bg-background/50 px-4 text-[15px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoFocus
          autoComplete="email"
        />
        <p className="mt-2.5 text-[12px] text-muted-foreground/40">
          We&apos;ll only contact you about your access. No spam.
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!isValid || loading}
        className="group mt-7 h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Submitting...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            Submit application
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </span>
        )}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP 4 — CONFIRMATION
   ══════════════════════════════════════════════════════════ */

function StepConfirmation({ position }: { position: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`flex min-h-[100dvh] flex-col items-center justify-center px-5 transition-all duration-700 ${
        visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
    >
      <GridBackground />

      <div className="relative w-full max-w-[440px] text-center">
        {/* Success icon */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08]">
          <Check size={24} className="text-emerald-400" strokeWidth={2.5} />
        </div>

        <EntryWordmark size="sm" />

        <h1 className="mt-5 text-[26px] sm:text-[30px] font-bold text-foreground leading-tight">
          Application received
        </h1>

        <p className="mx-auto mt-3 max-w-[340px] text-[15px] text-muted-foreground leading-relaxed">
          We review every application personally. If you&apos;re the right fit,
          you&apos;ll hear from us within 48 hours.
        </p>

        {/* Position */}
        <div className="mt-8 rounded-2xl border border-border/60 bg-card/80 p-6 backdrop-blur-sm">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[3px] text-muted-foreground/50">
            Queue position
          </p>
          <p className="mt-2 font-mono text-[44px] font-bold leading-none text-foreground">
            #{position}
          </p>
        </div>

        {/* What happens next */}
        <div className="mt-6 rounded-2xl border border-border/60 bg-card/80 p-6 text-left backdrop-blur-sm">
          <p className="mb-4 text-[13px] font-semibold text-foreground">
            What happens next
          </p>
          <div className="space-y-3">
            {[
              "We review your application (usually within 48 hours)",
              "Accepted promoters receive a login link via email",
              "Connect Stripe, create your first event, start selling",
            ].map((text, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {i + 1}
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        <a
          href="https://entry.events"
          className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
        >
          <ArrowLeft size={14} />
          Back to entry.events
        </a>

        <p className="mt-6 font-mono text-[10px] tracking-wider text-muted-foreground/40">
          Powered by Entry
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE ORCHESTRATOR
   ══════════════════════════════════════════════════════════ */

export default function BetaApplicationPage() {
  // -1 = intro, 0–2 = form steps, 3 = confirmation
  const [step, setStep] = useState(-1);
  const [position, setPosition] = useState(0);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(
    new Set()
  );
  const [scale, setScale] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const handleToggleEventType = (id: string) => {
    setSelectedEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          email: email.trim(),
          event_types: Array.from(selectedEventTypes),
          monthly_events: scale,
          audience_size: null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setPosition(data.position || 1);
      setStep(3);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // ── Intro (full screen)
  if (step === -1) {
    return (
      <div data-admin className="min-h-[100dvh] bg-background">
        <StepIntro
          onRequestAccess={() => setStep(0)}
          onCodeVerified={() => {}}
        />
      </div>
    );
  }

  // ── Confirmation (full screen)
  if (step === 3) {
    return (
      <div data-admin className="min-h-[100dvh] bg-background">
        <StepConfirmation position={position} />
      </div>
    );
  }

  // ── Form steps (inside card)
  return (
    <div
      data-admin
      className="flex min-h-[100dvh] items-center justify-center bg-background"
    >
      <GridBackground />

      <div className="relative w-full max-w-[480px] px-5 py-12">
        {/* Wordmark */}
        <div className="mb-4 text-center">
          <EntryWordmark />
        </div>

        {/* Progress */}
        <div className="mx-auto mb-8 max-w-[180px]">
          <ProgressBar step={step} total={3} />
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-border/60 bg-card/80 p-7 shadow-xl shadow-black/20 backdrop-blur-sm">
          {step === 0 && (
            <StepCompany
              companyName={companyName}
              onCompanyNameChange={setCompanyName}
              selectedTypes={selectedEventTypes}
              onToggleType={handleToggleEventType}
              onContinue={() => setStep(1)}
              onBack={() => setStep(-1)}
            />
          )}

          {step === 1 && (
            <StepScale
              selected={scale}
              onSelect={setScale}
              onContinue={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}

          {step === 2 && (
            <StepEmail
              email={email}
              onEmailChange={setEmail}
              onSubmit={handleSubmit}
              loading={loading}
              error={error}
              onBack={() => setStep(1)}
            />
          )}
        </div>

        <p className="mt-10 text-center font-mono text-[10px] text-muted-foreground/40 tracking-wider">
          Powered by Entry
        </p>
      </div>
    </div>
  );
}
