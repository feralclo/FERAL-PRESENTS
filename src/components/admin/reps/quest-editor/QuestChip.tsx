"use client";

import { ChevronDown, X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Canonical "+ Add X" chip + expanded section pattern. Every optional
 * field in the redesigned editor lives behind one of these.
 *
 * Phase 1.4 fills in the visual states (closed-empty / closed-filled /
 * open). For now the chip is a thin wrapper around its children so other
 * sections can be wired up against the contract.
 */
export interface QuestChipProps {
  /** "Cover image", "Walkthrough", "Reference link" — sentence case. */
  label: string;
  /** Lucide icon rendered to the left of the label. */
  icon?: ReactNode;
  /** Does this section have content (drives closed-filled summary)? */
  filled: boolean;
  /** Compact summary to show when closed and filled — e.g. "cover.webp". */
  summary?: string;
  /** Is the section expanded? */
  open: boolean;
  /** Toggle expanded/collapsed. */
  onToggle: () => void;
  /** Optional clear handler — appears as an X next to the label when filled. */
  onClear?: () => void;
  /** The section's content; rendered when `open` is true. */
  children: ReactNode;
}

export function QuestChip({
  label,
  icon,
  filled,
  summary,
  open,
  onToggle,
  onClear,
  children,
}: QuestChipProps) {
  // Phase 1.1 stub — minimal layout. Phase 1.4 replaces with the real
  // closed-empty / closed-filled / open visual states defined in the plan.
  return (
    <div className="rounded-lg border border-border/40 bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm"
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className={filled ? "font-medium" : "text-muted-foreground"}>
            {filled ? label : `+ ${label}`}
          </span>
          {filled && summary ? (
            <span className="text-xs text-muted-foreground">· {summary}</span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          {filled && onClear ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Clear ${label}`}
            >
              <X size={14} />
            </span>
          ) : null}
          <ChevronDown
            size={14}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div className="border-t border-border/40 px-5 py-4">{children}</div>
      ) : null}
    </div>
  );
}
