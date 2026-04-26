"use client";

import { ReactNode, useEffect, useState } from "react";
import { Loader2, ArrowLeft, Smartphone, X } from "lucide-react";
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
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // Close the mobile overlay automatically when the user changes step (so
  // they see the new section's heading right away, not the preview from
  // the previous step).
  useEffect(() => {
    setMobilePreviewOpen(false);
  }, [api.current]);

  // Lock body scroll while the mobile overlay is open so the underlying
  // wizard column doesn't scroll behind it.
  useEffect(() => {
    if (!mobilePreviewOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobilePreviewOpen]);

  return (
    <div data-admin className="flex min-h-screen bg-background text-foreground">
      <div className="relative z-[1] flex w-full flex-col lg:w-[560px] xl:w-[600px]">
        <Header api={api} />

        <div className="flex-1 overflow-y-auto px-5 pb-10 lg:px-10">
          <div className="mx-auto w-full max-w-[480px] space-y-6">
            <div
              key={api.current}
              className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
            >
              {children}
            </div>
          </div>
        </div>

        <SaveStatus api={api} />
      </div>

      {showPreview && (
        <>
          {/* Desktop preview rail */}
          <div className="relative z-[1] hidden flex-1 border-l border-border/60 bg-card/30 lg:block">
            <div className="h-full animate-in fade-in-0 duration-500">{preview}</div>
          </div>

          {/* Mobile floating "preview" button */}
          <button
            type="button"
            onClick={() => setMobilePreviewOpen(true)}
            className="fixed bottom-5 right-5 z-30 inline-flex h-11 items-center gap-2 rounded-full border border-primary/30 bg-card px-4 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-primary shadow-lg shadow-black/40 backdrop-blur transition-all hover:border-primary/50 hover:bg-primary/5 lg:hidden"
            aria-label="Show live preview"
          >
            <Smartphone size={13} />
            Preview
          </button>

          {/* Mobile preview overlay */}
          {mobilePreviewOpen && (
            <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md lg:hidden animate-in fade-in-0 duration-200">
              <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Live preview
                </span>
                <button
                  type="button"
                  onClick={() => setMobilePreviewOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  aria-label="Close preview"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{preview}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Header({ api }: { api: OnboardingApi }) {
  const showBack = api.sectionIndex > 0 && api.current !== "finish";
  return (
    <div className="px-5 pt-8 pb-6 lg:px-10 lg:pt-10">
      <div className="flex items-center justify-between">
        <span className="text-gradient font-mono text-[20px] font-bold uppercase tracking-[6px] select-none">
          Entry
        </span>

        {showBack && (
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

      {api.current !== "finish" && (
        <div className="mt-8">
          <ProgressDots api={api} />
        </div>
      )}
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
      className="space-y-2.5"
    >
      <div className="flex items-center gap-1.5">
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
              className={`h-1 flex-1 rounded-full transition-all ${
                isCurrent
                  ? "bg-primary glow-primary"
                  : isPast
                  ? "bg-primary/55"
                  : "bg-border hover:bg-muted"
              }`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/80">
        <span className="h-1 w-1 rounded-full bg-primary" />
        {currentLabel}
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
      <h1 className="font-mono text-[28px] font-bold leading-[1.1] tracking-tight text-foreground">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

export function SectionFooter({
  primaryLabel = "Continue",
  primaryLoadingLabel = "Working…",
  primaryDisabled,
  primaryLoading,
  onPrimary,
  skipLabel,
  onSkip,
  hint,
}: {
  primaryLabel?: string;
  /** Optional override for the loading-state label (defaults to "Working…"). */
  primaryLoadingLabel?: string;
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
            {primaryLoadingLabel}
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
  label: ReactNode;
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
