"use client";

interface AuroraLineupProps {
  artists: string[];
}

export function AuroraLineup({ artists }: AuroraLineupProps) {
  if (!artists || artists.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-aurora-text mb-4 flex items-center gap-2">
        <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
        </svg>
        Lineup
        <span className="text-xs text-aurora-text-secondary font-normal">[A-Z]</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {artists.map((artist) => (
          <span
            key={artist}
            className="aurora-glass rounded-lg px-3 py-1.5 text-sm text-aurora-text"
          >
            {artist}
          </span>
        ))}
      </div>
    </div>
  );
}
