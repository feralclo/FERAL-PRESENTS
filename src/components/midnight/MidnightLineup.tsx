"use client";

import { useRef, useEffect, useState, useCallback } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const [cascaded, setCascaded] = useState(false);

  // Cascade animation: when lineup scrolls into view, pills highlight in sequence
  const triggerCascade = useCallback(() => {
    if (cascaded) return;
    setCascaded(true);

    const container = containerRef.current;
    if (!container) return;

    const pills = container.querySelectorAll<HTMLElement>(".midnight-lineup-pill");
    const stagger = Math.min(200, 3000 / Math.max(pills.length, 1)); // unhurried wave

    pills.forEach((pill, i) => {
      pill.style.animationDelay = `${i * stagger}ms`;
      pill.classList.add("lineup-cascade");
    });

    // Trigger "tap to explore" hint glow partway through the cascade
    if (hintRef.current) {
      const hintDelay = Math.min(pills.length * stagger * 0.65, 2000);
      hintRef.current.style.animationDelay = `${hintDelay}ms`;
      hintRef.current.classList.add("lineup-hint-glow");
    }
  }, [cascaded]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          triggerCascade();
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "-40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggerCascade]);

  if (artists.length === 0) return null;

  return (
    <div ref={containerRef}>
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
            ref={hintRef}
            className="midnight-lineup-hint font-[family-name:var(--font-sans)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/25 whitespace-nowrap transition-colors duration-300"
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
