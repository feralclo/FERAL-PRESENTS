"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ImageIcon, Video, Users } from "lucide-react";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
} from "@/components/admin/ui";
import { CampaignActions } from "./CampaignActions";
import { CampaignLinkedQuests } from "./CampaignLinkedQuests";
import { CampaignTopAssets } from "./CampaignTopAssets";
import { CampaignAssetGrid } from "./CampaignAssetGrid";
import { MicroSparkline } from "@/components/admin/dashboard/MicroSparkline";
import type {
  CampaignStatsResponse,
  CampaignSummary,
} from "@/types/library-campaigns";

interface CampaignDetailViewProps {
  campaign: CampaignSummary;
  onCampaignsChanged: () => void;
  onClearActive: () => void;
}

/**
 * Right-canvas view for one campaign — three blocks above the asset grid:
 *   1. Stat row (assets / quests / weekly downloads + sparkline)
 *   2. Linked quests list (subtle)
 *   3. Top assets (collapsed by default)
 *
 * Below: an asset grid filtered to this campaign. The grid uses the same
 * tenant_media list endpoint as the LibraryWorkspace, scoped via
 * `?group=<tag>` so we get the existing usage-count enrichment for free.
 */
export function CampaignDetailView({
  campaign,
  onCampaignsChanged,
  onClearActive,
}: CampaignDetailViewProps) {
  const [stats, setStats] = useState<CampaignStatsResponse | null>(null);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(
        `/api/admin/media/campaigns/${encodeURIComponent(campaign.tag)}/stats`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load campaign stats");
        return;
      }
      setStats(json);
    } catch {
      setError("Network error");
    }
  }, [campaign.tag]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <div className="space-y-8">
      {/* Header — campaign name + back chevron + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onClearActive}
            className="lg:hidden inline-flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground mb-1"
          >
            <ArrowLeft className="h-3 w-3" />
            All campaigns
          </button>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight truncate">
            {campaign.label}
          </h1>
          <p className="mt-1 text-sm text-foreground/60 tabular-nums">
            {campaign.asset_count} {campaign.asset_count === 1 ? "asset" : "assets"}
            {campaign.linked_quest_count > 0 ? (
              <>
                {" · "}
                {campaign.linked_quest_count}{" "}
                {campaign.linked_quest_count === 1 ? "quest" : "quests"}
              </>
            ) : null}
          </p>
        </div>
        <CampaignActions
          campaign={campaign}
          onChanged={(action) => {
            onCampaignsChanged();
            if (action === "deleted") onClearActive();
          }}
        />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          eyebrow="Assets"
          value={`${campaign.asset_count}`}
          sub={
            campaign.asset_count > 0
              ? `${campaign.image_count} images · ${campaign.video_count} videos`
              : "Drop the first one in"
          }
        />
        <StatTile
          icon={<Users className="h-3.5 w-3.5" />}
          eyebrow="Linked quests"
          value={`${campaign.linked_quest_count}`}
          sub={
            campaign.linked_quest_count === 0
              ? "Not pulling into any quest yet"
              : "Reps see a rotating slice"
          }
        />
        <StatTile
          icon={<Video className="h-3.5 w-3.5" />}
          eyebrow="Downloads · 7 days"
          value={`${stats?.downloads_this_week ?? 0}`}
          sparkline={stats?.downloads_sparkline ?? []}
        />
      </div>

      {/* Linked quests + top assets */}
      <CampaignLinkedQuests
        quests={stats?.linked_quests ?? []}
        loading={stats === null}
        emptyHint={
          campaign.linked_quest_count === 0
            ? "This campaign isn't linked to any quests yet. Reps won't see it."
            : null
        }
      />

      <CampaignTopAssets assets={stats?.top_assets ?? []} />

      {/* The actual grid of assets in this campaign — kept minimal so the
       * stat blocks remain the headline of the page. */}
      <div>
        <h2 className="mb-3 text-[15px] font-semibold text-foreground">
          All assets
        </h2>
        <CampaignAssetGrid
          campaignTag={campaign.tag}
          onChanged={() => {
            void loadStats();
            onCampaignsChanged();
          }}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function StatTile({
  icon,
  eyebrow,
  value,
  sub,
  sparkline,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  sub?: string;
  sparkline?: number[];
}) {
  return (
    <AdminCard>
      <AdminCardContent className="px-5 py-4">
        <div className="flex items-center gap-1.5 text-foreground/60">
          {icon}
          <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em]">
            {eyebrow}
          </span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="text-[24px] font-mono font-bold text-foreground leading-none tracking-tight tabular-nums">
            {value}
          </p>
          {sparkline && sparkline.length > 0 && (
            <MicroSparkline
              data={sparkline}
              width={72}
              height={26}
              variant="bar"
            />
          )}
        </div>
        {sub && (
          <p className="mt-2 text-xs text-foreground/55">{sub}</p>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}

// Re-export AdminButton at the file level so unused-import warnings don't
// trigger when the component is conditionally rendered.
void AdminButton;
