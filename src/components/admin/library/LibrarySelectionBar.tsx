"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AdminButton } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { slugifyCampaignLabel } from "@/lib/library/campaign-tag";
import { useLibrarySelection } from "./LibrarySelectionContext";
import type { CampaignSummary } from "@/types/library-campaigns";

interface LibrarySelectionBarProps {
  campaigns: CampaignSummary[];
  onCampaignsChanged: () => void;
}

/**
 * Floating action bar that pins to the bottom of the viewport whenever
 * ≥1 tile is selected. Replaces the per-tile "Use this image for…"
 * categories popover — the selection-then-action pattern is more
 * discoverable, scales to bulk, and matches what an admin who has used
 * Photos / Lightroom / Figma will already know.
 *
 * Actions:
 *   Add to campaign ▾ — popover with existing list + "+ New campaign"
 *                       inline. One click adds; no dialog ceremony.
 *   Delete            — confirmation, then DELETE per tile.
 *
 * Bar uses backdrop-blur for legibility over the grid scroll, but the
 * bar itself is opaque-card (admin language) — no glass.
 */
export function LibrarySelectionBar({
  campaigns,
  onCampaignsChanged,
}: LibrarySelectionBarProps) {
  const { count, selectedIds, clear } = useLibrarySelection();
  const [busy, setBusy] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const visible = count > 0;

  const addToCampaign = useCallback(
    async (tag: string) => {
      if (!tag) return;
      setBusy(true);
      try {
        const res = await fetch("/api/admin/media/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: Array.from(selectedIds),
            campaign_tag: tag,
          }),
        });
        if (res.ok) {
          onCampaignsChanged();
          clear();
          setPopoverOpen(false);
        }
      } finally {
        setBusy(false);
      }
    },
    [selectedIds, onCampaignsChanged, clear]
  );

  const deleteSelected = useCallback(async () => {
    if (count === 0) return;
    if (
      !window.confirm(
        `Remove ${count} ${count === 1 ? "asset" : "assets"} from your library?`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin/media/${id}?force=true`, { method: "DELETE" })
        )
      );
      onCampaignsChanged();
      clear();
    } finally {
      setBusy(false);
    }
  }, [count, selectedIds, onCampaignsChanged, clear]);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 px-3 sm:px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3",
        "pointer-events-none transition-transform duration-300 ease-out",
        visible ? "translate-y-0" : "translate-y-full"
      )}
      aria-hidden={!visible}
    >
      <div className="mx-auto max-w-3xl">
        <div className="pointer-events-auto rounded-xl border border-border/60 bg-card shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.45)] px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {count} selected
            </p>
            <button
              type="button"
              onClick={clear}
              className="text-xs text-foreground/55 hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <AdminButton
                  variant="primary"
                  size="sm"
                  leftIcon={<Layers className="h-3.5 w-3.5" />}
                  loading={busy && popoverOpen}
                  disabled={busy}
                >
                  Add to campaign
                </AdminButton>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[280px] p-0 overflow-hidden"
                data-admin
              >
                <CampaignChooser
                  campaigns={campaigns}
                  busy={busy}
                  onPick={(tag) => void addToCampaign(tag)}
                  onCreate={async (label) => {
                    const slug = slugifyCampaignLabel(label);
                    if (!slug) return;
                    // Reserve via the campaigns POST endpoint, then add.
                    setBusy(true);
                    try {
                      const res = await fetch("/api/admin/media/campaigns", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ label }),
                      });
                      if (res.ok) {
                        const json = await res.json();
                        await addToCampaign(json.data.tag);
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>

            <AdminButton
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={deleteSelected}
              disabled={busy}
            >
              Delete
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignChooser({
  campaigns,
  busy,
  onPick,
  onCreate,
}: {
  campaigns: CampaignSummary[];
  busy: boolean;
  onPick: (tag: string) => void;
  onCreate: (label: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  if (creating) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && !busy) onCreate(draft.trim());
        }}
        className="p-3 space-y-2"
      >
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/60">
          New campaign
        </p>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Only Numbers — Spring 26"
          maxLength={80}
          className="w-full h-9 rounded-md border border-border/60 bg-background px-2.5 text-sm text-foreground placeholder:text-foreground/40 focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
        />
        <div className="flex justify-end gap-2 pt-1">
          <AdminButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setCreating(false);
              setDraft("");
            }}
          >
            Back
          </AdminButton>
          <AdminButton
            type="submit"
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!draft.trim() || busy}
          >
            Create + add
          </AdminButton>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="max-h-64 overflow-y-auto py-1">
        {campaigns.length === 0 ? (
          <p className="px-3 py-3 text-xs text-foreground/55">
            No campaigns yet.
          </p>
        ) : (
          <ul>
            {campaigns.map((c) => (
              <li key={c.tag}>
                <button
                  type="button"
                  onClick={() => onPick(c.tag)}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none transition-colors flex items-center justify-between gap-3"
                >
                  <span className="text-sm font-medium text-foreground truncate">
                    {c.label}
                  </span>
                  <span className="text-xs text-foreground/55 tabular-nums shrink-0">
                    {c.asset_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border/40">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/[0.04] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New campaign
        </button>
      </div>
    </>
  );
}
