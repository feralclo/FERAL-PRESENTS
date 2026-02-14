"use client";

import { Badge } from "@/components/ui/badge";

interface AuraLineupProps {
  artists: string[];
}

export function AuraLineup({ artists }: AuraLineupProps) {
  if (!artists || artists.length === 0) return null;

  const sorted = [...artists].sort();

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest font-medium text-muted-foreground">
        Lineup
      </p>
      <div className="flex flex-wrap gap-2">
        {sorted.map((artist) => (
          <Badge key={artist} variant="secondary" className="text-sm px-3 py-1">
            {artist}
          </Badge>
        ))}
      </div>
    </div>
  );
}
