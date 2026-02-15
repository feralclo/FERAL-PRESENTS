"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Zap,
  TrendingUp,
  Swords,
  Gift,
  ChevronRight,
  Copy,
  Check,
  Flame,
} from "lucide-react";

interface DashboardData {
  rep: {
    first_name: string;
    display_name?: string;
    photo_url?: string;
    points_balance: number;
    total_sales: number;
    total_revenue: number;
    level: number;
  };
  level_name: string;
  next_level_points: number | null;
  current_level_points: number;
  leaderboard_position: number | null;
  active_quests: number;
  active_events: { id: string; name: string; sales_count: number; revenue: number }[];
  recent_sales: { id: string; order_number: string; total: number; created_at: string }[];
  discount_codes: { code: string }[];
}

export default function RepDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [dashRes, discountRes] = await Promise.all([
          fetch("/api/rep-portal/dashboard"),
          fetch("/api/rep-portal/discount"),
        ]);
        if (!dashRes.ok) {
          const errJson = await dashRes.json().catch(() => null);
          const msg = errJson?.error || `Failed to load dashboard (${dashRes.status})`;
          setError(msg);
          setLoading(false);
          return;
        }
        const dashJson = await dashRes.json();
        const discountJson = discountRes.ok ? await discountRes.json() : { data: [] };

        if (dashJson.data) {
          setData({
            ...dashJson.data,
            discount_codes: discountJson.data || [],
          });
        }
      } catch { setError("Failed to load dashboard — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

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
          onClick={() => { setError(""); setLoading(true); setData(null); setLoadKey((k) => k + 1); }}
          className="text-xs text-[var(--rep-accent)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32 text-sm text-[var(--rep-text-muted)]">
        Failed to load dashboard
      </div>
    );
  }

  const rep = data.rep;
  const levelProgress = data.next_level_points
    ? ((rep.points_balance - data.current_level_points) / (data.next_level_points - data.current_level_points)) * 100
    : 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* ── Welcome + Level ── */}
      <div className="text-center rep-slide-up">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/20 rep-glow mb-3 overflow-hidden">
          {rep.photo_url ? (
            <img src={rep.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-[var(--rep-accent)]">
              {rep.first_name.charAt(0)}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-white">
          Hey, {rep.display_name || rep.first_name}
        </h1>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/20 px-4 py-1.5 rep-badge-shimmer">
          <Zap size={12} className="text-[var(--rep-accent)]" />
          <span className="text-xs font-semibold text-[var(--rep-accent)]">
            Level {rep.level} — {data.level_name}
          </span>
        </div>

        {/* XP progress */}
        <div className="mt-3 mx-auto max-w-xs">
          <div className="h-1.5 rounded-full bg-[var(--rep-border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--rep-accent)] transition-all duration-700 ease-out rep-xp-fill"
              style={{ width: `${Math.min(100, Math.max(0, levelProgress))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-[var(--rep-text-muted)]">
            {data.next_level_points
              ? `${rep.points_balance} / ${data.next_level_points} XP to next level`
              : "Max level reached!"}
          </p>
        </div>
      </div>

      {/* ── Discount Code (prominent) ── */}
      {data.discount_codes.length > 0 && (
        <div className="rounded-2xl border border-[var(--rep-accent)]/20 bg-[var(--rep-accent)]/5 p-5 rep-pulse-border rep-slide-up" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-[var(--rep-accent)]" />
            <p className="text-[10px] uppercase tracking-[2px] text-[var(--rep-accent)] font-bold">
              Your Code
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xl font-bold font-mono tracking-[3px] text-white flex-1 rep-stat-glow">
              {data.discount_codes[0].code}
            </p>
            <button
              onClick={() => copyCode(data.discount_codes[0].code)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--rep-accent)] px-4 py-2.5 text-xs font-semibold text-white transition-all hover:brightness-110"
            >
              {copiedCode ? <Check size={12} /> : <Copy size={12} />}
              {copiedCode ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--rep-text-muted)]">
            Share this code — every sale earns you points
          </p>
        </div>
      )}

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-3 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <div className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4 rep-card-hover">
          <p className="text-[10px] uppercase tracking-wider text-[var(--rep-text-muted)] mb-1">Points</p>
          <p className="text-2xl font-bold text-[var(--rep-accent)] font-mono tabular-nums rep-points-pop rep-stat-glow">
            {rep.points_balance}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4 rep-card-hover">
          <p className="text-[10px] uppercase tracking-wider text-[var(--rep-text-muted)] mb-1">Sales</p>
          <p className="text-2xl font-bold text-white font-mono tabular-nums">
            {rep.total_sales}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4 rep-card-hover">
          <p className="text-[10px] uppercase tracking-wider text-[var(--rep-text-muted)] mb-1">Revenue</p>
          <p className="text-2xl font-bold text-white font-mono tabular-nums">
            £{Number(rep.total_revenue).toFixed(0)}
          </p>
        </div>
        <Link href="/rep/leaderboard" className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4 rep-card-hover">
          <p className="text-[10px] uppercase tracking-wider text-[var(--rep-text-muted)] mb-1">Rank</p>
          <p className="text-2xl font-bold text-[var(--rep-gold)] font-mono tabular-nums">
            #{data.leaderboard_position || "—"}
          </p>
        </Link>
      </div>

      {/* ── Active Campaigns / Events ── */}
      {data.active_events.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "150ms" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-[var(--rep-accent)]" />
              <h2 className="text-sm font-semibold text-white">Active Campaigns</h2>
            </div>
            <Link href="/rep/sales" className="text-[11px] text-[var(--rep-accent)] hover:underline flex items-center gap-0.5">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-2">
            {data.active_events.map((event) => (
              <div key={event.id} className="rep-campaign-card flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{event.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-[var(--rep-text-muted)]">
                      {event.sales_count} sales
                    </span>
                    <span className="text-[11px] font-mono text-[var(--rep-success)]">
                      £{Number(event.revenue).toFixed(0)}
                    </span>
                  </div>
                </div>
                <TrendingUp size={16} className="text-[var(--rep-accent)]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-2 gap-3 rep-slide-up" style={{ animationDelay: "200ms" }}>
        <Link
          href="/rep/quests"
          className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4 flex items-center gap-3 rep-card-hover"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--rep-accent)]/10">
            <Swords size={18} className="text-[var(--rep-accent)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Quests</p>
            <p className="text-[11px] text-[var(--rep-text-muted)]">{data.active_quests} active</p>
          </div>
        </Link>
        <Link
          href="/rep/rewards"
          className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-card)] p-4 flex items-center gap-3 rep-card-hover"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--rep-accent)]/10">
            <Gift size={18} className="text-[var(--rep-accent)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Rewards</p>
            <p className="text-[11px] text-[var(--rep-text-muted)]">Shop & milestones</p>
          </div>
        </Link>
      </div>

      {/* ── Recent Sales ── */}
      {data.recent_sales.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "250ms" }}>
          <h2 className="text-sm font-semibold text-white mb-3">Recent Sales</h2>
          <div className="space-y-2">
            {data.recent_sales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between rounded-xl border border-[var(--rep-border)] bg-[var(--rep-card)] px-4 py-3">
                <div>
                  <p className="text-xs font-mono text-white">{sale.order_number}</p>
                  <p className="text-[10px] text-[var(--rep-text-muted)]">
                    {new Date(sale.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <p className="text-sm font-bold font-mono text-[var(--rep-success)]">
                  £{Number(sale.total).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Leaderboard CTA ── */}
      <Link
        href="/rep/leaderboard"
        className="block rounded-2xl border border-[var(--rep-gold)]/20 bg-[var(--rep-gold)]/5 p-5 rep-card-hover rep-slide-up"
        style={{ animationDelay: "300ms" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--rep-gold)]/10">
              <Trophy size={18} className="text-[var(--rep-gold)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Leaderboard</p>
              <p className="text-[11px] text-[var(--rep-text-muted)]">
                {data.leaderboard_position
                  ? `You're ranked #${data.leaderboard_position}`
                  : "See where you stand"}
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--rep-text-muted)]" />
        </div>
      </Link>
    </div>
  );
}
