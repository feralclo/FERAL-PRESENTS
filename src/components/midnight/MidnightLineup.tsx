"use client";

import type { Artist } from "@/types/artists";

interface MidnightLineupProps {
  artists: string[];
  /** Whether the lineup is sorted alphabetically (shows A–Z badge) */
  isAlphabetical?: boolean;
  /** Artist profiles keyed by name — pills with a profile become clickable */
  artistProfiles?: Map<string, Artist>;
  onArtistClick?: (artist: Artist) => void;
}

export function MidnightLineup({
  artists,
  isAlphabetical,
  artistProfiles,
  onArtistClick,
}: MidnightLineupProps) {
  if (artists.length === 0) return null;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-7 max-[480px]:mb-5">
        <h2 className="font-[family-name:var(--font-sans)] text-xs max-[480px]:text-[11px] font-bold tracking-[0.18em] uppercase text-foreground/60">
          Lineup
        </h2>
        {isAlphabetical && (
          <span className="font-[family-name:var(--font-mono)] text-[9px] max-[480px]:text-[8px] tracking-[0.12em] text-[var(--accent)]/80 border border-[var(--accent)]/15 bg-[var(--accent)]/[0.04] rounded-full px-2.5 py-0.5 uppercase">
            A &mdash; Z
          </span>
        )}
        <div className="flex-1 h-px bg-gradient-to-r from-foreground/[0.10] to-transparent" />
      </div>

      {/* Artist pills */}
      <div className="flex flex-wrap gap-2.5 max-[480px]:gap-2">
        {artists.map((artist) => {
          const profile = artistProfiles?.get(artist);
          const hasProfile = !!profile;

          if (hasProfile) {
            return (
              <button
                key={artist}
                type="button"
                onClick={() => onArtistClick?.(profile)}
                className="midnight-lineup-pill inline-block px-4 py-2.5 max-[480px]:px-3.5 max-[480px]:py-2 border border-foreground/[0.12] rounded-lg font-[family-name:var(--font-sans)] text-[13px] max-[480px]:text-[12px] tracking-[0.01em] text-foreground/85 cursor-pointer bg-foreground/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_4px_rgba(0,0,0,0.3)] hover:bg-foreground/[0.10] hover:border-foreground/[0.20] transition-all duration-200"
              >
                {artist}
              </button>
            );
          }

          return (
            <span
              key={artist}
              className="midnight-lineup-pill inline-block px-4 py-2.5 max-[480px]:px-3.5 max-[480px]:py-2 border border-foreground/[0.06] rounded-lg font-[family-name:var(--font-sans)] text-[13px] max-[480px]:text-[12px] tracking-[0.01em] text-foreground/55 cursor-default bg-foreground/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
            >
              {artist}
            </span>
          );
        })}
      </div>
    </div>
  );
}
