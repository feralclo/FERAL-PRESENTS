"use client";

import { useCallback, useState } from "react";
import { Check, ExternalLink, Globe, Instagram, Loader2 } from "lucide-react";
import { AdminButton } from "@/components/admin/ui/button";
import { cn } from "@/lib/utils";
import type { Event } from "@/types/events";
import type { ReadinessReport } from "@/lib/event-readiness";

/**
 * The Publish moment in the right rail. Replaces the old "Status:"
 * dropdown buried in the Settings tab — Publish becomes the primary,
 * one-button action. The dropdown still exists in the Publish form
 * section for cancelled/archived/past states (the long tail).
 *
 * On success: no confetti, no toast — a focused sheet with the live URL
 * + share-to-Instagram CTA. Premium = restraint.
 */

interface PublishCardProps {
  event: Event;
  report: ReadinessReport;
  /** Sets event.status without triggering a save — the parent's central
   *  Save button still handles persistence. */
  onSetStatus: (status: Event["status"]) => void;
  /** Triggers the parent's central save flow and resolves with success. */
  onSave: () => Promise<boolean>;
}

export function PublishCard({ event, report, onSetStatus, onSave }: PublishCardProps) {
  const [publishing, setPublishing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isLive = event.status === "live";

  const handlePublish = useCallback(async () => {
    if (!report.canPublish || publishing) return;
    setPublishing(true);
    setErrorMsg("");
    try {
      onSetStatus("live");
      // The parent's onSave takes the latest state including the new
      // status. It returns true on success.
      const ok = await onSave();
      if (ok) {
        setShowSuccess(true);
      } else {
        setErrorMsg("Save failed. Check the form and try again.");
        // Roll the local status back so the host doesn't see a stale Live state.
        onSetStatus("draft");
      }
    } catch {
      setErrorMsg("Network error. Check your connection.");
      onSetStatus("draft");
    }
    setPublishing(false);
  }, [report.canPublish, publishing, onSetStatus, onSave]);

  if (showSuccess && isLive) {
    return <LiveSheet event={event} onDismiss={() => setShowSuccess(false)} />;
  }

  if (isLive) {
    return <AlreadyLiveCard event={event} />;
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/70 backdrop-blur-sm">
      <div className="px-4 py-4">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Publish
        </div>
        <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
          {report.canPublish
            ? "Ready when you are."
            : "Almost there."}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {report.canPublish
            ? "Going live makes this event visible to buyers and turns on Stripe checkout."
            : "Resolve the required steps above before publishing."}
        </p>

        <AdminButton
          variant="primary"
          className="mt-3 w-full"
          size="lg"
          disabled={!report.canPublish || publishing}
          onClick={handlePublish}
          leftIcon={
            publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Globe className="h-4 w-4" />
            )
          }
        >
          {publishing ? "Publishing…" : "Publish event"}
        </AdminButton>

        {!report.canPublish && report.blockers.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md border border-warning/20 bg-warning/[0.04] p-2.5">
            {report.blockers.map((b) => (
              <li
                key={b.id}
                className="flex items-start gap-1.5 text-[11px] text-foreground"
              >
                <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>{b.reason || b.label}</span>
              </li>
            ))}
          </ul>
        )}

        {errorMsg && (
          <p className="mt-3 text-[11px] text-destructive">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}

function AlreadyLiveCard({ event }: { event: Event }) {
  const url = `/event/${event.slug}/`;
  return (
    <div className="rounded-xl border border-success/30 bg-success/[0.04]">
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-success">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Live
        </div>
        <h3 className="mt-1 text-[15px] font-semibold leading-tight text-foreground">
          You&apos;re live.
        </h3>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline",
            "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          )}
        >
          Open public page
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}

function LiveSheet({
  event,
  onDismiss,
}: {
  event: Event;
  onDismiss: () => void;
}) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/event/${event.slug}/`
      : `/event/${event.slug}/`;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [url]);

  const instagramShareUrl = `https://www.instagram.com/`;

  return (
    <div className="rounded-xl border border-success/30 bg-card shadow-[0_8px_32px_-12px_rgba(52,211,153,0.25)]">
      <div className="px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
          <Check className="h-5 w-5 text-success" />
        </div>
        <h3 className="mt-3 text-[18px] font-semibold leading-tight text-foreground">
          You&apos;re live.
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {event.name} is now visible to buyers. Share it.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-foreground/[0.04] px-3 py-2">
          <span className="truncate font-mono text-[11px] text-foreground/85">{url}</span>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "shrink-0 rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
              copied ? "text-success border-success/40" : "text-foreground/85 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <AdminButton
            variant="outline"
            size="md"
            asChild
            leftIcon={<ExternalLink className="h-4 w-4" />}
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open page
            </a>
          </AdminButton>
          <AdminButton
            variant="outline"
            size="md"
            asChild
            leftIcon={<Instagram className="h-4 w-4" />}
          >
            <a
              href={instagramShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Instagram"
            >
              Share
            </a>
          </AdminButton>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
