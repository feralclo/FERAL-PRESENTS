"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasAnchor } from "./useCanvasSync";

/**
 * One narrative section on the form pane. Replaces the old per-tab card,
 * collapsible via the chevron header, persists its open state in
 * localStorage per-event-per-anchor.
 *
 * Click anywhere on the header → toggles open AND tells the preview pane
 * to scroll/pulse the matching block (one-way sync). Chevron has its own
 * stopPropagation so a power user can collapse without triggering a sync.
 */

interface CanvasSectionProps {
  /** Stable id used for the localStorage key + scroll-sync target. */
  anchor: CanvasAnchor;
  /** Used to namespace the localStorage key per event so different events
   *  can have different open/closed states. */
  eventId: string;
  /** Section title — H2 typography. */
  title: string;
  /** Optional one-line context under the title. */
  subtitle?: string;
  /** When the section is collapsed AND has filled-in content, show a
   *  one-line summary of what's set ("Summer Solstice · 10 May at
   *  Invisible Wind Factory") instead of just the title. Lets a host
   *  scan the editor and see what's done without expanding everything. */
  collapsedSummary?: string;
  /** Completeness pill on the right — `${ok}/${total}`. */
  completeness?: { ok: number; total: number };
  /** Default-open state on first visit. After that localStorage wins. */
  defaultOpen?: boolean;
  /** Called when the user clicks the header. The shell uses this to
   *  trigger the preview pulse + scroll. */
  onActivate?: (anchor: CanvasAnchor) => void;
  /** When true, force this section open and scroll to it. Used for deep-
   *  linking via ?section= on the URL — overrides localStorage so the
   *  host actually lands on what the link promised. */
  deepLinkTarget?: boolean;
  /** When the parent's CanvasSyncApi requests focus on this section,
   *  force it open and scroll. Wired from the Readiness rail so clicking
   *  a rule actually lands on the form fields, not on a closed
   *  accordion. */
  focusRequest?: { anchor: CanvasAnchor; nonce: number } | null;
  children: React.ReactNode;
}

export function CanvasSection({
  anchor,
  eventId,
  title,
  subtitle,
  collapsedSummary,
  completeness,
  defaultOpen = true,
  onActivate,
  deepLinkTarget = false,
  focusRequest = null,
  children,
}: CanvasSectionProps) {
  const storageKey = `entry_canvas_section_${eventId}_${anchor}`;
  const [open, setOpen] = useState(defaultOpen);

  // Hydrate from localStorage. We start in the default state to avoid an
  // SSR/CSR mismatch flicker, then sync on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "1") setOpen(true);
      else if (raw === "0") setOpen(false);
    } catch {
      /* localStorage may be unavailable (Safari private mode) — ignore */
    }
  }, [storageKey]);

  // Deep-link target wins over both localStorage and default. Force open
  // and scroll the section header into view once on mount. We run this
  // *after* the localStorage hydration above by using a separate effect —
  // React serialises effect ordering, so the scroll fires last.
  useEffect(() => {
    if (!deepLinkTarget) return;
    setOpen(true);
    if (typeof window === "undefined") return;
    const id = `canvas-section-${anchor}`;
    const el = document.getElementById(id);
    if (el) {
      // Defer one frame so the section body has time to render after the
      // forced-open state flushes.
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [deepLinkTarget, anchor]);

  const persist = useCallback(
    (next: boolean) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  // Listen for focus requests fired by useCanvasSync.focus (clicking a
  // readiness rule, for instance). Same shape as deepLinkTarget — force
  // open + scroll — but driven by an in-app channel rather than the URL,
  // and re-fires when the nonce ticks even if the anchor didn't change.
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.anchor !== anchor) return;
    setOpen(true);
    persist(true);
    if (typeof window === "undefined") return;
    const id = `canvas-section-${anchor}`;
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    // nonce on focusRequest re-fires the effect for the same anchor.
  }, [focusRequest, anchor, persist]);

  const handleHeaderClick = useCallback(() => {
    onActivate?.(anchor);
  }, [anchor, onActivate]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen((prev) => {
        const next = !prev;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // Completeness chip colour: green when complete, accent when partial,
  // default-grey when empty.
  const completionTone =
    completeness == null
      ? "default"
      : completeness.ok === 0
        ? "default"
        : completeness.ok === completeness.total
          ? "success"
          : "accent";

  return (
    <section
      id={`canvas-section-${anchor}`}
      data-canvas-anchor={anchor}
      className="rounded-xl border border-border/40 bg-card/40 transition-colors"
    >
      <button
        type="button"
        onClick={handleHeaderClick}
        aria-expanded={open}
        aria-controls={`canvas-section-${anchor}-body`}
        className={cn(
          "group flex w-full items-center justify-between gap-3 px-5 py-4 text-left",
          "rounded-xl focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[18px] font-semibold leading-tight text-foreground">
              {title}
            </h2>
            {completeness && (
              <CompletenessPill ok={completeness.ok} total={completeness.total} tone={completionTone} />
            )}
          </div>
          {/* When closed AND we have a real summary string, show it
              instead of the subtitle — gives the host a scan-line of
              what's filled in without expanding. */}
          {!open && collapsedSummary ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {collapsedSummary}
            </p>
          ) : subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/70",
            "hover:bg-foreground/[0.04] hover:text-foreground transition-colors",
            "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          )}
        >
          <ChevronDown
            size={18}
            className={cn(
              "transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
        </button>
      </button>
      <div
        id={`canvas-section-${anchor}-body`}
        role="region"
        aria-labelledby={`canvas-section-${anchor}`}
        hidden={!open}
        className="border-t border-border/30 px-5 py-5"
      >
        {children}
      </div>
    </section>
  );
}

function CompletenessPill({
  ok,
  total,
  tone,
}: {
  ok: number;
  total: number;
  tone: "default" | "accent" | "success";
}) {
  const classes =
    tone === "success"
      ? "border-success/30 bg-success/[0.06] text-success"
      : tone === "accent"
        ? "border-primary/25 bg-primary/[0.06] text-primary"
        : "border-border/60 bg-foreground/[0.04] text-muted-foreground/80";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums leading-tight tracking-[0.04em]",
        classes
      )}
    >
      {ok}/{total}
    </span>
  );
}
