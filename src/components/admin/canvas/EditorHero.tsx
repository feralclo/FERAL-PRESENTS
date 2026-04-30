"use client";

import { useCallback, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Loader2,
  Sparkles,
  Instagram,
  X,
  AlertTriangle,
} from "lucide-react";
import { AdminButton } from "@/components/admin/ui/button";
import { cn } from "@/lib/utils";
import { summariseEditor } from "@/lib/editor-summary";
import type { EditorSummaryMood } from "@/lib/editor-summary";
import type {
  ReadinessReport,
  ReadinessRule,
  ReadinessSeverity,
} from "@/lib/event-readiness";
import type { Event } from "@/types/events";
import type { CanvasAnchor } from "./useCanvasSync";

/**
 * The right-rail hero for the editor. Replaces the old ReadinessCard +
 * PublishCard pair with one card that mirrors the overview hero's
 * design language: sparkle icon, big plain-English headline, sub-line,
 * mood-tinted ring + tint, and one concrete action.
 *
 * - Live event           → "You're live" success card with copy + share
 * - Ready to publish     → "Ready to publish" + Publish button
 * - 1-2 blockers         → "1 step from going live" + jump-to-blocker CTA
 * - 3+ blockers (early)  → "Let's get this set up" + jump-to-first-step CTA
 *
 * Detailed rule list lives behind a "see all checks" disclosure, kept
 * but quieter — visible if the host wants to know what's left, hidden
 * by default so it doesn't compete with the headline.
 */

interface EditorHeroProps {
  event: Event;
  report: ReadinessReport;
  /** Set event.status — parent's central save flushes the change. */
  onSetStatus: (status: Event["status"]) => void;
  /** Triggers the parent's save flow; resolves true on success. */
  onSave: () => Promise<boolean>;
  /** Jumps a section open + scrolls into view (force-open mechanism
   *  already wired into useCanvasSync.focus). */
  onJumpToSection: (anchor: CanvasAnchor) => void;
}

const MOOD_TONE: Record<
  EditorSummaryMood,
  { ring: string; tint: string; iconClass: string }
> = {
  live: {
    ring: "border-success/40",
    tint: "bg-success/[0.06]",
    iconClass: "text-success",
  },
  ready: {
    ring: "border-success/30",
    tint: "bg-success/[0.04]",
    iconClass: "text-success",
  },
  in_progress: {
    ring: "border-primary/25",
    tint: "bg-primary/[0.04]",
    iconClass: "text-primary",
  },
  early: {
    ring: "border-warning/25",
    tint: "bg-warning/[0.04]",
    iconClass: "text-warning",
  },
};

export function EditorHero({
  event,
  report,
  onSetStatus,
  onSave,
  onJumpToSection,
}: EditorHeroProps) {
  const summary = summariseEditor(report, event.status);
  const tone = MOOD_TONE[summary.mood];

  const [publishing, setPublishing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAllChecks, setShowAllChecks] = useState(false);

  const handlePublish = useCallback(async () => {
    if (!report.canPublish || publishing) return;
    setPublishing(true);
    setErrorMsg("");
    try {
      onSetStatus("live");
      const ok = await onSave();
      if (ok) {
        setShowSuccess(true);
      } else {
        setErrorMsg("Save failed. Check the form and try again.");
        onSetStatus("draft");
      }
    } catch {
      setErrorMsg("Network error. Check your connection.");
      onSetStatus("draft");
    }
    setPublishing(false);
  }, [report.canPublish, publishing, onSetStatus, onSave]);

  // Live success sheet (post-Publish click)
  if (showSuccess && event.status === "live") {
    return <LiveSheet event={event} onDismiss={() => setShowSuccess(false)} />;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-5 backdrop-blur-sm transition-colors",
        tone.ring,
        tone.tint
      )}
    >
      {/* Headline + subline + sparkle */}
      <div className="flex items-start gap-3">
        <Sparkles size={16} className={cn("mt-0.5 shrink-0", tone.iconClass)} />
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold leading-tight text-foreground">
            {summary.headline}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {summary.subline}
          </p>
        </div>
      </div>

      {/* Action area */}
      {event.status === "live" ? (
        <div className="mt-4">
          <a
            href={`/event/${event.slug}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          >
            Open public page
            <ExternalLink size={12} />
          </a>
        </div>
      ) : report.canPublish ? (
        <AdminButton
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          disabled={publishing}
          onClick={handlePublish}
          leftIcon={
            publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Globe className="h-4 w-4" />
            )
          }
        >
          {publishing ? "Publishing…" : "Publish event"}
        </AdminButton>
      ) : summary.nextStep ? (
        <AdminButton
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          onClick={() => onJumpToSection(summary.nextStep!.rule.anchor)}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          {summary.nextStep.actionLabel}
        </AdminButton>
      ) : null}

      {errorMsg && (
        <p className="mt-3 text-[11px] text-destructive">{errorMsg}</p>
      )}

      {/* Progress bar — quiet, just a thin reassurance */}
      {event.status !== "live" && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">
              Setup
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/85">
              {summary.score}%
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
            <div
              className={cn(
                "h-full transition-all duration-500",
                summary.mood === "ready"
                  ? "bg-success"
                  : summary.mood === "in_progress"
                    ? "bg-primary"
                    : "bg-warning/85"
              )}
              style={{ width: `${Math.min(100, summary.score)}%` }}
            />
          </div>
        </div>
      )}

      {/* All checks disclosure — only when there's something to show */}
      {report.rules.length > 0 && event.status !== "live" && (
        <>
          <button
            type="button"
            onClick={() => setShowAllChecks((v) => !v)}
            aria-expanded={showAllChecks}
            className={cn(
              "mt-4 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70",
              "hover:text-foreground transition-colors",
              "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
            )}
          >
            <ChevronDown
              size={11}
              className={cn(
                "transition-transform",
                showAllChecks ? "rotate-0" : "-rotate-90"
              )}
            />
            {showAllChecks ? "Hide checks" : "See all checks"}
          </button>
          {showAllChecks && (
            <RuleGroups
              report={report}
              onJumpToSection={onJumpToSection}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ── Detailed rule list (kept from old ReadinessCard, but quieter) ─── */

const GROUP_LABEL: Record<ReadinessSeverity, string> = {
  required: "Required to publish",
  recommended: "Recommended",
  nice_to_have: "Nice to have",
};

function RuleGroups({
  report,
  onJumpToSection,
}: {
  report: ReadinessReport;
  onJumpToSection: (anchor: CanvasAnchor) => void;
}) {
  const grouped: Record<ReadinessSeverity, ReadinessRule[]> = {
    required: [],
    recommended: [],
    nice_to_have: [],
  };
  for (const rule of report.rules) grouped[rule.severity].push(rule);
  const order: ReadinessSeverity[] = ["required", "recommended", "nice_to_have"];

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      {order.map((sev) => {
        const rules = grouped[sev];
        if (rules.length === 0) return null;
        return (
          <div key={sev} className="border-b border-border/20 py-2 last:border-b-0">
            <div className="px-1 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              {GROUP_LABEL[sev]}
            </div>
            <ul className="space-y-1">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onClick={() => onJumpToSection(rule.anchor)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RuleRow({
  rule,
  onClick,
}: {
  rule: ReadinessRule;
  onClick: () => void;
}) {
  const Icon =
    rule.status === "ok" ? Check : rule.status === "warn" ? AlertTriangle : X;
  const iconColour =
    rule.status === "ok"
      ? "text-success"
      : rule.status === "warn"
        ? "text-warning"
        : rule.severity === "required"
          ? "text-destructive"
          : "text-muted-foreground/60";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors",
          "hover:bg-foreground/[0.03]",
          "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
        )}
      >
        <Icon size={13} className={cn("mt-0.5 shrink-0", iconColour)} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[11px] leading-tight",
              rule.status === "ok"
                ? "text-foreground/65 line-through decoration-foreground/30"
                : "text-foreground"
            )}
          >
            {rule.label}
          </div>
          {rule.reason && (
            <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground/70">
              {rule.reason}
            </div>
          )}
        </div>
        <ChevronRight
          size={12}
          className="mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-foreground/70"
        />
      </button>
    </li>
  );
}

/* ── Live success sheet (post-Publish click) ───────────────────────── */

function LiveSheet({
  event,
  onDismiss,
}: {
  event: Event;
  onDismiss: () => void;
}) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/event/${event.slug}/`
      : `/event/${event.slug}/`;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — silent */
    }
  }, [url]);

  return (
    <div className="rounded-2xl border border-success/30 bg-card shadow-[0_8px_32px_-12px_rgba(52,211,153,0.25)]">
      <div className="px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
          <Check className="h-5 w-5 text-success" />
        </div>
        <h3 className="mt-3 text-[18px] font-semibold leading-tight text-foreground">
          You&rsquo;re live.
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {event.name} is visible to buyers. Share it.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-foreground/[0.04] px-3 py-2">
          <span className="truncate font-mono text-[11px] text-foreground/85">
            {url}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "shrink-0 rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
              copied
                ? "text-success border-success/40"
                : "text-foreground/85 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <AdminButton
            variant="outline"
            size="md"
            asChild
            leftIcon={<ExternalLink className="h-4 w-4" />}
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open page
            </a>
          </AdminButton>
          <AdminButton
            variant="outline"
            size="md"
            asChild
            leftIcon={<Instagram className="h-4 w-4" />}
          >
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Instagram"
            >
              Share
            </a>
          </AdminButton>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
