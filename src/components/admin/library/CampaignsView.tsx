"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Plus, Layers } from "lucide-react";
import {
  AdminButton,
  AdminEmptyState,
  AdminSkeleton,
} from "@/components/admin/ui";
import { NewCampaignDialog } from "./NewCampaignDialog";
import { cn } from "@/lib/utils";
import type { CampaignSummary } from "@/types/library-campaigns";

interface CampaignsViewProps {
  campaigns: CampaignSummary[] | null;
  onSelect: (tag: string) => void;
  onCreated: () => void;
}

/**
 * The "Campaigns" segment — a list of horizontal hero cards, one per
 * campaign. Each card surfaces the campaign label, asset count, linked
 * quest count, and a thumbnail strip preview. Clicking enters the
 * detail view (CampaignDetailView, via URL state in the parent).
 *
 * This is the SECONDARY view; the library's default is "All assets".
 * Tenants who think in campaigns end up here naturally; those who don't
 * never have to come.
 */
export function CampaignsView({
  campaigns,
  onSelect,
  onCreated,
}: CampaignsViewProps) {
  const [creating, setCreating] = useState(false);

  if (campaigns === null) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <AdminSkeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <>
        <AdminEmptyState
          icon={<Layers className="h-6 w-6" />}
          title="No campaigns yet"
          description="Group assets into a campaign so a quest can pull from a rotating pool — perfect for ongoing pushes where reps post different content every day."
          primaryAction={
            <AdminButton
              variant="primary"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreating(true)}
            >
              New campaign
            </AdminButton>
          }
        />
        <NewCampaignDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={() => {
            onCreated();
            setCreating(false);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <AdminButton
          variant="outline"
          size="sm"
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setCreating(true)}
        >
          New campaign
        </AdminButton>
      </div>

      <ul className="space-y-3">
        {campaigns.map((c) => (
          <li key={c.tag}>
            <CampaignHeroCard campaign={c} onClick={() => onSelect(c.tag)} />
          </li>
        ))}
      </ul>

      <NewCampaignDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          onCreated();
          setCreating(false);
        }}
      />
    </>
  );
}

/** One campaign as a horizontal hero — name + count + thumbnail strip. */
function CampaignHeroCard({
  campaign,
  onClick,
}: {
  campaign: CampaignSummary;
  onClick: () => void;
}) {
  const thumbs = useThumbnailStrip(campaign.tag, campaign.asset_count);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-xl border border-border/40 bg-card",
        "transition-colors duration-200 hover:border-primary/30",
        "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
        "p-4 sm:p-5 block"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground truncate">
            {campaign.label}
          </h3>
          <p className="mt-0.5 text-xs text-foreground/60 tabular-nums">
            {campaign.asset_count}{" "}
            {campaign.asset_count === 1 ? "asset" : "assets"}
            {campaign.image_count > 0 || campaign.video_count > 0 ? (
              <>
                {" · "}
                {campaign.image_count} images · {campaign.video_count} videos
              </>
            ) : null}
            {campaign.linked_quest_count > 0 ? (
              <>
                {" · "}
                {campaign.linked_quest_count}{" "}
                {campaign.linked_quest_count === 1 ? "quest" : "quests"} pulling
              </>
            ) : null}
          </p>
        </div>
        <div className="text-foreground/40 group-hover:text-primary inline-flex items-center gap-1 text-xs font-medium shrink-0 transition-colors">
          View
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>

      {campaign.asset_count > 0 ? (
        <div className="flex gap-2 overflow-hidden">
          {thumbs.length === 0
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square w-20 sm:w-24 rounded-md bg-foreground/[0.04] animate-pulse shrink-0"
                />
              ))
            : thumbs.map((url, i) => (
                <div
                  key={i}
                  className="relative aspect-square w-20 sm:w-24 rounded-md overflow-hidden bg-foreground/[0.06] shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
          {campaign.asset_count > thumbs.length && thumbs.length > 0 && (
            <div className="aspect-square w-20 sm:w-24 rounded-md bg-foreground/[0.04] flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-foreground/60 tabular-nums">
                + {campaign.asset_count - thumbs.length}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/40 px-3 py-4 text-xs text-foreground/55 text-center">
          No assets yet — drop some in.
        </div>
      )}
    </button>
  );
}

/**
 * Lazy thumbnail fetcher — reuses /api/admin/media filtered to the
 * campaign's tag (the existing list endpoint that ships usage_count
 * and ordered rows). 5 tiles, image+video both surface their thumbnails
 * already (Mux thumbnails are server-resolved when the row was inserted).
 */
function useThumbnailStrip(tag: string, assetCount: number): string[] {
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    if (assetCount === 0) {
      setThumbs([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/media?kind=quest_asset&group=${encodeURIComponent(tag)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (cancelled || !res.ok) return;
        setThumbs(
          (json.data ?? []).slice(0, 5).map((r: { url: string }) => r.url)
        );
      } catch {
        // Leave thumbs empty — card still renders with skeleton tiles.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tag, assetCount]);
  return thumbs;
}
