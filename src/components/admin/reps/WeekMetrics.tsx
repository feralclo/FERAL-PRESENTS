"use client";

import { StatCard } from "@/components/ui/stat-card";
import { ShoppingBag, Banknote, Swords } from "lucide-react";
import type { RepProgramStats } from "@/types/reps";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function WeekMetricsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-7 w-20 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function WeekMetrics({
  stats,
  loading,
  error,
}: {
  stats: RepProgramStats | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <WeekMetricsSkeleton />;

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {error ?? "Couldn't load programme totals."}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="Sales via reps"
        value={stats.total_sales_via_reps.toLocaleString("en-GB")}
        icon={ShoppingBag}
        detail="programme lifetime"
        size="compact"
      />
      <StatCard
        label="Revenue via reps"
        value={formatMoney(stats.total_revenue_via_reps)}
        icon={Banknote}
        detail="programme lifetime"
        size="compact"
      />
      <StatCard
        label="Active quests"
        value={stats.active_quests.toLocaleString("en-GB")}
        icon={Swords}
        detail={`${stats.pending_submissions} pending review`}
        size="compact"
      />
    </div>
  );
}
