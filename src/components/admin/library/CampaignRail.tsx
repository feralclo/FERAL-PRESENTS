"use client";

import { useState } from "react";
import { Plus, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/ui";
import { NewCampaignDialog } from "./NewCampaignDialog";
import type { CampaignSummary } from "@/types/library-campaigns";

interface CampaignRailProps {
  campaigns: CampaignSummary[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
  onCampaignsChanged: () => void;
}

/**
 * Desktop left rail listing every campaign. "All assets" is the default
 * pinned row at the top; "+ New campaign" lives at the bottom.
 *
 * Active row uses the canonical primary-tint accent
 * (`bg-primary/[0.06] border-l-2 border-primary`) — the only accent on
 * the page so the eye locks onto it without competing colour signals.
 */
export function CampaignRail({
  campaigns,
  activeTag,
  onSelect,
  onCampaignsChanged,
}: CampaignRailProps) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-border/40 bg-card p-3">
        <p className="px-2 mb-2 text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-foreground/60">
          Campaigns
        </p>
        <ul className="space-y-0.5">
          <RailItem
            isActive={activeTag === null}
            onClick={() => onSelect(null)}
          >
            <Layers className="h-3.5 w-3.5 text-foreground/50 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                All assets
              </p>
              <p className="text-xs text-foreground/55 tabular-nums">
                {campaigns.reduce((acc, c) => acc + c.asset_count, 0)} total
              </p>
            </div>
          </RailItem>

          {campaigns.length > 0 && (
            <li className="my-1.5">
              <div className="h-px bg-border/40 mx-2" />
            </li>
          )}

          {campaigns.map((c) => (
            <RailItem
              key={c.tag}
              isActive={activeTag === c.tag}
              onClick={() => onSelect(c.tag)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {c.label}
                </p>
                <p className="text-xs text-foreground/55 tabular-nums">
                  {c.asset_count} {c.asset_count === 1 ? "asset" : "assets"}
                  {c.linked_quest_count > 0
                    ? ` · ${c.linked_quest_count} ${c.linked_quest_count === 1 ? "quest" : "quests"}`
                    : ""}
                </p>
              </div>
            </RailItem>
          ))}
        </ul>
        <div className="mt-2 pt-2 border-t border-border/40">
          <AdminButton
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreating(true)}
          >
            New campaign
          </AdminButton>
        </div>
      </div>

      <NewCampaignDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(tag) => {
          onCampaignsChanged();
          // Auto-select the freshly-made campaign so the host can drop
          // assets into it immediately.
          // setActive lives one level up; the caller refreshes.
          void tag;
        }}
      />
    </>
  );
}

function RailItem({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left",
          "transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2",
          isActive
            ? "bg-primary/[0.06] border-l-2 border-primary pl-1.5"
            : "hover:bg-foreground/[0.03]"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {children}
      </button>
    </li>
  );
}
