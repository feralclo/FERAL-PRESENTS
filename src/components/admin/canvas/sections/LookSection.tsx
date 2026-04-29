"use client";

import { ImageSlot } from "@/components/admin/canvas/ImageSlot";
import type { TabWithSettingsProps } from "@/components/admin/event-editor/types";

/**
 * Look — what buyers see at a glance. Three image slots with where-it-
 * appears silhouettes.
 *
 * Theme picker removed from the canvas (2026-04-29 polish pass) — only
 * FERAL events use the legacy "minimal" theme today, and exposing a
 * picker on every event editor adds noise without value. Existing
 * minimal-themed events keep their theme via the stored `event.theme`
 * value; only the UI affordance to switch goes away.
 */
export function LookSection({ event, updateEvent }: TabWithSettingsProps) {
  // settings + updateSetting accepted on the prop type for parent
  // compatibility, but unused — minimal sliders were retired with the
  // theme picker.
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <ImageSlot
          label="Cover (clean)"
          hint="Square artwork, no baked-in text. Used in cards, tiles, and the iOS feed."
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
          hint="16:9 hero. Background of the public event page."
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

      {/* Poster sits in its own row but constrained — full-width 4:5
          made the slot tower over the section. A column-width tile keeps
          the proportion honest and reads as "secondary asset". */}
      <div className="max-w-[280px]">
        <ImageSlot
          label="Story share"
          hint="Full poster with text, dates, and lineup baked in. Only used when reps share to Instagram/TikTok. Falls back to the cover if blank."
          shape="portrait"
          surface="story-share"
          value={event.poster_image_url || ""}
          onChange={(v) => updateEvent("poster_image_url", v)}
          uploadKey={event.id ? `event_${event.id}_poster` : undefined}
        />
      </div>
    </div>
  );
}
