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
      <div className="flex items-center gap-3 mb-8 max-[480px]:mb-6">
        <h2 className="font-[family-name:var(--font-sans)] text-sm max-[480px]:text-xs font-bold tracking-[0.2em] uppercase text-foreground/90">
          Lineup
        </h2>
        {isAlphabetical && (
          <span className="font-[family-name:var(--font-mono)] text-[9px] max-[480px]:text-[8px] tracking-[0.12em] text-[var(--accent)] border border-[var(--accent)]/25 bg-[var(--accent)]/[0.08] rounded-full px-2.5 py-0.5 uppercase">
            A &mdash; Z
          </span>
        )}
        <div className="flex-1 h-px bg-gradient-to-r from-foreground/[0.12] to-transparent" />
        {artistProfiles && artistProfiles.size > 0 && (
          <span
            className="midnight-lineup-hint font-[family-name:var(--font-sans)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/25 whitespace-nowrap"
          >
            tap to explore
          </span>
        )}
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
