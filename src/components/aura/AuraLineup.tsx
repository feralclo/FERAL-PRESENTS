"use client";

import { Badge } from "@/components/ui/badge";
import { Music } from "lucide-react";

interface AuraLineupProps {
  artists: string[];
}

export function AuraLineup({ artists }: AuraLineupProps) {
  if (!artists || artists.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold tracking-tight flex items-center gap-2">
          <Music size={18} className="text-primary/60" />
          Lineup
        </h2>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">A–Z</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {artists.sort().map((artist) => (
          <Badge
            key={artist}
            variant="outline"
            className="rounded-lg px-3 py-1.5 text-sm font-medium border-border/40 text-foreground/80 hover:border-primary/30 hover:text-foreground transition-colors"
          >
            {artist}
          </Badge>
        ))}
      </div>
    </div>
  );
}
