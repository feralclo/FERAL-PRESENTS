"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, Sparkle } from "lucide-react";

export interface LeaderboardEntry {
  id: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
  level: number;
  total_sales: number;
  total_revenue: number;
  points_balance: number;
  /** Server-computed rank (1-indexed). When present, supersedes the positional prop. */
  rank?: number | null;
  /**
   * Rolling-week rank delta. Positive = moved up in rank (e.g. 4 → 1 = +3).
   * `null` = no historical baseline (new rep this week / first snapshot).
   * `undefined` = delta not applicable in this mode (e.g. all-time leaderboard).
   */
  delta_week?: number | null;
}

function RankDelta({ delta }: { delta: number | null | undefined }) {
  if (delta === undefined) return null;
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <Sparkle size={10} className="text-primary" />
        new
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums text-success">
        <ArrowUp size={11} />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums text-destructive">
        <ArrowDown size={11} />
        {Math.abs(delta)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
      <Minus size={11} />0
    </span>
  );
}

export function repName(r: LeaderboardEntry): string {
  if (r.display_name) return r.display_name;
  const n = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return n || "Unnamed rep";
}

export function repInitials(r: LeaderboardEntry): string {
  const name = repName(r);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function LeaderboardRow({
  rank,
  rep,
}: {
  rank: number;
  rep: LeaderboardEntry;
}) {
  // Server-sent rank wins when present (so e.g. a filtered snapshot can still
  // display absolute ranks). Positional prop is the fallback.
  const displayRank = typeof rep.rank === "number" ? rep.rank : rank;
  return (
    <Link
      href={`/admin/reps/${rep.id}`}
      className="flex items-center gap-3 p-3 transition-colors hover:bg-primary/5"
    >
      <span className="w-6 shrink-0 text-center font-mono text-sm font-bold tabular-nums text-muted-foreground">
        {displayRank}
      </span>

      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/50 to-primary/20 text-[11px] font-bold text-white ring-1 ring-primary/20">
        {rep.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rep.photo_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{repInitials(rep) || "·"}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {repName(rep)}
        </p>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>
            Level{" "}
            <span className="font-mono tabular-nums text-foreground/80">
              {rep.level}
            </span>
          </span>
          <RankDelta delta={rep.delta_week} />
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4 text-right">
        <div className="hidden sm:block">
          <p className="font-mono text-xs font-semibold tabular-nums text-foreground">
            {rep.total_sales}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            sales
          </p>
        </div>
        <div>
          <p className="font-mono text-xs font-semibold tabular-nums text-foreground">
            {formatMoney(rep.total_revenue)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            revenue
          </p>
        </div>
      </div>
    </Link>
  );
}

export function LeaderboardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="h-4 w-6 animate-pulse rounded bg-muted" />
      <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        <div className="h-2 w-12 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-6 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}
