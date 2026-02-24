"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronDown, ExternalLink, Eye, Ticket, Save, Trash2, Loader2 } from "lucide-react";
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
}

export function EventEditorHeader({
  event,
  saving,
  onSave,
  onDelete,
}: EventEditorHeaderProps) {
  const isAnnouncement =
    event.tickets_live_at && new Date(event.tickets_live_at) > new Date();

  const [previewOpen, setPreviewOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!previewOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPreviewOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [previewOpen]);

  const previewUrl = `/event/${event.slug}/?t=${Date.now()}`;
  const ticketPreviewUrl = `/event/${event.slug}/?t=${Date.now()}&preview=tickets`;

  return (
    <div className="space-y-3">
      <Link
        href="/admin/events/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Events
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            {event.name || "Untitled Event"}
          </h1>
          <Badge
            variant={STATUS_VARIANT[event.status] || "secondary"}
          >
            {event.status}
          </Badge>
          <span className="text-xs text-muted-foreground/60 font-mono">
            /event/{event.slug}/
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 size={14} />
            Delete
          </Button>

          {/* Preview button — split when in announcement mode */}
          {isAnnouncement ? (
            <div className="relative" ref={popoverRef}>
              <div className="flex items-stretch">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="rounded-r-none border-r-0"
                >
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={14} />
                    Preview
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-l-none px-1.5 border-l border-border/50"
                  onClick={() => setPreviewOpen((v) => !v)}
                >
                  <ChevronDown size={12} />
                </Button>
              </div>
              {previewOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-card shadow-lg py-1">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted/50 transition-colors"
                    onClick={() => setPreviewOpen(false)}
                  >
                    <Eye size={13} className="text-muted-foreground shrink-0" />
                    <div>
                      <div className="font-medium">Announcement Page</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">What visitors see now</div>
                    </div>
                  </a>
                  <a
                    href={ticketPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted/50 transition-colors"
                    onClick={() => setPreviewOpen(false)}
                  >
                    <Ticket size={13} className="text-muted-foreground shrink-0" />
                    <div>
                      <div className="font-medium">Ticket Page</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Preview the buying experience</div>
                    </div>
                  </a>
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                Preview
              </a>
            </Button>
          )}

          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
