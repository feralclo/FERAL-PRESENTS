"use client";

import { useState } from "react";
import { Image as ImageIcon, Library } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CoverImagePicker } from "@/components/admin/CoverImagePicker";
import { QuestPoolPicker } from "@/components/admin/reps/QuestPoolPicker";
import type { SectionProps } from "../types";

/**
 * What reps post — single asset OR pool of assets pulled from a campaign.
 *
 * - Pool path: `QuestPoolPicker` owns the segmented toggle, the campaign
 *   drop-zone, and the rich preview card. We just thread state.
 * - Single path: a thin library-driven picker (`CoverImagePicker` with
 *   kind="quest_content"). Most shareables are static images; video
 *   support arrives via Mux in a later polish phase.
 *
 * "Use cover as the shareable too" — when a cover is set in single
 * mode, the host can mirror it to the shareable in one tap. The legacy
 * editor surfaced this and saved a noticeable amount of double-uploading.
 */
export function ShareableSection({ state, onChange }: SectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const onModeChange = (mode: "single" | "pool") => {
    // Reset the inactive-mode field so editing one path doesn't leave
    // stale data in the other.
    if (mode === "single") {
      onChange({ asset_mode: "single", asset_campaign_tag: null });
    } else {
      onChange({ asset_mode: "pool", asset_url: null });
    }
  };

  return (
    <div className="space-y-4">
      <QuestPoolPicker
        mode={state.asset_mode}
        campaignTag={state.asset_campaign_tag ?? ""}
        onModeChange={onModeChange}
        onCampaignChange={(tag) =>
          onChange({ asset_campaign_tag: tag || null })
        }
        questTitle={state.title}
      />

      {state.asset_mode === "single" ? (
        <SingleAsset
          state={state}
          onChange={onChange}
          openPicker={() => setPickerOpen(true)}
        />
      ) : null}

      <CoverImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={state.asset_url ?? ""}
        onChange={(url) => onChange({ asset_url: url || null })}
        previewTitle={state.title || "Your quest title"}
        kind="quest_content"
        previewAspect="9/16"
      />
    </div>
  );
}

interface SingleAssetProps {
  state: SectionProps["state"];
  onChange: SectionProps["onChange"];
  openPicker: () => void;
}

function SingleAsset({ state, onChange, openPicker }: SingleAssetProps) {
  const url = state.asset_url;
  const cover = state.cover_image_url;
  const usingCoverAsShareable = !!cover && url === cover;

  return (
    <div className="space-y-3">
      {cover ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-card px-3 py-2.5 shadow-sm">
          <div className="flex min-w-0 items-start gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                Use the cover image as the shareable
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Same image, both surfaces. Saves uploading twice when one image works for both.
              </p>
            </div>
          </div>
          <Switch
            checked={usingCoverAsShareable}
            onCheckedChange={(on) => {
              if (on) onChange({ asset_url: cover });
              else if (usingCoverAsShareable) onChange({ asset_url: null });
            }}
          />
        </div>
      ) : null}

      {url ? (
        <div className="flex items-start gap-4">
          <div className="relative h-32 w-20 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Shareable preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">
              Reps download this and post it to their TikTok or Instagram with their personal discount link.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openPicker}
                className="
                  inline-flex items-center gap-1.5 rounded-md
                  border border-border/60 bg-card px-3 py-1.5 text-xs font-medium
                  shadow-sm transition-colors hover:border-border
                "
              >
                <Library size={12} />
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange({ asset_url: null })}
                className="
                  text-xs text-muted-foreground
                  transition-colors hover:text-destructive
                "
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="
            inline-flex items-center gap-2 rounded-md
            border border-border/60 bg-card px-3 py-2 text-sm font-medium
            shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]
          "
        >
          <ImageIcon size={14} />
          Pick a shareable
        </button>
      )}
    </div>
  );
}

/**
 * Closed-chip summary text. Pool mode shows the campaign tag; single
 * mode says "set" when there's an asset URL. Empty otherwise.
 */
export function shareableChipSummary(
  asset_mode: "single" | "pool",
  asset_url: string | null,
  asset_campaign_tag: string | null
): string | undefined {
  if (asset_mode === "pool") {
    return asset_campaign_tag ? `campaign · ${asset_campaign_tag}` : "campaign";
  }
  return asset_url ? "set" : undefined;
}

export function isShareableFilled(
  asset_mode: "single" | "pool",
  asset_url: string | null,
  asset_campaign_tag: string | null
): boolean {
  if (asset_mode === "pool") return !!asset_campaign_tag;
  return !!asset_url;
}
