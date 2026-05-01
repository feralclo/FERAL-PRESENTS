"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { AdminPanel } from "@/components/admin/ui";

/**
 * Canonical "+ Add X" chip + expanded section pattern. Every optional
 * field in the redesigned editor lives behind one of these.
 *
 * Three visual states:
 *
 * 1. **Closed + empty** — compact chip with a dashed border and a
 *    `+ Add label` affordance. Reads as "tap to add".
 * 2. **Closed + filled** — solid card chip with the label, a dot, and
 *    a short summary (e.g. "cover.webp"), plus an X clear icon and a
 *    chevron-down to expand. Reads as "you've set this; tap to edit".
 * 3. **Open** — header with a chevron-up + the label + optional Clear,
 *    body containing the section content inside an `AdminPanel` (the
 *    heavier-surface variant per `docs/admin-ux-design.md`).
 *
 * `onClear` (when supplied) nulls the section's data — the form's
 * patcher should set every field this section owns back to its empty
 * default. Removing closes the section AND clears the data so the host
 * can iterate without surprise.
 */
export interface QuestChipProps {
  /** Sentence-case label, e.g. "Cover image". */
  label: string;
  /** Lucide icon rendered to the left of the label. */
  icon?: ReactNode;
  /** Does this section have content? Drives the closed-empty / closed-filled split. */
  filled: boolean;
  /** Compact summary shown when closed and filled — e.g. "cover.webp" or "1 completion · expires Sat 5 May". */
  summary?: string;
  /** Is the section expanded? */
  open: boolean;
  /** Toggle expanded/collapsed. */
  onToggle: () => void;
  /** Optional clear handler — appears as an X next to the label when filled. */
  onClear?: () => void;
  /** The section's expanded content; rendered when `open`. */
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
  if (open) return <OpenChip label={label} onToggle={onToggle} onClear={onClear} filled={filled}>{children}</OpenChip>;
  if (filled) return <ClosedFilledChip label={label} icon={icon} summary={summary} onToggle={onToggle} onClear={onClear} />;
  return <ClosedEmptyChip label={label} icon={icon} onToggle={onToggle} />;
}

function ClosedEmptyChip({
  label,
  icon,
  onToggle,
}: {
  label: string;
  icon?: ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="
        flex w-full items-center gap-2 rounded-lg
        border border-dashed border-border/50 bg-transparent
        px-4 py-2.5 text-sm text-muted-foreground
        transition-colors
        hover:border-primary/40 hover:bg-primary/[0.03] hover:text-foreground
        focus-visible:border-primary focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-primary/30
      "
    >
      <Plus size={14} strokeWidth={2} className="shrink-0" />
      {icon ? <span className="text-muted-foreground/80">{icon}</span> : null}
      <span className="font-medium">{label}</span>
    </button>
  );
}

function ClosedFilledChip({
  label,
  icon,
  summary,
  onToggle,
  onClear,
}: {
  label: string;
  icon?: ReactNode;
  summary?: string;
  onToggle: () => void;
  onClear?: () => void;
}) {
  return (
    <div
      className="
        flex w-full items-center gap-3 rounded-lg
        border border-border/60 bg-card px-4 py-2.5 text-sm shadow-sm
        transition-colors hover:border-border
      "
    >
      <button
        type="button"
        onClick={onToggle}
        className="
          flex flex-1 items-center gap-2 text-left
          focus-visible:outline-none
        "
        aria-expanded={false}
      >
        {icon ? <span className="shrink-0 text-primary">{icon}</span> : null}
        <span className="font-medium text-foreground">{label}</span>
        {summary ? (
          <>
            <span className="text-border" aria-hidden="true">·</span>
            <span className="truncate text-xs text-muted-foreground">
              {summary}
            </span>
          </>
        ) : null}
      </button>
      <div className="flex items-center gap-1">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="
              rounded p-1 text-muted-foreground
              transition-colors
              hover:bg-foreground/[0.04] hover:text-foreground
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
            "
            aria-label={`Clear ${label}`}
          >
            <X size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="
            rounded p-1 text-muted-foreground
            transition-colors
            hover:bg-foreground/[0.04] hover:text-foreground
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
          "
          aria-label={`Edit ${label}`}
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

function OpenChip({
  label,
  onToggle,
  onClear,
  filled,
  children,
}: {
  label: string;
  onToggle: () => void;
  onClear?: () => void;
  filled: boolean;
  children: ReactNode;
}) {
  return (
    <AdminPanel className="space-y-4 p-5">
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="
            -ml-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5
            text-sm font-medium text-foreground
            transition-colors hover:text-primary
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
          "
          aria-expanded={true}
        >
          <ChevronUp size={14} />
          {label}
        </button>
        {filled && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="
              text-xs text-muted-foreground
              transition-colors hover:text-destructive
              focus-visible:outline-none
            "
          >
            Clear
          </button>
        ) : null}
      </header>
      <div>{children}</div>
    </AdminPanel>
  );
}
