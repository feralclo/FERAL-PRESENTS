"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
          <CardTitle className="text-sm">Event Images</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <ImageUpload
                label="Event Tile"
                value={event.cover_image || ""}
                onChange={(v) => updateEvent("cover_image", v)}
                uploadKey={event.id ? `event_${event.id}_cover` : undefined}
              />
              <p className="text-[10px] text-muted-foreground/60">
                Tile image for event listings / homepage.
              </p>
            </div>
            <div className="space-y-1">
              <ImageUpload
                label="Event Banner"
                value={event.hero_image || ""}
                onChange={(v) => updateEvent("hero_image", v)}
                uploadKey={event.id ? `event_${event.id}_banner` : undefined}
              />
              <p className="text-[10px] text-muted-foreground/60">
                Hero background on the event page.
              </p>
            </div>
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
            <select
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
              value={event.theme || "default"}
              onChange={(e) => {
                updateEvent("theme", e.target.value);
              }}
            >
              <option value="default">Default</option>
              <option value="minimal">Minimal</option>
            </select>
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
