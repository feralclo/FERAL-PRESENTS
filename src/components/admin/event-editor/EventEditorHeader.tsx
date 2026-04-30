"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventViewTabs } from "@/components/admin/event-overview/EventViewTabs";
import {
  ArrowLeft,
  MoreHorizontal,
  Save,
  Trash2,
  Loader2,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event } from "@/types/events";

const STATUS_VARIANT = {
  draft: "warning",
  live: "success",
  past: "secondary",
  cancelled: "default",
  archived: "secondary",
} as const;

interface EventEditorHeaderProps {
  event: Event;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
  /** Optional — when provided, the overflow menu shows a Duplicate item. */
  onDuplicate?: () => void;
  duplicating?: boolean;
}

/**
 * Editor header — slimmed down to match the overview's design language.
 *
 * Surface (always visible):  Back · Title · Status · View tabs · Save
 * Overflow menu (⋯):         Duplicate · Delete
 *
 * Removed from previous version:
 *   - Inline Preview button (redundant with the EventViewTabs "Public"
 *     tab which already opens /event/[slug] in a new window)
 *   - Slug span (the URL preview already lives in the Identity section,
 *     and the Public tab opens the actual page)
 *   - Inline Delete + Duplicate buttons (rare actions, hidden behind ⋯
 *     so they don't compete with Save for attention)
 *   - Announcement / Queue / Tickets preview split-button (if a host
 *     wants those they can use the Public tab and append ?preview=...)
 *
 * Save stays as the lone primary action — that's the action a host
 * does ten times per session, the rest are once-in-a-blue-moon.
 */
export function EventEditorHeader({
  event,
  saving,
  onSave,
  onDelete,
  onDuplicate,
  duplicating = false,
}: EventEditorHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="space-y-3">
      <Link
        href="/admin/events/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Events
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            {event.name || "Untitled Event"}
          </h1>
          <Badge variant={STATUS_VARIANT[event.status] || "secondary"}>
            {event.status}
          </Badge>
          <EventViewTabs slug={event.slug} active="edit" />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-expanded={menuOpen}
              title="More actions"
              className="px-2"
            >
              <MoreHorizontal size={14} />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-md border border-border bg-card shadow-lg">
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate();
                    }}
                    disabled={duplicating}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors",
                      "hover:bg-muted/60 disabled:opacity-60",
                      "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
                    )}
                  >
                    {duplicating ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Copy size={13} />
                    )}
                    {duplicating ? "Duplicating…" : "Duplicate event"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 border-t border-border/40 px-3 py-2 text-left text-xs text-destructive transition-colors",
                    "hover:bg-destructive/[0.06]",
                    "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-1"
                  )}
                >
                  <Trash2 size={13} />
                  Delete event
                </button>
              </div>
            )}
          </div>

          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
