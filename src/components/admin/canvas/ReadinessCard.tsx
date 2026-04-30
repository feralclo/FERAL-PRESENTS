"use client";

import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ReadinessReport,
  ReadinessRule,
  ReadinessSeverity,
} from "@/lib/event-readiness";
import type { CanvasAnchor } from "./useCanvasSync";

/**
 * Readiness rail — sticky pill in the right column above the publish card.
 * Score climbs in real time as the form fills in. Each rule clicks
 * through to its owning section (the readiness anchor matches the
 * canvas-section id, so we can scroll-to-it cleanly).
 */

interface ReadinessCardProps {
  report: ReadinessReport;
  onJumpToSection: (anchor: CanvasAnchor) => void;
}

export function ReadinessCard({ report, onJumpToSection }: ReadinessCardProps) {
  const tone =
    report.score >= 100 ? "success" : report.score >= 60 ? "primary" : "default";

  const ringColour =
    tone === "success"
      ? "stroke-success"
      : tone === "primary"
        ? "stroke-primary"
        : "stroke-foreground/40";

  const labelColour =
    tone === "success"
      ? "text-success"
      : tone === "primary"
        ? "text-primary"
        : "text-foreground/70";

  // Stroke-dashoffset progress ring
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, report.score)) / 100);

  return (
    <div className="rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          className="shrink-0"
          aria-hidden="true"
        >
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            strokeWidth="3"
            className="stroke-foreground/10"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 28 28)"
            className={cn(ringColour, "transition-all duration-500 ease-out")}
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Readiness
          </div>
          <div
            className={cn(
              "font-mono text-[22px] font-bold leading-none tabular-nums",
              labelColour
            )}
          >
            {report.score}%
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {report.canPublish
              ? "Ready to publish"
              : `${report.blockers.length} required ${report.blockers.length === 1 ? "step" : "steps"} left`}
          </div>
        </div>
      </div>

      <RuleGroups report={report} onJumpToSection={onJumpToSection} />
    </div>
  );
}

const GROUP_LABEL: Record<ReadinessSeverity, string> = {
  required: "Required to publish",
  recommended: "Recommended",
  nice_to_have: "Nice to have",
};

/**
 * Group rules by severity so a host scanning the rail can tell at a
 * glance which items are publish-blocking vs nudge-only. Empty groups
 * render nothing — every event has at least one Required rule, so the
 * top group is always visible, but Recommended/Nice-to-have collapse
 * when irrelevant.
 */
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
    <div className="border-t border-border/40">
      {order.map((sev) => {
        const rules = grouped[sev];
        if (rules.length === 0) return null;
        return (
          <div
            key={sev}
            className="border-b border-border/30 px-2 py-2 last:border-b-0"
          >
            <div className="px-2 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
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
    rule.status === "ok"
      ? Check
      : rule.status === "warn"
        ? AlertTriangle
        : X;

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
          "group flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
          "hover:bg-foreground/[0.03]",
          "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
        )}
      >
        <Icon size={14} className={cn("mt-0.5 shrink-0", iconColour)} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[12px] leading-tight",
              rule.status === "ok" ? "text-foreground/65 line-through decoration-foreground/30" : "text-foreground"
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
      </button>
    </li>
  );
}
