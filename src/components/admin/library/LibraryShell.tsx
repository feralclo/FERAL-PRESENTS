"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { LibraryWorkspace } from "./LibraryWorkspace";
import { CampaignsView } from "./CampaignsView";
import { CampaignDetailView } from "./CampaignDetailView";
import { LibrarySelectionProvider } from "./LibrarySelectionContext";
import { LibrarySelectionBar } from "./LibrarySelectionBar";
import { AdminPageHeader } from "@/components/admin/ui";
import { BulkUploadButton } from "./BulkUploadButton";
import { cn } from "@/lib/utils";
import type { CampaignSummary } from "@/types/library-campaigns";

type Segment = "all" | "campaigns";

/**
 * /admin/library — top-level shell.
 *
 * Mental model: the **library** is the master gallery of every creative
 * the tenant has uploaded — covers, shareables, campaign assets, every
 * kind. **Campaigns** are a layer applied on top, surfaced via a top
 * segmented control + a bulk-action affordance ("Add to campaign") that
 * fires when tiles are selected.
 *
 * URL state:
 *   ?view=campaigns      → render the Campaigns segment
 *   ?campaign=<slug>     → render the detail view for one campaign
 *   (default)            → render the All assets workspace
 *
 * Browse links from the quest editor pool picker land on
 * `?campaign=<slug>` so a host always sees the same surface there.
 */
export function LibraryShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCampaign = searchParams.get("campaign");
  const segmentParam = searchParams.get("view");
  const initialSegment: Segment = segmentParam === "campaigns" ? "campaigns" : "all";

  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState("");

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media/campaigns", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load campaigns");
        setCampaigns([]);
        return;
      }
      setCampaigns(json.data ?? []);
    } catch {
      setError("Network error");
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  // Keep state in sync with the URL — back button restores segment.
  useEffect(() => {
    setSegment(segmentParam === "campaigns" ? "campaigns" : "all");
  }, [segmentParam]);

  const setSegmentUrl = useCallback(
    (next: Segment) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "campaigns") params.set("view", "campaigns");
      else params.delete("view");
      // Clear any active campaign when changing segment.
      params.delete("campaign");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const setActiveCampaign = useCallback(
    (tag: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tag) params.set("campaign", tag);
      else params.delete("campaign");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const activeSummary = useMemo(
    () =>
      activeCampaign && campaigns
        ? campaigns.find((c) => c.tag === activeCampaign) ?? null
        : null,
    [activeCampaign, campaigns]
  );

  const totalAssets = useMemo(
    () =>
      (campaigns ?? []).reduce((acc, c) => acc + c.asset_count, 0),
    [campaigns]
  );

  // When a campaign is active in the URL, render its detail view —
  // overrides the segment so deep-links from the quest editor always
  // land on the right surface.
  if (activeCampaign && activeSummary) {
    return (
      <LibrarySelectionProvider>
        <div className="px-4 py-6 lg:px-8 lg:py-8 pb-24">
          <CampaignDetailView
            campaign={activeSummary}
            onCampaignsChanged={() => void loadCampaigns()}
            onClearActive={() => setActiveCampaign(null)}
          />
        </div>
        <LibrarySelectionBar
          campaigns={campaigns ?? []}
          onCampaignsChanged={() => void loadCampaigns()}
        />
      </LibrarySelectionProvider>
    );
  }

  return (
    <LibrarySelectionProvider>
      <div className="px-4 py-6 lg:px-8 lg:py-8 pb-24 space-y-6">
        <AdminPageHeader
          title="Library"
          subtitle={subtitleFor(segment, campaigns, totalAssets)}
          actions={
            <BulkUploadButton onUploaded={() => void loadCampaigns()} />
          }
        />

        <SegmentedControl
          segment={segment}
          assetsCount={totalAssets}
          campaignsCount={campaigns?.length ?? 0}
          onChange={(next) => {
            setSegment(next);
            setSegmentUrl(next);
          }}
        />

        <div>
          {segment === "all" ? (
            <LibraryWorkspace embedded />
          ) : (
            <CampaignsView
              campaigns={campaigns}
              onSelect={(tag) => {
                setActiveCampaign(tag);
              }}
              onCreated={() => void loadCampaigns()}
            />
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <LibrarySelectionBar
        campaigns={campaigns ?? []}
        onCampaignsChanged={() => void loadCampaigns()}
      />
    </LibrarySelectionProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function subtitleFor(
  segment: Segment,
  campaigns: CampaignSummary[] | null,
  totalAssets: number
): string {
  if (campaigns === null) return "Loading…";
  if (segment === "campaigns") {
    if (campaigns.length === 0)
      return "No campaigns yet — create one to bundle shareables for a quest";
    return `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`;
  }
  if (totalAssets === 0)
    return "Drop your first image and it'll live here";
  return `${totalAssets} asset${totalAssets === 1 ? "" : "s"} · across all kinds`;
}

function SegmentedControl({
  segment,
  assetsCount,
  campaignsCount,
  onChange,
}: {
  segment: Segment;
  assetsCount: number;
  campaignsCount: number;
  onChange: (segment: Segment) => void;
}) {
  return (
    <div className="inline-flex p-1 rounded-lg border border-border/50 bg-card/50">
      <Tab
        active={segment === "all"}
        onClick={() => onChange("all")}
        label="All assets"
        count={assetsCount}
      />
      <Tab
        active={segment === "campaigns"}
        onClick={() => onChange("campaigns")}
        label="Campaigns"
        count={campaignsCount}
      />
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 inline-flex items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground/65 hover:text-foreground"
      )}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span
        className={cn(
          "text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded",
          active ? "bg-primary/15 text-primary" : "bg-foreground/[0.06] text-foreground/55"
        )}
      >
        {count}
      </span>
    </button>
  );
}
