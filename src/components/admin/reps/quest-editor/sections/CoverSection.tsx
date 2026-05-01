"use client";

import { useState } from "react";
import { Image as ImageIcon, Library } from "lucide-react";
import { CoverImagePicker } from "@/components/admin/CoverImagePicker";
import type { SectionProps } from "../types";

/**
 * The 3:4 in-app card hero. Reuses `<CoverImagePicker kind="quest_cover">`
 * so the same library + upload pipeline drives every quest cover surface
 * (start-moment template, library page, this editor).
 *
 * When empty: the iOS card falls back to the promoter's accent gradient,
 * so leaving this blank is a valid choice — the section's hint copy
 * surfaces that.
 */
export function CoverSection({ state, onChange }: SectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const cover = state.cover_image_url;

  return (
    <div className="space-y-3">
      {cover ? (
        <div className="flex items-start gap-4">
          <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt="Cover preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">
              Reps see this as the hero of the quest card.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
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
                onClick={() => onChange({ cover_image_url: null })}
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
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick from your library or upload a new one. Leave blank and reps
            see your promoter accent as a gradient.
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="
              inline-flex items-center gap-2 rounded-md
              border border-border/60 bg-card px-3 py-2 text-sm font-medium
              shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]
            "
          >
            <ImageIcon size={14} />
            Pick a cover
          </button>
        </div>
      )}

      <CoverImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={cover ?? ""}
        onChange={(url) => onChange({ cover_image_url: url || null })}
        previewTitle={state.title || "Your quest title"}
        kind="quest_cover"
      />
    </div>
  );
}

/**
 * Extract a short summary of the current cover for the closed-filled
 * chip header. Returns a friendly basename when the URL ends in a
 * recognisable filename; falls back to "set" otherwise.
 */
export function coverChipSummary(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const path = new URL(url, "https://example.com").pathname;
    const last = path.split("/").pop() ?? "";
    const stripped = last.split("?")[0];
    if (/^[0-9a-f-]{20,}\.\w{2,5}$/i.test(stripped)) return "set";
    if (stripped) return stripped;
    return "set";
  } catch {
    return "set";
  }
}
