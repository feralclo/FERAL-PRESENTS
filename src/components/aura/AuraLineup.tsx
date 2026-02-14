"use client";

interface AuraLineupProps {
  artists: string[];
}

export function AuraLineup({ artists }: AuraLineupProps) {
  if (!artists || artists.length === 0) return null;

  const sorted = [...artists].sort();

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
        Lineup
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {sorted.map((artist, i) => (
          <span key={artist} className="inline-flex items-baseline gap-3">
            <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {artist}
            </span>
            {i < sorted.length - 1 && (
              <span className="text-muted-foreground/40 text-2xl font-light select-none" aria-hidden="true">
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
