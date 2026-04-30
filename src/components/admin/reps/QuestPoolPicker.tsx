"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { CampaignSummary } from "@/types/library-campaigns";

interface QuestPoolPickerProps {
  mode: "single" | "pool";
  campaignTag: string;
  onModeChange: (mode: "single" | "pool") => void;
  onCampaignChange: (tag: string) => void;
}

/**
 * Pool/single shareable mode toggle for the quest editor's Content tab.
 *
 * - Single: shows the existing single-asset upload below.
 * - Pool: collapses the upload, swaps in a one-line campaign chooser
 *   plus a quiet info card explaining the rotation rule.
 *
 * Mirrors the editorial restraint of the canvas editor — no nested
 * pickers, no per-asset toggles. The campaign list is loaded on mount
 * from /api/admin/media/campaigns. Tenants with zero campaigns see a
 * deep-link to the library to create one.
 */
export function QuestPoolPicker({
  mode,
  campaignTag,
  onModeChange,
  onCampaignChange,
}: QuestPoolPickerProps) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/media/campaigns", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled && res.ok) setCampaigns(json.data ?? []);
        else if (!cancelled) setError(json.error ?? "Failed to load campaigns");
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCampaign =
    campaigns?.find((c) => c.tag === campaignTag) ?? null;

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/60 mb-2">
          Shareables
        </legend>
        <div className="grid grid-cols-1 gap-2">
          <ModeRow
            active={mode === "single"}
            onClick={() => onModeChange("single")}
            title="Single asset"
            hint="The rep posts this one image or video."
          />
          <ModeRow
            active={mode === "pool"}
            onClick={() => onModeChange("pool")}
            title="From a campaign"
            hint="The rep picks from a rotating pool. New uploads bubble to the top."
          />
        </div>
      </fieldset>

      {mode === "pool" && (
        <div className="space-y-3 rounded-lg border border-border/40 bg-card px-4 py-3">
          {campaigns === null ? (
            <p className="text-xs text-foreground/55">Loading campaigns…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-xs text-foreground/70">
              No campaigns yet.{" "}
              <Link
                href="/admin/library"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Create one in the library
                <ExternalLink className="h-3 w-3" />
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground/70">Pull from</span>
              <select
                value={campaignTag}
                onChange={(e) => onCampaignChange(e.target.value)}
                className="h-9 rounded-md border border-border/60 bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
              >
                <option value="">Choose a campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.label}
                  </option>
                ))}
              </select>
              {activeCampaign && (
                <>
                  <span className="text-xs text-foreground/55 tabular-nums">
                    {activeCampaign.asset_count}{" "}
                    {activeCampaign.asset_count === 1 ? "asset" : "assets"}
                  </span>
                  <Link
                    href={`/admin/library?campaign=${encodeURIComponent(activeCampaign.tag)}`}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Browse
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </>
              )}
            </div>
          )}

          {activeCampaign && activeCampaign.asset_count === 0 && (
            <p className="text-xs text-warning">
              This campaign has no assets yet — reps won&apos;t see anything.
            </p>
          )}
          {activeCampaign &&
            activeCampaign.asset_count > 0 &&
            activeCampaign.asset_count < 10 && (
              <p className="text-xs text-foreground/55">
                Reps will see all {activeCampaign.asset_count} assets. Add
                more for variety.
              </p>
            )}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ModeRow({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full text-left rounded-md border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2 " +
        (active
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-border/40 hover:border-border")
      }
      aria-pressed={active}
    >
      <div className="flex items-center gap-2">
        <span
          className={
            "h-3.5 w-3.5 rounded-full border " +
            (active
              ? "border-primary bg-primary"
              : "border-foreground/30 bg-transparent")
          }
        />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <p className="ml-5 mt-0.5 text-xs text-foreground/60">{hint}</p>
    </button>
  );
}
