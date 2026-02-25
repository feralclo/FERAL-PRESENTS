"use client";

import { useState, useEffect, useRef } from "react";
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
  Shield,
  Zap,
  Users,
} from "lucide-react";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/* ══════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════ */

const EVENT_TYPES = [
  { id: "club-nights", label: "Club nights & parties", icon: Music },
  { id: "live-music", label: "Live music & concerts", icon: Mic2 },
  { id: "festivals", label: "Festivals & multi-day", icon: Tent },
  { id: "workshops", label: "Workshops & classes", icon: GraduationCap },
  { id: "pop-ups", label: "Pop-ups & activations", icon: Sparkles },
  { id: "other", label: "Other", icon: HelpCircle },
];

const MONTHLY_EVENTS_OPTIONS = [
  { id: "1-2", label: "1–2 events" },
  { id: "3-5", label: "3–5 events" },
  { id: "6-10", label: "6–10 events" },
  { id: "10+", label: "10+ events" },
];

const AUDIENCE_SIZE_OPTIONS = [
  { id: "under-200", label: "Under 200" },
  { id: "200-500", label: "200–500" },
  { id: "500-2000", label: "500–2,000" },
  { id: "2000-10000", label: "2,000–10,000" },
  { id: "10000+", label: "10,000+" },
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
            i <= step ? "bg-primary shadow-[0_0_8px_rgba(139,92,246,0.4)]" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP 0 — LANDING / INTRO
   ══════════════════════════════════════════════════════════ */

function StepIntro({ onStart }: { onStart: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Staggered entrance
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`flex min-h-[100dvh] flex-col items-center justify-center px-5 transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {/* Animated gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/[0.04] blur-[150px] animate-pulse" />
        <div
          className="absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-violet-400/[0.03] blur-[120px]"
          style={{ animation: "pulse 4s ease-in-out infinite 1s" }}
        />
      </div>

      <div className="relative w-full max-w-[480px] text-center">
        {/* Beta badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-1.5">
          <div className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </div>
          <span className="text-[12px] font-semibold tracking-[2px] uppercase text-primary">
            Early Access
          </span>
        </div>

        {/* Wordmark */}
        <div className="mb-6">
          <EntryWordmark />
        </div>

        {/* Headline */}
        <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight text-foreground">
          The event platform built for{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-violet-500 to-violet-600">
            promoters who give a damn
          </span>
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[400px] mx-auto">
          We&apos;re opening Entry to a select group of promoters. White-label
          event pages, instant Stripe payouts, gamified rep programs — under your
          brand.
        </p>

        {/* Social proof pills */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {[
            { icon: Shield, text: "Invite only" },
            { icon: Zap, text: "Instant payouts" },
            { icon: Users, text: "Limited spots" },
          ].map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-[12px] text-muted-foreground"
            >
              <item.icon size={12} className="text-primary/70" />
              {item.text}
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onStart}
          className="group mt-10 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-8 text-[14px] font-semibold text-white shadow-[0_1px_20px_rgba(139,92,246,0.3)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_30px_rgba(139,92,246,0.45)] hover:scale-[1.02] active:scale-[0.98]"
        >
          Request early access
          <ArrowRight
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>

        <p className="mt-4 text-[12px] text-muted-foreground/50">
          Takes less than 60 seconds
        </p>

        {/* Existing account */}
        <p className="mt-10 text-[13px] text-muted-foreground">
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
   STEP 1 — COMPANY NAME + EVENT TYPES
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

      <h1 className="text-2xl font-bold text-foreground">
        Tell us about your brand
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        We want to make sure Entry is the right fit.
      </p>

      {/* Company name */}
      <div className="mt-8">
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Brand / company name
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
      <div className="mt-6">
        <label className="mb-3 block text-[13px] font-medium text-foreground">
          What kind of events do you run?{" "}
          <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedTypes.has(type.id);
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => onToggleType(type.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                  isSelected
                    ? "border-primary/40 bg-primary/[0.06] text-foreground"
                    : "border-border bg-card hover:border-border/80 text-foreground/70"
                }`}
              >
                <Icon
                  size={15}
                  className={isSelected ? "text-primary" : "text-muted-foreground/60"}
                />
                <span className="text-[13px] font-medium">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="mt-8 h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        Continue
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STEP 2 — SCALE (QUALIFYING)
   ══════════════════════════════════════════════════════════ */

function StepScale({
  monthlyEvents,
  onMonthlyEventsChange,
  audienceSize,
  onAudienceSizeChange,
  onContinue,
  onBack,
}: {
  monthlyEvents: string | null;
  onMonthlyEventsChange: (v: string) => void;
  audienceSize: string | null;
  onAudienceSizeChange: (v: string) => void;
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

      <h1 className="text-2xl font-bold text-foreground">
        What&apos;s your scale?
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        This helps us prioritise the right beta features for you.
      </p>

      {/* Monthly events */}
      <div className="mt-8">
        <label className="mb-3 block text-[13px] font-medium text-foreground">
          How many events per month?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MONTHLY_EVENTS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onMonthlyEventsChange(opt.id)}
              className={`rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                monthlyEvents === opt.id
                  ? "border-primary/40 bg-primary/[0.06] text-foreground"
                  : "border-border bg-card hover:border-border/80 text-foreground/70"
              }`}
            >
              <span className="text-[14px] font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Audience size */}
      <div className="mt-6">
        <label className="mb-3 block text-[13px] font-medium text-foreground">
          Typical audience size per event?
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AUDIENCE_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onAudienceSizeChange(opt.id)}
              className={`rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                audienceSize === opt.id
                  ? "border-primary/40 bg-primary/[0.06] text-foreground"
                  : "border-border bg-card hover:border-border/80 text-foreground/70"
              }`}
            >
              <span className="text-[14px] font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-8 h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)]"
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

      <h1 className="text-2xl font-bold text-foreground">
        Where should we reach you?
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        We&apos;ll review your application and get back to you within 48 hours.
      </p>

      {error && (
        <div className="mt-5 rounded-lg border border-destructive/15 bg-destructive/8 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="mt-8">
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Email address
        </label>
        <input
          type="email"
          placeholder="you@example.com"
          className="h-12 w-full rounded-xl border border-input bg-background/50 px-4 text-[15px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoFocus
          autoComplete="email"
        />
      </div>

      {/* Privacy note */}
      <p className="mt-3 text-[12px] text-muted-foreground/50">
        No spam, ever. We&apos;ll only contact you about your beta access.
      </p>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!isValid || loading}
        className="group mt-8 h-12 w-full rounded-xl bg-primary text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
      {/* Background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/[0.06] blur-[150px]" />
        <div className="absolute right-1/3 bottom-1/4 h-[300px] w-[300px] rounded-full bg-emerald-500/[0.04] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[480px] text-center">
        {/* Success check */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08]">
          <Check size={28} className="text-emerald-400" strokeWidth={2.5} />
        </div>

        <EntryWordmark size="sm" />

        <h1 className="mt-6 text-[28px] sm:text-[32px] font-bold text-foreground">
          You&apos;re on the list
        </h1>

        <p className="mt-3 text-[15px] text-muted-foreground max-w-[360px] mx-auto">
          We&apos;re reviewing applications and onboarding new promoters in
          small batches. We&apos;ll be in touch soon.
        </p>

        {/* Position card */}
        <div className="mt-8 rounded-2xl border border-border/60 bg-card p-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[3px] text-muted-foreground/60">
            Your position
          </p>
          <p className="mt-2 font-mono text-[40px] font-bold text-foreground">
            #{position}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            in the early access queue
          </p>
        </div>

        {/* What happens next */}
        <div className="mt-8 text-left rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-[13px] font-semibold text-foreground mb-4">
            What happens next
          </p>
          <div className="space-y-3">
            {[
              "We review your application (usually within 48 hours)",
              "You'll receive an invite email with your login credentials",
              "Set up your brand and start selling — takes 5 minutes",
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

        {/* Back to marketing */}
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
   MAIN PAGE
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
  const [monthlyEvents, setMonthlyEvents] = useState<string | null>(null);
  const [audienceSize, setAudienceSize] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

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
          monthly_events: monthlyEvents,
          audience_size: audienceSize,
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

  // Intro screen (full screen, no card)
  if (step === -1) {
    return (
      <div data-admin className="min-h-[100dvh] bg-background">
        <StepIntro onStart={() => setStep(0)} />
      </div>
    );
  }

  // Confirmation screen (full screen, no card)
  if (step === 3) {
    return (
      <div data-admin className="min-h-[100dvh] bg-background">
        <StepConfirmation position={position} />
      </div>
    );
  }

  // Form steps (1–3 inside card)
  return (
    <div
      data-admin
      className="flex min-h-[100dvh] items-center justify-center bg-background"
      ref={containerRef}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[520px] px-5 py-12">
        {/* Wordmark */}
        <div className="mb-4 text-center">
          <EntryWordmark />
        </div>

        {/* Progress */}
        <div className="mb-8 max-w-[200px] mx-auto">
          <ProgressBar step={step} total={3} />
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-xl shadow-black/20">
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
              monthlyEvents={monthlyEvents}
              onMonthlyEventsChange={setMonthlyEvents}
              audienceSize={audienceSize}
              onAudienceSizeChange={setAudienceSize}
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

        {/* Footer */}
        <p className="mt-10 text-center font-mono text-[10px] text-muted-foreground/40 tracking-wider">
          Powered by Entry
        </p>
      </div>
    </div>
  );
}
