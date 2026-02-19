"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArtistLineupEditor } from "@/components/admin/ArtistLineupEditor";
import { LineupTagInput } from "@/components/admin/LineupTagInput";
import type { TabProps } from "./types";
import type { EventArtist } from "@/types/artists";

interface ContentTabProps extends TabProps {
  eventArtists: EventArtist[];
  onEventArtistsChange: (eventArtists: EventArtist[]) => void;
}

export function ContentTab({
  event,
  updateEvent,
  eventArtists,
  onEventArtistsChange,
}: ContentTabProps) {
  return (
    <div className="space-y-6">
      {/* Hero Content */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Hero Content</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tag Line</Label>
              <Input
                value={event.tag_line || ""}
                onChange={(e) => updateEvent("tag_line", e.target.value)}
                placeholder="e.g. SECOND RELEASE NOW ACTIVE"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Shown on the hero banner
              </p>
            </div>
            <div className="space-y-2">
              <Label>Doors Time</Label>
              <Input
                value={event.doors_time || ""}
                onChange={(e) => updateEvent("doors_time", e.target.value)}
                placeholder="e.g. 9:30PM — 4:00AM"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Display format for event page hero
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <Textarea
            value={event.about_text || ""}
            onChange={(e) => updateEvent("about_text", e.target.value)}
            placeholder="Describe the event..."
            rows={5}
          />
        </CardContent>
      </Card>

      {/* Lineup — Artist Catalog */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Lineup</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <ArtistLineupEditor
            eventArtists={eventArtists}
            onChange={onEventArtistsChange}
            sortAlphabetical={!!event.lineup_sort_alphabetical}
            onSortAlphabeticalChange={(v) => updateEvent("lineup_sort_alphabetical", v)}
          />
          {/* Legacy tag input — hidden when using artist catalog, shown as fallback */}
          {eventArtists.length === 0 && (
            <div className="pt-2 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground/60 mb-2">
                Or add names manually (legacy mode):
              </p>
              <LineupTagInput
                lineup={event.lineup || []}
                onChange={(lineup) => updateEvent("lineup", lineup)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <Textarea
            value={event.details_text || ""}
            onChange={(e) => updateEvent("details_text", e.target.value)}
            placeholder="Entry requirements, age policy, venue info..."
            rows={4}
          />
        </CardContent>
      </Card>
    </div>
  );
}
