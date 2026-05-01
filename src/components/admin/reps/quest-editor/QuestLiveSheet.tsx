"use client";

import { useCallback, useState } from "react";
import { Check, ExternalLink, Smartphone } from "lucide-react";
import type { RepQuest } from "@/types/reps";

/**
 * Success sheet shown after a quest publishes. Mirrors the event editor's
 * "You're live" pattern (`canvas/EditorHero.LiveSheet`) — green
 * confirmation, the share URL with a copy button, and a row of next-step
 * links. Compact; replaces the form area entirely until dismissed.
 */
export interface QuestLiveSheetProps {
  quest: RepQuest;
  /** Dismisses the sheet — host returns to the editor (or the orchestrator
   *  closes the editor entirely; either is fine). */
  onDismiss: () => void;
}

export function QuestLiveSheet({ quest, onDismiss }: QuestLiveSheetProps) {
  const shareUrl = useShareUrl(quest);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — silent */
    }
  }, [shareUrl]);

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-success/30 bg-card shadow-[0_8px_32px_-12px_rgba(52,211,153,0.25)]">
        <div className="px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
            <Check className="h-5 w-5 text-success" />
          </div>
          <h3 className="mt-4 text-[18px] font-semibold leading-tight text-foreground">
            You&rsquo;re live.
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {quest.title} is visible to reps in the app. Share the link to send them straight to it.
          </p>

          {shareUrl ? (
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-border/60 bg-foreground/[0.04] px-3 py-2">
              <span className="truncate font-mono text-[11px] text-foreground/85">
                {shareUrl}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className={[
                  "shrink-0 rounded-md border border-border/60 bg-background px-2 py-1",
                  "font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
                  copied
                    ? "border-success/40 text-success"
                    : "text-foreground/85 hover:text-foreground",
                ].join(" ")}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {shareUrl ? (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  inline-flex items-center justify-center gap-2 rounded-md
                  border border-border/60 bg-card px-3 py-2 text-xs font-medium
                  shadow-sm transition-colors hover:border-border
                "
              >
                <ExternalLink size={12} />
                Open link
              </a>
            ) : null}
            <a
              href="https://apps.apple.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex items-center justify-center gap-2 rounded-md
                border border-border/60 bg-card px-3 py-2 text-xs font-medium
                shadow-sm transition-colors hover:border-border
              "
            >
              <Smartphone size={12} />
              View on iOS
            </a>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="mt-5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Build a friendly share URL. Backend already cascades quest.share_url
 * through `buildQuestShareUrl()` on save — read it directly when present;
 * fall back to a slug-derived URL only if the row predates the cascade.
 */
function useShareUrl(quest: RepQuest): string | null {
  const direct = (quest as { share_url?: string | null }).share_url;
  if (direct) return direct;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/quests/${quest.id}`;
  }
  return null;
}
