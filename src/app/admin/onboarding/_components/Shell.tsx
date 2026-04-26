"use client";

import { ReactNode } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import {
  WIZARD_ORDER,
  SECTION_LABEL,
  type OnboardingApi,
} from "../_state";
import type { WizardSection } from "@/types/settings";

interface ShellProps {
  api: OnboardingApi;
  children: ReactNode;
  /** Show the live-preview pane (hidden on Finish for cleanliness). */
  showPreview?: boolean;
  preview?: ReactNode;
}

export function WizardShell({ api, children, showPreview = true, preview }: ShellProps) {
  return (
    <div data-admin className="flex min-h-screen bg-background text-foreground">
      {/* Background glow — matches existing onboarding aesthetic */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      {/* LEFT: form column */}
      <div className="relative z-[1] flex w-full flex-col lg:w-[560px] xl:w-[600px]">
        <Header api={api} />

        <div className="flex-1 overflow-y-auto px-5 pb-10 lg:px-10">
          <div className="mx-auto w-full max-w-[480px]">{children}</div>
        </div>

        <SaveStatus api={api} />
      </div>

      {/* RIGHT: live preview (desktop only — hidden on mobile to keep focus) */}
      {showPreview && (
        <div className="relative z-[1] hidden flex-1 border-l border-white/[0.04] bg-[#080808]/60 lg:block">
          {preview}
        </div>
      )}
    </div>
  );
}

function Header({ api }: { api: OnboardingApi }) {
  return (
    <div className="px-5 pt-8 pb-6 lg:px-10 lg:pt-10">
      <div className="flex items-center justify-between">
        <span
          className="font-mono text-[20px] font-bold uppercase tracking-[6px] select-none"
          style={{
            background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Entry
        </span>

        {api.sectionIndex > 0 && api.current !== "finish" && (
          <button
            type="button"
            onClick={() => {
              const prev = WIZARD_ORDER[api.sectionIndex - 1];
              if (prev) api.goTo(prev);
            }}
            className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={13} />
            Back
          </button>
        )}
      </div>

      <div className="mt-7">
        <ProgressDots api={api} />
      </div>
    </div>
  );
}

function ProgressDots({ api }: { api: OnboardingApi }) {
  const total = WIZARD_ORDER.length;
  const currentLabel = SECTION_LABEL[api.current];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={api.sectionIndex + 1}
      aria-label={`Step ${api.sectionIndex + 1} of ${total}: ${currentLabel}`}
    >
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Step {api.sectionIndex + 1} of {total}
        </span>
        <span className="text-foreground/80">{currentLabel}</span>
      </div>
      <div className="flex items-center gap-1">
        {WIZARD_ORDER.map((section, idx) => {
          const sectionState = api.getSection(section);
          const isCompleted = !!sectionState?.completed_at;
          const isSkipped = sectionState?.skipped === true;
          const isPast = idx < api.sectionIndex || isCompleted || isSkipped;
          const isCurrent = idx === api.sectionIndex;
          return (
            <button
              key={section}
              type="button"
              aria-label={SECTION_LABEL[section]}
              onClick={() => {
                if (idx <= api.sectionIndex || sectionState?.visited_at) api.goTo(section);
              }}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                isCurrent
                  ? "bg-primary shadow-[0_0_10px_rgba(139,92,246,0.4)]"
                  : isPast
                  ? "bg-primary/60"
                  : "bg-white/[0.06] hover:bg-white/[0.1]"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

function SaveStatus({ api }: { api: OnboardingApi }) {
  if (!api.saving && !api.saveError) return null;
  return (
    <div className="px-5 py-3 lg:px-10">
      {api.saving ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <Loader2 size={11} className="animate-spin" />
          Saving…
        </div>
      ) : api.saveError ? (
        <div className="text-[11px] text-destructive">Couldn't save: {api.saveError}</div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Reusable section primitives — keep section files lean
   ───────────────────────────────────────────────────────────────────── */

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-7">
      {eyebrow && (
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </div>
      )}
      <h1 className="text-[26px] font-bold leading-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-2 text-[14px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function SectionFooter({
  primaryLabel = "Continue",
  primaryDisabled,
  primaryLoading,
  onPrimary,
  skipLabel,
  onSkip,
  hint,
}: {
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onPrimary: () => void;
  skipLabel?: string;
  onSkip?: () => void;
  hint?: string;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      {hint && <p className="text-[12px] text-muted-foreground/70">{hint}</p>}
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryLoading}
        className="w-full rounded-xl bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_1px_12px_rgba(139,92,246,0.25)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_1px_20px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {primaryLoading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Working…
          </span>
        ) : (
          primaryLabel
        )}
      </button>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {skipLabel ?? "Skip for now"}
        </button>
      )}
    </div>
  );
}

export function SectionField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-foreground">{label}</label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

/** Tiny shared helper: a soft-bordered hint card (e.g., for VAT/Stripe info). */
export function HintCard({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-3 text-[12px] leading-relaxed text-muted-foreground/80">
      {children}
    </div>
  );
}

export function isSection(api: OnboardingApi, section: WizardSection): boolean {
  return api.current === section;
}
