"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewCampaignDialog } from "./NewCampaignDialog";
import type { CampaignSummary } from "@/types/library-campaigns";

interface CampaignChipStripProps {
  campaigns: CampaignSummary[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
  onCampaignsChanged: () => void;
}

/**
 * Mobile equivalent of the rail — a horizontal chip strip with snap
 * scrolling. "+ New" lives inline at the end so creating a campaign
 * doesn't bury the user in modals.
 */
export function CampaignChipStrip({
  campaigns,
  activeTag,
  onSelect,
  onCampaignsChanged,
}: CampaignChipStripProps) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5 snap-x">
          <Chip active={activeTag === null} onClick={() => onSelect(null)}>
            All assets
          </Chip>
          {campaigns.map((c) => (
            <Chip
              key={c.tag}
              active={activeTag === c.tag}
              onClick={() => onSelect(c.tag)}
            >
              {c.label}
              {c.asset_count > 0 ? (
                <span className="ml-1.5 text-foreground/55 tabular-nums">
                  {c.asset_count}
                </span>
              ) : null}
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={cn(
              "shrink-0 snap-start inline-flex items-center gap-1 h-8 px-3 rounded-full",
              "border border-dashed border-border/60 text-foreground/70 hover:text-foreground hover:border-border",
              "text-xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
            )}
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>
      </div>

      <NewCampaignDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => onCampaignsChanged()}
      />
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 snap-start inline-flex items-center h-8 px-3 rounded-full",
        "text-xs font-medium border transition-colors",
        "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
        active
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-transparent border-border/60 text-foreground/70 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
