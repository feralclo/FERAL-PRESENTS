"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { LibraryWorkspace } from "./LibraryWorkspace";
import { CampaignRail } from "./CampaignRail";
import { CampaignChipStrip } from "./CampaignChipStrip";
import { CampaignDetailView } from "./CampaignDetailView";
import { LibraryEmptyHero } from "./LibraryEmptyHero";
import type { CampaignSummary } from "@/types/library-campaigns";

/**
 * /admin/library — top-level library shell.
 *
 * Two-column workspace on desktop (campaigns rail + canvas), single
 * column with a chip strip on mobile.
 *
 * Active campaign is reflected in the URL via `?campaign=<slug>` so the
 * canvas state is shareable. Absence of the param renders the existing
 * `LibraryWorkspace` as the "All assets" view.
 */
export function LibraryShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCampaign = searchParams.get("campaign");

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

  const setActive = useCallback(
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

  // Library is "completely empty" only if there are no campaigns AND
  // no untagged assets. We approximate by waiting for campaigns to load
  // and then peeking at the All-assets view shape via a HEAD-style call.
  // Cheap heuristic: zero campaigns + zero loaded campaigns + we render
  // the hero. The LibraryWorkspace itself surfaces its own empty state
  // for the "no untagged assets but yes campaigns" case.
  const showHero =
    campaigns !== null &&
    campaigns.length === 0 &&
    !activeCampaign;

  if (campaigns === null) {
    return <LibraryShellSkeleton />;
  }

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8">
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <CampaignRail
            campaigns={campaigns}
            activeTag={activeCampaign}
            onSelect={setActive}
            onCampaignsChanged={() => void loadCampaigns()}
          />
        </aside>

        <div className="lg:hidden mb-4">
          <CampaignChipStrip
            campaigns={campaigns}
            activeTag={activeCampaign}
            onSelect={setActive}
            onCampaignsChanged={() => void loadCampaigns()}
          />
        </div>

        <section className="min-w-0">
          {showHero ? (
            <LibraryEmptyHero onCreated={() => void loadCampaigns()} />
          ) : activeCampaign && activeSummary ? (
            <CampaignDetailView
              campaign={activeSummary}
              onCampaignsChanged={() => void loadCampaigns()}
              onClearActive={() => setActive(null)}
            />
          ) : (
            <LibraryWorkspace embedded />
          )}
          {error ? (
            <p className="mt-4 text-xs text-destructive">{error}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/**
 * Skeleton matching the populated shell so first-paint feels instant
 * rather than empty.
 */
function LibraryShellSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8">
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <div className="hidden lg:block">
          <div className="rounded-xl border border-border/40 bg-card p-3 space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-md bg-foreground/[0.04] animate-pulse"
              />
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="h-9 w-40 rounded-md bg-foreground/[0.04] animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-foreground/[0.04] animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
