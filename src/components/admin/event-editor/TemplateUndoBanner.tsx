"use client";

import { useEffect, useState } from "react";
import { Sparkles, Undo2, X } from "lucide-react";
import { AdminButton } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/**
 * Toast banner shown after a template is applied. Lets the host undo if
 * the result wasn't what they wanted — without an undo path, they'd have
 * to delete N tickets and a group manually to reverse a single click.
 *
 * Dwell time is 12 seconds. The banner fades out before unmount so the
 * disappearance reads as intentional rather than abrupt.
 *
 * Lives at the bottom of the Tickets section (not a global toast) so the
 * host's eye-line stays inside the surface they just changed.
 */

interface Props {
  /** Copy describing what was added — e.g. "Added 4 tickets from Early-bird waterfall". */
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** Override the default 12s dwell. */
  dwellMs?: number;
}

const DEFAULT_DWELL_MS = 12_000;
const FADE_MS = 200;

export function TemplateUndoBanner({
  message,
  onUndo,
  onDismiss,
  dwellMs = DEFAULT_DWELL_MS,
}: Props) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const startFade = setTimeout(() => setFading(true), dwellMs - FADE_MS);
    const finalDismiss = setTimeout(() => onDismiss(), dwellMs);
    return () => {
      clearTimeout(startFade);
      clearTimeout(finalDismiss);
    };
  }, [dwellMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-opacity",
        fading ? "opacity-0" : "opacity-100"
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-full border border-border/60 bg-card/95 backdrop-blur-sm",
          "px-4 py-2 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.45)]"
        )}
      >
        <Sparkles size={13} className="text-primary/85 shrink-0" />
        <span className="text-xs text-foreground/90">{message}</span>
        <AdminButton
          size="sm"
          variant="ghost"
          leftIcon={<Undo2 />}
          onClick={onUndo}
          className="h-7 px-2 text-primary hover:text-primary"
        >
          Undo
        </AdminButton>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
