"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two-pane canvas layout. Form pane on the left, sticky preview rail on
 * the right above `lg`. Below `lg`: form fills the page and a floating
 * "Preview" pill bottom-right opens a full-screen sheet (Phase 3.7).
 *
 * Why a custom shell: the editor needs the preview to *always* feel
 * pinned next to the form, so the host sees their changes land in the
 * frame. shadcn's Sheet on its own pulls the preview into a modal that
 * closes on form interaction — wrong shape for desktop.
 */

interface CanvasShellProps {
  /** Header — sits above both panes, full-width. */
  header: React.ReactNode;
  /** Optional save / status banner above the panes. */
  banner?: React.ReactNode;
  /** Form column — narrative sections render here. */
  form: React.ReactNode;
  /** Preview column — phone-frame preview + readiness + publish card. */
  preview: React.ReactNode;
}

export function CanvasShell({ header, banner, form, preview }: CanvasShellProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  // Close mobile preview sheet on Escape.
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  // Lock body scroll when the mobile sheet is open.
  useEffect(() => {
    if (!previewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [previewOpen]);

  return (
    <div className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        {header}
        {banner && <div className="mt-3">{banner}</div>}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Form pane — workspace */}
          <div className="space-y-5 lg:order-1">{form}</div>

          {/* Preview pane — desktop sticky stage; hidden < lg */}
          <aside className="hidden lg:order-2 lg:block">
            <div className="sticky top-6 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
                {preview}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile preview pill */}
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        aria-label="Open preview"
        className={cn(
          "fixed bottom-4 right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full border border-primary/30 bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_12px_28px_-10px_rgba(139,92,246,0.55)]",
          "lg:hidden",
          "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
        )}
      >
        <Eye size={16} />
        Preview
      </button>

      {/* Mobile preview sheet */}
      {previewOpen && (
        <PreviewSheet onClose={() => setPreviewOpen(false)}>{preview}</PreviewSheet>
      )}
    </div>
  );
}

function PreviewSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-2xl border-t border-border/60 bg-card",
          "shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.5)]",
          "animate-in slide-in-from-bottom-8 duration-300"
        )}
      >
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Live preview
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[calc(92vh-49px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
