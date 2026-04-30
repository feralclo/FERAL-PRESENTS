"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReadinessReport, ReadinessRule } from "@/lib/event-readiness";
import type { CanvasAnchor } from "./useCanvasSync";

/**
 * Wizard-style progress strip across the top of the form pane. Replaces
 * the cramped pill-row that shipped earlier. Each cell is roomy enough
 * to read at a glance:
 *
 *   01 · Identity
 *   ready
 *   ▔▔▔▔▔▔▔▔▔ (green underline)
 *
 *   02 · Story
 *   needs description
 *   ▔▔▔▔▔▔▔▔▔ (warning underline)
 *
 * Click any cell → sync.focus(anchor) (already wired to force-open and
 * scroll the matching section). Mobile: horizontal scroll with snap.
 *
 * Shipping principle: tell the host the answer ("needs cover image"),
 * don't make them count check-marks. Same family as the new EditorHero.
 */

interface SectionNavProps {
  report: ReadinessReport;
  onJump: (anchor: CanvasAnchor) => void;
}

interface SectionMeta {
  anchor: CanvasAnchor;
  label: string;
}

const SECTIONS: SectionMeta[] = [
  { anchor: "identity", label: "Identity" },
  { anchor: "story", label: "Story" },
  { anchor: "look", label: "Look" },
  { anchor: "tickets", label: "Tickets" },
  { anchor: "money", label: "Money" },
  { anchor: "publish", label: "Publish" },
];

type SectionMood = "complete" | "needs_required" | "needs_optional" | "empty";

interface SectionStatus {
  mood: SectionMood;
  text: string;
}

/** Same imperative labels EditorHero uses, kept local so the nav stays
 *  self-contained — duplicating ~10 lines is cheaper than coupling. */
const ACTION_LABEL: Partial<Record<ReadinessRule["id"], string>> = {
  date_in_future: "needs date",
  ticket_on_sale: "needs a ticket",
  payment_ready: "connect payments",
  cover_image: "needs cover image",
  description: "needs description",
  lineup: "add lineup",
  seo_title: "add share title",
  doors_time: "add doors time",
  banner_image: "add wide banner",
};

function sectionStatus(
  rules: ReadinessRule[],
  anchor: CanvasAnchor
): SectionStatus {
  const sectionRules = rules.filter((r) => r.anchor === anchor);
  if (sectionRules.length === 0) return { mood: "empty", text: "—" };

  const requiredFails = sectionRules.filter(
    (r) => r.severity === "required" && r.status !== "ok"
  );
  const optionalFails = sectionRules.filter(
    (r) => r.severity !== "required" && r.status !== "ok"
  );

  if (requiredFails.length === 0 && optionalFails.length === 0) {
    return { mood: "complete", text: "ready" };
  }

  if (requiredFails.length > 0) {
    if (requiredFails.length === 1) {
      const r = requiredFails[0];
      return {
        mood: "needs_required",
        text: ACTION_LABEL[r.id] ?? "1 thing left",
      };
    }
    return {
      mood: "needs_required",
      text: `${requiredFails.length} steps`,
    };
  }

  // Only optional nudges left — section is publish-safe.
  if (optionalFails.length === 1) {
    const r = optionalFails[0];
    return {
      mood: "needs_optional",
      text: ACTION_LABEL[r.id] ?? "looks good",
    };
  }
  return {
    mood: "needs_optional",
    text: "looks good",
  };
}

const MOOD_TINT: Record<SectionMood, string> = {
  complete: "border-success/60 text-success",
  needs_required: "border-warning/60 text-warning",
  needs_optional: "border-primary/40 text-primary",
  empty: "border-border/40 text-muted-foreground/60",
};

const MOOD_HOVER: Record<SectionMood, string> = {
  complete: "hover:bg-success/[0.04]",
  needs_required: "hover:bg-warning/[0.04]",
  needs_optional: "hover:bg-primary/[0.04]",
  empty: "hover:bg-foreground/[0.03]",
};

export function SectionNav({ report, onJump }: SectionNavProps) {
  return (
    <nav
      aria-label="Editor sections"
      className={cn(
        "sticky top-0 z-20 -mx-4 mb-4 border-b border-border/40 bg-background/85 px-4 py-2 backdrop-blur-md",
        "sm:-mx-6 sm:px-6",
        "lg:-mx-0 lg:rounded-xl lg:border lg:border-border/40 lg:bg-card/60 lg:px-2 lg:py-2"
      )}
    >
      <ul
        className={cn(
          "flex gap-1 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory",
          "lg:gap-1 lg:overflow-visible lg:snap-none"
        )}
      >
        {SECTIONS.map((section, i) => {
          const status = sectionStatus(report.rules, section.anchor);
          return (
            <li
              key={section.anchor}
              className="min-w-[140px] shrink-0 snap-start lg:flex-1 lg:min-w-0"
            >
              <button
                type="button"
                onClick={() => onJump(section.anchor)}
                aria-label={`Jump to ${section.label} — ${status.text}`}
                className={cn(
                  "group relative flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1",
                  MOOD_HOVER[status.mood]
                )}
              >
                <div className="flex w-full items-center gap-1.5">
                  <span className="font-mono text-[9px] tabular-nums text-muted-foreground/60">
                    0{i + 1}
                  </span>
                  <span className="text-[12px] font-semibold leading-tight text-foreground">
                    {section.label}
                  </span>
                  {status.mood === "complete" && (
                    <Check size={10} className="ml-auto text-success" />
                  )}
                </div>
                <div
                  className={cn(
                    "truncate font-mono text-[10px] uppercase tracking-[0.10em]",
                    status.mood === "complete"
                      ? "text-success/85"
                      : status.mood === "needs_required"
                        ? "text-warning/95"
                        : status.mood === "needs_optional"
                          ? "text-primary/85"
                          : "text-muted-foreground/60"
                  )}
                >
                  {status.text}
                </div>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1 h-0.5 w-full rounded-full border-b-2",
                    MOOD_TINT[status.mood]
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
