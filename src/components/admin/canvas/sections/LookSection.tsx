"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ImageSlot } from "@/components/admin/canvas/ImageSlot";
import type { TabWithSettingsProps } from "@/components/admin/event-editor/types";

/**
 * Look — what buyers see at a glance. Three image slots with where-it-
 * appears silhouettes, plus the page theme. Replaces DesignTab.
 */
export function LookSection({
  event,
  updateEvent,
  settings,
  updateSetting,
}: TabWithSettingsProps) {
  const isMinimal = event.theme === "minimal";

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <ImageSlot
          label="Cover (clean)"
          hint="Square artwork, no baked-in text. Used in cards, tiles, and the iOS/Android feed."
          shape="square"
          surface="card-tile"
          value={event.cover_image_url || event.cover_image || ""}
          onChange={(v) => {
            // Dual-write: legacy cover_image keeps live web event pages,
            // emails, and wallet passes correct; cover_image_url feeds
            // iOS / Android / web-v2. One upload, every surface stays in sync.
            updateEvent("cover_image", v);
            updateEvent("cover_image_url", v);
          }}
          uploadKey={event.id ? `event_${event.id}_cover` : undefined}
        />
        <ImageSlot
          label="Banner (wide)"
          hint="16:9 hero. Background of the public event page and card-header variant."
          shape="landscape"
          surface="page-hero"
          value={event.banner_image_url || event.hero_image || ""}
          onChange={(v) => {
            updateEvent("hero_image", v);
            updateEvent("banner_image_url", v);
          }}
          uploadKey={event.id ? `event_${event.id}_banner` : undefined}
        />
      </div>

      <ImageSlot
        label="Poster (for Stories)"
        hint="Full poster with text baked in. Only used when reps share to Instagram/TikTok stories. Leave blank to fall back to the cover."
        shape="portrait"
        surface="story-share"
        value={event.poster_image_url || ""}
        onChange={(v) => updateEvent("poster_image_url", v)}
        uploadKey={event.id ? `event_${event.id}_poster` : undefined}
      />

      <div className="border-t border-border/40 pt-5 space-y-4">
        <div className="space-y-2">
          <Label>Page theme</Label>
          <Select
            value={event.theme || "default"}
            onValueChange={(v) => updateEvent("theme", v)}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isMinimal && (
          <div className="space-y-5 pt-2 max-w-md">
            <div className="space-y-2">
              <Label>
                Blur strength ({settings.minimalBlurStrength ?? 4}px)
              </Label>
              <Slider
                min={0}
                max={30}
                step={1}
                value={[(settings.minimalBlurStrength as number) ?? 4]}
                onValueChange={([v]) => updateSetting("minimalBlurStrength", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Static / noise ({settings.minimalStaticStrength ?? 5}%)
              </Label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[(settings.minimalStaticStrength as number) ?? 5]}
                onValueChange={([v]) => updateSetting("minimalStaticStrength", v)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
