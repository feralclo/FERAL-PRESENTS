"use client";

interface MidnightLineupProps {
  artists: string[];
  onArtistClick?: () => void;
}

export function MidnightLineup({ artists, onArtistClick }: MidnightLineupProps) {
  if (artists.length === 0) return null;

  return (
    <div>
      {/* Section header with accent badge */}
      <div className="flex items-center gap-3 mb-6 max-[480px]:mb-5">
        <h2 className="font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.25em] uppercase text-foreground/40">
          Lineup
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.12em] text-primary/70 border border-primary/25 rounded-full px-2 py-0.5 uppercase">
          A &mdash; Z
        </span>
        <div className="flex-1 h-px bg-foreground/[0.06]" />
      </div>

      {/* Artist pills */}
      <div className="flex flex-wrap gap-2 max-[480px]:gap-1.5">
        {artists.map((artist) => (
          <span
            key={artist}
            className="midnight-lineup-pill inline-block px-3.5 py-1.5 max-[480px]:px-2.5 max-[480px]:py-1 border border-foreground/[0.08] rounded-full font-[family-name:var(--font-mono)] text-[13px] max-[480px]:text-[11px] tracking-[0.5px] text-foreground/60 cursor-default bg-foreground/[0.02]"
            onClick={onArtistClick}
          >
            {artist}
          </span>
        ))}
      </div>
    </div>
  );
}
