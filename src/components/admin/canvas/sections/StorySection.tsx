"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArtistLineupEditor } from "@/components/admin/ArtistLineupEditor";
import type { TabProps } from "@/components/admin/event-editor/types";
import type { EventArtist } from "@/types/artists";

interface StorySectionProps extends TabProps {
  eventArtists: EventArtist[];
  onEventArtistsChange: (eventArtists: EventArtist[]) => void;
}

/**
 * Story — the narrative your buyers read. Hero blurb, full About,
 * lineup, fine-print details. Replaces ContentTab.
 */
export function StorySection({
  event,
  updateEvent,
  eventArtists,
  onEventArtistsChange,
}: StorySectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tag line</Label>
          <Input
            value={event.tag_line || ""}
            onChange={(e) => updateEvent("tag_line", e.target.value)}
            placeholder="e.g. SECOND RELEASE NOW ACTIVE"
          />
          <p className="text-[10px] text-muted-foreground/70">
            One line shown above the hero. Italic, editorial.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Doors / runtime</Label>
          <Input
            value={event.doors_time || ""}
            onChange={(e) => updateEvent("doors_time", e.target.value)}
            placeholder="e.g. 9:30PM — 4:00AM"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Display string shown under the date. Free-form.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>About</Label>
        <Textarea
          value={event.about_text || ""}
          onChange={(e) => updateEvent("about_text", e.target.value)}
          placeholder="What makes this event worth coming to? Acts, vibe, history…"
          rows={5}
        />
        <p className="text-[10px] text-muted-foreground/70">
          Aim for 80+ characters — buyers convert better when they understand
          the offer.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Lineup</Label>
        <ArtistLineupEditor
          eventArtists={eventArtists}
          onChange={onEventArtistsChange}
          sortAlphabetical={!!event.lineup_sort_alphabetical}
          onSortAlphabeticalChange={(v) => updateEvent("lineup_sort_alphabetical", v)}
        />
      </div>

      <div className="space-y-2">
        <Label>Details</Label>
        <Textarea
          value={event.details_text || ""}
          onChange={(e) => updateEvent("details_text", e.target.value)}
          placeholder="Entry requirements, age policy, venue info…"
          rows={4}
        />
        <p className="text-[10px] text-muted-foreground/70">
          The fine print. Renders below About in a quieter type weight.
        </p>
      </div>
    </div>
  );
}
