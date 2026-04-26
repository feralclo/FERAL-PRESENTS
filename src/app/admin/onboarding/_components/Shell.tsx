"use client";

import { ReactNode } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
      <div className="relative z-[1] flex w-full flex-col lg:w-[560px] xl:w-[600px]">
        <Header api={api} />

        <div className="flex-1 overflow-y-auto px-5 pb-10 lg:px-10">
          <div className="mx-auto w-full max-w-[480px] space-y-6">{children}</div>
        </div>

        <SaveStatus api={api} />
      </div>

      {showPreview && (
        <div className="relative z-[1] hidden flex-1 border-l border-border/60 bg-card/30 lg:block">
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
        <span className="text-gradient font-mono text-[20px] font-bold uppercase tracking-[6px] select-none">
          Entry
        </span>

        {api.sectionIndex > 0 && api.current !== "finish" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const prev = WIZARD_ORDER[api.sectionIndex - 1];
              if (prev) api.goTo(prev);
            }}
          >
            <ArrowLeft size={13} />
            Back
          </Button>
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
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Step {api.sectionIndex + 1} of {total}
        </span>
        <span className="text-[12px] font-medium text-foreground">{currentLabel}</span>
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
                  ? "bg-primary glow-primary"
                  : isPast
                  ? "bg-primary/60"
                  : "bg-border hover:bg-muted"
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={11} className="animate-spin" />
          Saving…
        </div>
      ) : api.saveError ? (
        <div className="text-xs text-destructive">Couldn&apos;t save: {api.saveError}</div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Reusable section primitives — match the admin design language
   (Card + CardHeader + CardContent, shadcn Button, Label)
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
    <div>
      {eyebrow && (
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[2px] text-primary">
          {eyebrow}
        </div>
      )}
      <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
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
    <div className="flex flex-col gap-3">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Button
        size="lg"
        className="w-full"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryLoading}
      >
        {primaryLoading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Working…
          </span>
        ) : (
          primaryLabel
        )}
      </Button>
      {onSkip && (
        <Button variant="ghost" size="sm" onClick={onSkip}>
          {skipLabel ?? "Skip for now"}
        </Button>
      )}
    </div>
  );
}

export function SectionField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

/** Inline hint — info / context callout matching admin's primary-tinted hint pattern. */
export function HintCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

export function isSection(api: OnboardingApi, section: WizardSection): boolean {
  return api.current === section;
}
