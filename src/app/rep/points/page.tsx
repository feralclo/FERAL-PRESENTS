"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  TrendingUp,
  Compass,
  Gift,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  UserCheck,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PointsEntry {
  id: string;
  points: number;
  balance_after: number;
  source_type: "sale" | "quest" | "manual" | "reward_spend" | "revocation" | "refund";
  source_id?: string;
  description?: string;
  created_at: string;
}

const SOURCE_CONFIG: Record<string, {
  icon: typeof Zap;
  label: string;
  color: string;
  bgColor: string;
}> = {
  sale: {
    icon: TrendingUp,
    label: "Sale",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  quest: {
    icon: Compass,
    label: "Quest",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  manual: {
    icon: UserCheck,
    label: "Bonus",
    color: "text-info",
    bgColor: "bg-info/10",
  },
  reward_spend: {
    icon: Gift,
    label: "Reward",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  revocation: {
    icon: RotateCcw,
    label: "Revoked",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  refund: {
    icon: ArrowDownLeft,
    label: "Refund",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function RepPointsPage() {
  const [entries, setEntries] = useState<PointsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [myPoints, setMyPoints] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [pointsRes, meRes] = await Promise.all([
          fetch("/api/rep-portal/points?limit=100"),
          fetch("/api/rep-portal/me"),
        ]);
        if (!pointsRes.ok) {
          const errJson = await pointsRes.json().catch(() => null);
          setError(errJson?.error || `Failed to load points (${pointsRes.status})`);
          setLoading(false);
          return;
        }
        const pointsJson = await pointsRes.json();
        const meJson = meRes.ok ? await meRes.json() : { data: null };

        if (pointsJson.data) setEntries(pointsJson.data);
        if (meJson.data) setMyPoints(meJson.data.points_balance || 0);
      } catch { setError("Failed to load points — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  // Stats
  const totalEarned = entries.filter((e) => e.points > 0).reduce((sum, e) => sum + e.points, 0);
  const totalSpent = entries.filter((e) => e.points < 0).reduce((sum, e) => sum + Math.abs(e.points), 0);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-16 w-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[72px] rounded-2xl" />
          <Skeleton className="h-[72px] rounded-2xl" />
        </div>
        <div className="space-y-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[60px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <Zap size={22} className="text-destructive" />
          </div>
          <p className="text-sm text-foreground font-medium mb-1">Failed to load points</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
          >
            <RefreshCw size={12} />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header with balance */}
      <div className="flex items-center justify-between rep-slide-up">
        <div>
          <h1 className="text-xl font-bold text-foreground">Points</h1>
          <p className="text-sm text-muted-foreground">Your points history</p>
        </div>
        <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5 rep-glow">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Zap size={10} className="text-primary" />
            <p className="text-[9px] uppercase tracking-[2px] text-primary font-bold">Balance</p>
          </div>
          <p className="text-lg font-bold font-mono text-primary tabular-nums">{myPoints}</p>
        </div>
      </div>

      {/* Earned / Spent summary */}
      <div className="grid grid-cols-2 gap-3 rep-slide-up" style={{ animationDelay: "50ms" }}>
        <Card className="py-0 gap-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ArrowUpRight size={12} className="text-success" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Earned</p>
            </div>
            <p className="text-xl font-bold text-success font-mono tabular-nums">+{totalEarned}</p>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ArrowDownLeft size={12} className="text-muted-foreground" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Spent</p>
            </div>
            <p className="text-xl font-bold text-muted-foreground font-mono tabular-nums">-{totalSpent}</p>
          </CardContent>
        </Card>
      </div>

      {/* Points Timeline */}
      {entries.length === 0 ? (
        <div className="text-center py-16 rep-slide-up">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Zap size={22} className="text-primary" />
          </div>
          <p className="text-sm text-foreground font-medium mb-1">No points activity yet</p>
          <p className="text-xs text-muted-foreground">Earn points by making sales and completing quests</p>
        </div>
      ) : (
        <div className="relative rep-slide-up" style={{ animationDelay: "100ms" }}>
          {/* Timeline line */}
          <div className="absolute left-[23px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-1">
            {entries.map((entry, i) => {
              const config = SOURCE_CONFIG[entry.source_type] || SOURCE_CONFIG.manual;
              const Icon = config.icon;
              const isPositive = entry.points > 0;

              return (
                <div
                  key={entry.id}
                  className="relative flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-muted/20 transition-colors group"
                >
                  {/* Timeline dot */}
                  <div className={cn(
                    "relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ring-2 ring-background",
                    config.bgColor
                  )}>
                    <Icon size={10} className={config.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-semibold uppercase tracking-wider",
                          config.color
                        )}>
                          {config.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(entry.created_at)}
                        </span>
                      </div>
                      {entry.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {entry.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={cn(
                        "text-sm font-bold font-mono tabular-nums",
                        isPositive ? "text-success" : "text-muted-foreground"
                      )}>
                        {isPositive ? "+" : ""}{entry.points}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums w-12 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                        {entry.balance_after}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
