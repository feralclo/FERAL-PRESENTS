"use client";

import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/components/admin/PlaceAutocomplete";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import type { TabProps } from "@/components/admin/event-editor/types";

/**
 * Identity — the answers to "what / when / where", in the order a host
 * actually thinks. First section the canvas opens. Replaces DetailsTab.
 */
export function IdentitySection({ event, updateEvent }: TabProps) {
  const { timezone } = useOrgTimezone();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Event name *</Label>
          <Input
            value={event.name}
            onChange={(e) => updateEvent("name", e.target.value)}
            placeholder="e.g. Summer Solstice"
          />
        </div>
        <div className="space-y-2">
          <Label>URL slug</Label>
          <Input
            value={event.slug}
            onChange={(e) => updateEvent("slug", e.target.value)}
            placeholder="summer-solstice-june-2026"
          />
          <p className="text-[10px] text-muted-foreground/70">
            /event/{event.slug || "your-event"}/
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Short description</Label>
        <Textarea
          value={event.description || ""}
          onChange={(e) => updateEvent("description", e.target.value)}
          placeholder="One paragraph that surfaces in search results and previews."
          rows={3}
        />
        <p className="text-[10px] text-muted-foreground/70">
          Different from the full About text in the Story section — this is
          the meta-description used in search and link previews.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Start *</Label>
          <DateTimePicker
            value={event.date_start || ""}
            onChange={(v) => updateEvent("date_start", v || event.date_start)}
            timezone={timezone}
            showTimezone
          />
        </div>
        <div className="space-y-2">
          <Label>End</Label>
          <DateTimePicker
            value={event.date_end || ""}
            onChange={(v) => updateEvent("date_end", v || null)}
            timezone={timezone}
            showTimezone
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Doors open</Label>
          <DateTimePicker
            value={event.doors_open || ""}
            onChange={(v) => updateEvent("doors_open", v || null)}
            timezone={timezone}
            showTimezone
          />
        </div>
        <div className="space-y-2">
          <Label>Capacity</Label>
          <Input
            type="number"
            value={event.capacity ?? ""}
            onChange={(e) =>
              updateEvent(
                "capacity",
                e.target.value ? Number(e.target.value) : null
              )
            }
            placeholder="e.g. 500"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Venue</Label>
          <PlaceAutocomplete
            value={event.venue_name || ""}
            onChange={(v) => updateEvent("venue_name", v)}
            onPlaceSelected={(p) => {
              updateEvent("venue_name", p.name || event.venue_name || "");
              if (p.address && !event.venue_address)
                updateEvent("venue_address", p.address);
              if (p.city && !event.city) updateEvent("city", p.city);
              if (p.country && !event.country) updateEvent("country", p.country);
            }}
            mode="venue"
            placeholder="e.g. Invisible Wind Factory"
          />
        </div>
        <div className="space-y-2">
          <Label>Venue address</Label>
          <Input
            value={event.venue_address || ""}
            onChange={(e) => updateEvent("venue_address", e.target.value)}
            placeholder="e.g. 3 Regent Rd, Liverpool"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>City</Label>
          <PlaceAutocomplete
            value={event.city || ""}
            onChange={(v) => updateEvent("city", v)}
            onPlaceSelected={(p) => {
              if (p.country && !event.country) updateEvent("country", p.country);
            }}
            mode="city"
            placeholder="e.g. Liverpool"
          />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Input
            value={event.country || ""}
            onChange={(e) => updateEvent("country", e.target.value)}
            placeholder="e.g. UK"
          />
        </div>
        <div className="space-y-2">
          <Label>Age restriction</Label>
          <Input
            value={event.age_restriction || ""}
            onChange={(e) => updateEvent("age_restriction", e.target.value)}
            placeholder="e.g. 18+"
          />
        </div>
      </div>
    </div>
  );
}
