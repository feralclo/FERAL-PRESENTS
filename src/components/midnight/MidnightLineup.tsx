"use client";

interface MidnightLineupProps {
  artists: string[];
  onArtistClick?: () => void;
}

export function MidnightLineup({ artists, onArtistClick }: MidnightLineupProps) {
  if (artists.length === 0) return null;

  return (
    <div>
      <h2 className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.2em] uppercase mb-7 pb-4 border-b border-foreground/[0.06] text-foreground/35">
        Lineup{" "}
        <span className="text-foreground/20 font-normal tracking-[0.05em]">[A-Z]</span>
      </h2>
      <div className="flex flex-wrap items-center gap-y-1">
        {artists.map((artist, i) => (
          <div
            key={artist}
            className="inline-flex items-center py-2 cursor-default"
            onClick={onArtistClick}
          >
            <span className="font-[family-name:var(--font-display)] text-lg max-[480px]:text-[15px] font-semibold tracking-[-0.01em] text-foreground hover:text-primary transition-colors">
              {artist}
            </span>
            {i < artists.length - 1 && (
              <span className="mx-3.5 max-[480px]:mx-2.5 text-foreground/20 text-lg max-[480px]:text-base leading-none">
                &middot;
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
