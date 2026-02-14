"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AuraLineupProps {
  artists: string[];
}

const MAX_VISIBLE = 6;

export function AuraLineup({ artists }: AuraLineupProps) {
  const [expanded, setExpanded] = useState(false);

  if (!artists || artists.length === 0) return null;

  const headliner = artists[0];
  const remaining = artists.slice(1);
  const hasOverflow = remaining.length > MAX_VISIBLE && !expanded;
  const visibleArtists = hasOverflow ? remaining.slice(0, MAX_VISIBLE) : remaining;
  const hiddenCount = remaining.length - MAX_VISIBLE;

  return (
    <div className="space-y-4">
      {/* Headliner */}
      <div>
        <Badge variant="default" className="text-base px-4 py-1.5 font-semibold">
          {headliner}
        </Badge>
      </div>

      {/* Supporting artists */}
      {remaining.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {visibleArtists.map((artist) => (
            <Badge key={artist} variant="secondary" className="text-sm px-3 py-1">
              {artist}
            </Badge>
          ))}
          {hasOverflow && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpanded(true)}
              className="text-muted-foreground"
            >
              +{hiddenCount} more
            </Button>
          )}
        </div>
      )}

      {/* Artist count */}
      <p className="text-xs text-muted-foreground">
        {artists.length} {artists.length === 1 ? "artist" : "artists"}
      </p>
    </div>
  );
}
