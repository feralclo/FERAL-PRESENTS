"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/admin/ImageUpload";
import type { TabWithSettingsProps } from "./types";

export function DesignTab({
  event,
  updateEvent,
  settings,
  updateSetting,
}: TabWithSettingsProps) {
  const isMinimal = event.theme === "minimal";

  return (
    <div className="space-y-6">
      {/* Images */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Event imagery</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <ImageUpload
                label="Cover (clean)"
                value={event.cover_image_url || event.cover_image || ""}
                onChange={(v) => {
                  // Dual-write: legacy cover_image (used by live web event
                  // pages, emails, wallet passes) AND cover_image_url (used
                  // by iOS / Android / web-v2). Keeping both in sync means
                  // tenants only upload once and every surface stays correct.
                  updateEvent("cover_image", v);
                  updateEvent("cover_image_url", v);
                }}
                uploadKey={event.id ? `event_${event.id}_cover` : undefined}
              />
              <p className="text-[10px] text-muted-foreground/60">
                Clean artwork, no baked-in text. Shown in event cards and tiles.
              </p>
            </div>
            <div className="space-y-1">
              <ImageUpload
                label="Banner (landscape)"
                value={event.banner_image_url || event.hero_image || ""}
                onChange={(v) => {
                  // Same dual-write rationale as cover: legacy hero_image
                  // drives the live event page; banner_image_url feeds the
                  // new clients' card headers.
                  updateEvent("hero_image", v);
                  updateEvent("banner_image_url", v);
                }}
                uploadKey={event.id ? `event_${event.id}_banner` : undefined}
              />
              <p className="text-[10px] text-muted-foreground/60">
                Wide 16:9 hero. Used as background on the event page and as header on card variants.
              </p>
            </div>
          </div>

          <div className="space-y-1 max-w-md">
            <ImageUpload
              label="Poster (for Stories)"
              value={event.poster_image_url || ""}
              onChange={(v) => updateEvent("poster_image_url", v)}
              uploadKey={event.id ? `event_${event.id}_poster` : undefined}
            />
            <p className="text-[10px] text-muted-foreground/60">
              Full poster with lineup / date / venue text baked in. Only used when reps share your event to an Instagram or TikTok story — standalone artwork. Leave blank to fall back to the cover.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Theme</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <Label>Page Theme</Label>
            <Select value={event.theme || "default"} onValueChange={(v) => updateEvent("theme", v)}>
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
            <div className="space-y-5 pt-2">
              <div className="space-y-2">
                <Label>
                  Blur Strength ({settings.minimalBlurStrength ?? 4}px)
                </Label>
                <Slider
                  min={0}
                  max={30}
                  step={1}
                  value={[
                    (settings.minimalBlurStrength as number) ?? 4,
                  ]}
                  onValueChange={([v]) =>
                    updateSetting("minimalBlurStrength", v)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Static / Noise ({settings.minimalStaticStrength ?? 5}%)
                </Label>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[
                    (settings.minimalStaticStrength as number) ?? 5,
                  ]}
                  onValueChange={([v]) =>
                    updateSetting("minimalStaticStrength", v)
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
