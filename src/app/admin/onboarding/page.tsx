"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  Music,
  Mic2,
  Tent,
  GraduationCap,
  Sparkles,
  HelpCircle,
  ArrowLeft,
  Check,
  Loader2,
} from "lucide-react";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/* ── Types ── */

interface EventTypeOption {
  id: string;
  label: string;
  icon: typeof Music;
}

interface ExperienceOption {
  id: string;
  label: string;
  subtitle: string;
}

const EVENT_TYPES: EventTypeOption[] = [
  { id: "club-nights", label: "Club nights & parties", icon: Music },
  { id: "live-music", label: "Live music & concerts", icon: Mic2 },
  { id: "festivals", label: "Festivals & multi-day", icon: Tent },
  { id: "workshops", label: "Workshops & classes", icon: GraduationCap },
  { id: "pop-ups", label: "Pop-ups & activations", icon: Sparkles },
  { id: "other", label: "Other / I'll decide later", icon: HelpCircle },
];

const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    id: "first-event",
    label: "Planning my first event",
    subtitle: "We'll help you get set up from scratch",
  },
  {
    id: "experienced",
    label: "I've run events before",
    subtitle: "You know the ropes — we'll get you selling fast",
  },
  {
    id: "switching",
    label: "Switching from another platform",
    subtitle: "Welcome aboard — we'll make the transition smooth",
  },
];

/* ── Progress dots ── */

function ProgressIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {[0, 1, 2].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
              step < currentStep
                ? "bg-primary"
                : step === currentStep
                ? "bg-primary shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                : "bg-border"
            }`}
          />
          {step < 2 && (
            <div
              className={`h-[2px] w-10 transition-all duration-300 ${
                step < currentStep ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Step A: Event Types ── */

function StepEventTypes({
  selected,
  onToggle,
  onContinue,
  onSkip,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <h1 className="text-2xl font-bold text-foreground">
        What kind of events will you run?
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Select all that apply. This helps us tailor your experience.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EVENT_TYPES.map((type) => {
          const Icon = type.icon;
          const isSelected = selected.has(type.id);
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onToggle(type.id)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-200 ${
                isSelected
                  ? "border-primary bg-primary/8 text-foreground"
                  : "border-border bg-card hover:border-border/80 hover:bg-card/80 text-foreground/80"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isSelected
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/30 text-muted-foreground"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
              </div>
              <span className="text-[14px] font-medium">{type.label}</span>
              {isSelected && (
                <Check
                  size={16}
                  className="ml-auto shrink-0 text-primary"
                  strokeWidth={2.5}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-xl bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)]"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip this step
        </button>
      </div>
    </div>
  );
}

/* ── Step B: Experience Level ── */

function StepExperience({
  selected,
  onSelect,
  onContinue,
  onSkip,
  onBack,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  onSkip: () => void;
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
        Where are you on your events journey?
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        We'll adjust things based on your experience level.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {EXPERIENCE_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={`rounded-xl border px-5 py-4 text-left transition-all duration-200 ${
                isSelected
                  ? "border-primary bg-primary/8"
                  : "border-border bg-card hover:border-border/80 hover:bg-card/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-[15px] font-semibold text-foreground">
                  {option.label}
                </span>
                {isSelected && (
                  <Check
                    size={16}
                    className="ml-auto shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {option.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-xl bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)]"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip this step
        </button>
      </div>
    </div>
  );
}

/* ── Step C: Brand Name ── */

function StepBrandName({
  brandName,
  onBrandNameChange,
  slug,
  slugAvailable,
  slugChecking,
  onSubmit,
  submitting,
  error,
  onBack,
}: {
  brandName: string;
  onBrandNameChange: (value: string) => void;
  slug: string;
  slugAvailable: boolean | null;
  slugChecking: boolean;
  onSubmit: () => void;
  submitting: boolean;
  error: string;
  onBack: () => void;
}) {
  const isReady = slug.length >= 3 && slugAvailable === true && !submitting;

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
        What should we call your brand?
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        This is what your customers will see. You can always change it later.
      </p>

      {error && (
        <div className="mt-5 rounded-lg border border-destructive/15 bg-destructive/8 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="mt-8">
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Brand name
        </label>
        <input
          type="text"
          placeholder="e.g. Night Shift Events"
          className="h-12 w-full rounded-xl border border-input bg-background/50 px-4 text-[15px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
          value={brandName}
          onChange={(e) => onBrandNameChange(e.target.value)}
          autoFocus
          maxLength={50}
        />

        {/* Slug preview */}
        {slug.length >= 3 && (
          <div className="mt-3 flex items-center gap-2 text-[13px]">
            {slugChecking ? (
              <>
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">
                  {slug}.entry.events
                </span>
              </>
            ) : slugAvailable ? (
              <>
                <Check
                  size={14}
                  className="text-success"
                  strokeWidth={2.5}
                />
                <span className="text-success">{slug}.entry.events</span>
                <span className="text-success/60">— available</span>
              </>
            ) : slugAvailable === false ? (
              <>
                <svg
                  className="h-3.5 w-3.5 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <span className="text-destructive">
                  {slug}.entry.events is taken
                </span>
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-8">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!isReady}
          className="w-full rounded-xl bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Setting up your brand...
            </span>
          ) : (
            "Complete setup"
          )}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONBOARDING WIZARD
   ═══════════════════════════════════════════════════════ */

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0 = event types, 1 = experience, 2 = brand name

  // Step A state
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(
    new Set()
  );

  // Step B state
  const [experienceLevel, setExperienceLevel] = useState<string | null>(null);

  // Step C state
  const [brandName, setBrandName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount check: verify auth and org status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/check-org");
        const data = await res.json();

        if (!data.authenticated) {
          router.replace("/admin/signup/");
          return;
        }

        if (data.has_org) {
          router.replace("/admin/");
          return;
        }

        setLoading(false);

        // Track invite code usage for Google OAuth signups.
        // Email/password signups clear sessionStorage before reaching onboarding,
        // so this only fires for Google OAuth (prevents double-tracking).
        const inviteCode = sessionStorage.getItem("entry_beta_invite");
        if (inviteCode) {
          const supabase = getSupabaseClient();
          const email = supabase
            ? (await supabase.auth.getUser()).data.user?.email
            : undefined;
          fetch("/api/beta/track-usage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: inviteCode, email: email || "" }),
          }).catch(() => {});
          sessionStorage.removeItem("entry_beta_invite");
        }
      } catch {
        router.replace("/admin/signup/");
      }
    })();
  }, [router]);

  // Debounced slug check
  const checkSlug = useCallback((name: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);

    const s = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

    setSlug(s);

    if (s.length < 3) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }

    setSlugChecking(true);
    slugTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-slug?slug=${encodeURIComponent(s)}`
        );
        const data = await res.json();
        setSlugAvailable(data.available === true);
        if (data.slug) setSlug(data.slug);
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 300);
  }, []);

  // Check slug when brand name changes
  useEffect(() => {
    if (step === 2) {
      checkSlug(brandName);
    }
  }, [brandName, step, checkSlug]);

  const handleToggleEventType = (id: string) => {
    setSelectedEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!slug || slug.length < 3 || !slugAvailable || submitting) return;
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/provision-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: brandName.trim(),
          event_types: Array.from(selectedEventTypes),
          experience_level: experienceLevel,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      router.replace("/admin/?welcome=1");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        data-admin
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <span
            className="font-mono text-[36px] font-bold uppercase tracking-[8px] select-none"
            style={{
              background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Entry
          </span>
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-admin
      className="flex min-h-screen items-center justify-center bg-background"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[520px] px-5 py-12">
        {/* Entry wordmark */}
        <div className="mb-4 text-center">
          <span
            className="font-mono text-[36px] font-bold uppercase tracking-[8px] select-none"
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

        {/* Progress indicator */}
        <div className="mb-10">
          <ProgressIndicator currentStep={step} />
        </div>

        {/* Steps */}
        {step === 0 && (
          <StepEventTypes
            selected={selectedEventTypes}
            onToggle={handleToggleEventType}
            onContinue={() => setStep(1)}
            onSkip={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <StepExperience
            selected={experienceLevel}
            onSelect={setExperienceLevel}
            onContinue={() => setStep(2)}
            onSkip={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}

        {step === 2 && (
          <StepBrandName
            brandName={brandName}
            onBrandNameChange={setBrandName}
            slug={slug}
            slugAvailable={slugAvailable}
            slugChecking={slugChecking}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
            onBack={() => setStep(1)}
          />
        )}

        {/* Footer */}
        <p className="mt-10 text-center font-mono text-[10px] text-muted-foreground/40 tracking-wider">
          Powered by Entry
        </p>
      </div>
    </div>
  );
}
