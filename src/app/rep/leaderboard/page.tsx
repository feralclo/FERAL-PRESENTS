"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

interface LeaderboardEntry {
  id: string;
  display_name?: string;
  first_name: string;
  last_name?: string;
  photo_url?: string;
  total_sales: number;
  total_revenue: number;
  level: number;
  is_current_user?: boolean;
}

const PODIUM_STYLES = [
  "rep-podium-gold border-2",
  "rep-podium-silver border",
  "rep-podium-bronze border",
];
const MEDAL_COLORS = ["var(--rep-gold)", "var(--rep-silver)", "var(--rep-bronze)"];

export default function RepLeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [myPosition, setMyPosition] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rep-portal/leaderboard");
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          setError(errJson?.error || "Failed to load leaderboard (" + res.status + ")");
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) {
          setEntries(json.data.leaderboard || []);
          setMyPosition(json.data.current_position);
        }
      } catch { setError("Failed to load leaderboard — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button
          onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
          className="text-xs text-[var(--rep-accent)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--rep-gold)]/10 mb-3">
          <Trophy size={22} className="text-[var(--rep-gold)]" />
        </div>
        <h1 className="text-xl font-bold text-white">Leaderboard</h1>
        {myPosition && (
          <p className="text-sm text-[var(--rep-text-muted)] mt-1">
            You&apos;re ranked <span className="text-[var(--rep-accent)] font-bold">#{myPosition}</span>
          </p>
        )}
      </div>

      {/* Leaderboard */}
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`rep-leaderboard-item flex items-center gap-3 rounded-2xl p-4 transition-colors ${
              i < 3
                ? PODIUM_STYLES[i]
                : entry.is_current_user
                  ? "border-2 border-[var(--rep-accent)]/30 bg-[var(--rep-accent)]/5"
                  : "border border-[var(--rep-border)] bg-[var(--rep-card)]"
            }`}
          >
            {/* Rank */}
            <div className="w-8 text-center">
              {i < 3 ? (
                <span className="text-lg font-bold" style={{ color: MEDAL_COLORS[i] }}>
                  {i + 1}
                </span>
              ) : (
                <span className="text-sm font-mono text-[var(--rep-text-muted)]">{i + 1}</span>
              )}
            </div>

            {/* Avatar */}
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden ${
              i < 3 ? "ring-2" : ""
            }`} style={i < 3 ? { "--tw-ring-color": MEDAL_COLORS[i] } as React.CSSProperties : undefined}>
              {entry.photo_url ? (
                <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-[var(--rep-accent)]/10 text-xs font-bold text-[var(--rep-accent)]">
                  {entry.first_name.charAt(0)}{entry.last_name?.charAt(0) || ""}
                </div>
              )}
            </div>

            {/* Name + Level */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${entry.is_current_user ? "text-[var(--rep-accent)]" : "text-white"}`}>
                {entry.display_name || entry.first_name}
                {entry.is_current_user && <span className="ml-1.5 text-[10px] text-[var(--rep-accent)]/60">(YOU)</span>}
              </p>
              <p className="text-[10px] text-[var(--rep-text-muted)]">
                Lv.{entry.level} · {entry.total_sales} sales
              </p>
            </div>

            {/* Revenue */}
            <div className="text-right">
              <p className="text-sm font-bold font-mono tabular-nums text-white">
                £{Number(entry.total_revenue).toFixed(0)}
              </p>
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="text-center py-16 text-sm text-[var(--rep-text-muted)]">
            No entries yet. Be the first to make a sale!
          </div>
        )}
      </div>
    </div>
  );
}
