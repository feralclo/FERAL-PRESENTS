"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AdminButton,
  AdminEmptyState,
  AdminSkeleton,
} from "@/components/admin/ui";
import { ImageIcon } from "lucide-react";
import { BulkUploadButton } from "./BulkUploadButton";

interface CampaignAssetGridProps {
  campaignTag: string;
  onChanged: () => void;
}

interface AssetTile {
  id: string;
  url: string;
  mime_type: string | null;
  storage_key: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

/**
 * The asset grid shown inside the campaign canvas. Loads from the
 * existing /api/admin/media list endpoint scoped to `?group=<tag>`,
 * returning the rows already enriched with usage_count for the delete
 * confirm copy.
 *
 * Selection model: click toggles, a sticky bottom bar surfaces bulk
 * actions when ≥1 is selected.
 */
export function CampaignAssetGrid({
  campaignTag,
  onChanged,
}: CampaignAssetGridProps) {
  const [assets, setAssets] = useState<AssetTile[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setSelected(new Set());
    try {
      // The existing list endpoint accepts kind=quest_asset + group=<tag>.
      const params = new URLSearchParams({
        kind: "quest_asset",
        group: campaignTag,
      });
      const res = await fetch(`/api/admin/media?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load assets");
        setAssets([]);
        return;
      }
      setAssets(json.data ?? []);
    } catch {
      setError("Network error");
      setAssets([]);
    }
  }, [campaignTag]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const moveToAllAssets = useCallback(async () => {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/media/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          campaign_tag: null,
        }),
      });
      if (res.ok) {
        await load();
        onChanged();
      }
    } finally {
      setBulkBusy(false);
    }
  }, [selected, load, onChanged]);

  const deleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Remove ${selected.size} ${
          selected.size === 1 ? "asset" : "assets"
        } from your library?`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/admin/media/${id}?force=true`, { method: "DELETE" })
        )
      );
      await load();
      onChanged();
    } finally {
      setBulkBusy(false);
    }
  }, [selected, load, onChanged]);

  if (assets === null) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <AdminSkeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <AdminEmptyState
        icon={<ImageIcon className="h-6 w-6" />}
        title="No assets yet"
        description="Drop in some images or videos and they'll show up here, ready to assign to quests."
        primaryAction={
          <BulkUploadButton
            onUploaded={() => {
              void load();
              onChanged();
            }}
            defaultCampaign={campaignTag}
          />
        }
      />
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {assets.map((a) => {
          const isSelected = selected.has(a.id);
          const isVideo = (a.mime_type ?? "").startsWith("video/");
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleSelect(a.id)}
              className={cn(
                "group relative aspect-square rounded-lg overflow-hidden",
                "border-2 transition-colors focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
                isSelected
                  ? "border-primary"
                  : "border-transparent hover:border-foreground/20"
              )}
              aria-pressed={isSelected}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt=""
                className="h-full w-full object-cover bg-foreground/[0.06]"
              />
              {isVideo && (
                <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-background/70 backdrop-blur-sm flex items-center justify-center">
                  <Play className="h-3 w-3 text-foreground fill-foreground" />
                </div>
              )}
              {isSelected && (
                <div className="absolute top-2 left-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Sticky bottom bulk action bar — slides up when ≥1 is selected. */}
      {selected.size > 0 && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3",
            "bg-background/85 backdrop-blur-md border-t border-border/40",
            "flex items-center justify-between gap-3"
          )}
        >
          <p className="text-sm font-medium text-foreground tabular-nums">
            {selected.size} selected
          </p>
          <div className="flex items-center gap-2">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="outline"
              size="sm"
              loading={bulkBusy}
              onClick={moveToAllAssets}
            >
              Move to All assets
            </AdminButton>
            <AdminButton
              variant="destructive"
              size="sm"
              loading={bulkBusy}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={deleteSelected}
            >
              Delete
            </AdminButton>
          </div>
        </div>
      )}
    </div>
  );
}
