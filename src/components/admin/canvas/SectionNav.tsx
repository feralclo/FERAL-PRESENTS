"use client";

import { Check, AlertTriangle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReadinessReport } from "@/lib/event-readiness";
import type { CanvasAnchor } from "./useCanvasSync";

/**
 * Sticky horizontal section navigator that sits above the form pane in
 * the editor. Six pills, one per canvas section, each carrying a tiny
 * status icon: green check when every rule on that section is ok,
 * yellow warn when there's at least one warn or fail (recommended),
 * red dot when there's a publish-blocking required rule failing.
 *
 * Click any pill → calls onJump, which the editor wires to sync.focus
 * (force-opens + scrolls the form section, pulses the preview block).
 *
 * Why this exists: the canvas form is six narrative sections in one long
 * scroll. Great for first-create. Painful for editing a live event where
 * the host knows exactly which section they want. Tabs would lose the
 * scroll-narrative; this nav keeps both — tap to jump, scroll to read.
 *
 * Sticky placement: above the form pane, NOT page-level. The preview
 * pane has its own sticky scroll, so a page-level sticky would cover
 * the editor header on scroll. We attach to the form column only.
 */

interface SectionNavProps {
  report: ReadinessReport;
  onJump: (anchor: CanvasAnchor) => void;
}

interface SectionMeta {
  anchor: CanvasAnchor;
  label: string;
  /** Two-letter shorthand shown on tight mobile widths. */
  short: string;
}

const SECTIONS: SectionMeta[] = [
  { anchor: "identity", label: "Identity", short: "ID" },
  { anchor: "story", label: "Story", short: "ST" },
  { anchor: "look", label: "Look", short: "LK" },
  { anchor: "tickets", label: "Tickets", short: "TK" },
  { anchor: "money", label: "Money", short: "$$" },
  { anchor: "publish", label: "Publish", short: "PB" },
];

type SectionStatus = "complete" | "warning" | "blocking" | "empty";

function statusForSection(
  anchor: CanvasAnchor,
  report: ReadinessReport
): SectionStatus {
  const rules = report.rules.filter((r) => r.anchor === anchor);
  if (rules.length === 0) return "empty";

  // Required + failing → blocking publish.
  const blocking = rules.some(
    (r) => r.severity === "required" && r.status !== "ok"
  );
  if (blocking) return "blocking";

  // Anything not ok at all → warning (recommended/nice-to-have not done).
  const anyWarn = rules.some((r) => r.status !== "ok");
  if (anyWarn) return "warning";

  return "complete";
}

export function SectionNav({ report, onJump }: SectionNavProps) {
  return (
    <nav
      aria-label="Editor sections"
      className={cn(
        "sticky top-0 z-20 -mx-4 mb-4 border-b border-border/40 bg-background/85 px-4 pb-2 pt-3 backdrop-blur-md",
        "sm:-mx-6 sm:px-6",
        "lg:-mx-0 lg:rounded-xl lg:border lg:border-border/40 lg:bg-card/60 lg:px-3 lg:py-2"
      )}
    >
      <ul className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-wrap lg:overflow-visible">
        {SECTIONS.map((section, i) => {
          const status = statusForSection(section.anchor, report);
          return (
            <li key={section.anchor} className="shrink-0">
              <button
                type="button"
                onClick={() => onJump(section.anchor)}
                aria-label={`Jump to ${section.label}`}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1",
                  "hover:bg-foreground/[0.04]"
                )}
              >
                <span className="font-mono text-[9px] tabular-nums text-muted-foreground/50">
                  0{i + 1}
                </span>
                <span className="text-foreground/85 group-hover:text-foreground">
                  {section.label}
                </span>
                <StatusDot status={status} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StatusDot({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return (
      <Check
        size={11}
        className="text-success"
        aria-label="Section complete"
      />
    );
  }
  if (status === "blocking") {
    return (
      <span
        className="relative inline-flex h-1.5 w-1.5"
        aria-label="Required step incomplete"
      >
        <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60 motion-safe:animate-ping motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
      </span>
    );
  }
  if (status === "warning") {
    return (
      <AlertTriangle
        size={11}
        className="text-warning"
        aria-label="Recommended step incomplete"
      />
    );
  }
  return (
    <Circle
      size={9}
      className="text-muted-foreground/40"
      aria-label="Section empty"
    />
  );
}
