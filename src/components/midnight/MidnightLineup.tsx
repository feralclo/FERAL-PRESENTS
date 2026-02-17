"use client";

interface MidnightLineupProps {
  artists: string[];
}

export function MidnightLineup({ artists }: MidnightLineupProps) {
  if (artists.length === 0) return null;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-7 max-[480px]:mb-5">
        <h2 className="font-[family-name:var(--font-mono)] text-[9px] max-[480px]:text-[8px] font-bold tracking-[0.25em] uppercase text-foreground/30">
          Lineup
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-[9px] max-[480px]:text-[8px] tracking-[0.12em] text-primary/60 border border-primary/20 rounded-full px-2.5 py-0.5 uppercase">
          A &mdash; Z
        </span>
        <div className="flex-1 h-px bg-foreground/[0.05]" />
      </div>

      {/* Artist pills */}
      <div className="flex flex-wrap gap-2.5 max-[480px]:gap-2">
        {artists.map((artist) => (
          <span
            key={artist}
            className="midnight-lineup-pill inline-block px-4 py-2 max-[480px]:px-3 max-[480px]:py-1.5 border border-foreground/[0.06] rounded-lg font-[family-name:var(--font-mono)] text-[13px] max-[480px]:text-[11px] tracking-[0.3px] text-foreground/50 cursor-default bg-foreground/[0.015]"
          >
            {artist}
          </span>
        ))}
      </div>
    </div>
  );
}
