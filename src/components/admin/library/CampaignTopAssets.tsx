"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampaignTopAsset } from "@/types/library-campaigns";

interface CampaignTopAssetsProps {
  assets: CampaignTopAsset[];
}

/**
 * Top-5 most-downloaded assets in the campaign. Collapsible (closed by
 * default) — most hosts won't care, but the few who do appreciate the
 * "which creative is working" insight without leaving the page.
 */
export function CampaignTopAssets({ assets }: CampaignTopAssetsProps) {
  const [open, setOpen] = useState(false);
  if (assets.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[15px] font-semibold text-foreground hover:text-foreground/80"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Top assets
        <span className="ml-1 text-xs font-normal text-foreground/55">
          most-downloaded
        </span>
      </button>

      {open && (
        <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {assets.map((a) => (
            <li
              key={a.media_id}
              className="rounded-lg overflow-hidden border border-border/40 bg-card"
            >
              <div className="relative aspect-square bg-foreground/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.thumbnail_url ?? a.url}
                  alt=""
                  className={cn(
                    "h-full w-full object-cover",
                    a.media_kind === "video" && "opacity-90"
                  )}
                />
                {a.media_kind === "video" && (
                  <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-background/70 backdrop-blur-sm flex items-center justify-center">
                    <Play className="h-3 w-3 text-foreground fill-foreground" />
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[11px] font-mono text-foreground/60 tabular-nums">
                  {a.download_count}{" "}
                  {a.download_count === 1 ? "download" : "downloads"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
