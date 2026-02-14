"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Save, Trash2, Loader2 } from "lucide-react";
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
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a
              href={`/event/${event.slug}/?t=${Date.now()}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} />
              Preview
            </a>
          </Button>
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
