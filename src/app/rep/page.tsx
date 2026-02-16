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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  pending_rewards: number;
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

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* clipboard not available */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button
          variant="link"
          size="sm"
          onClick={() => { setError(""); setLoading(true); setData(null); setLoadKey((k) => k + 1); }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32 text-sm text-muted-foreground">
        Failed to load dashboard
      </div>
    );
  }

  const rep = data.rep;
  const levelRange = (data.next_level_points || 0) - data.current_level_points;
  const levelProgress = data.next_level_points && levelRange > 0
    ? ((rep.points_balance - data.current_level_points) / levelRange) * 100
    : 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* ── Welcome + Level ── */}
      <div className="text-center rep-slide-up">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20 rep-glow mb-3 overflow-hidden">
          {rep.photo_url ? (
            <img src={rep.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-primary">
              {rep.first_name.charAt(0)}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-foreground">
          Hey, {rep.display_name || rep.first_name}
        </h1>
        <Badge className="mt-2 gap-1.5 px-4 py-1.5 rep-badge-shimmer">
          <Zap size={12} />
          Level {rep.level} — {data.level_name}
        </Badge>

        {/* XP progress */}
        <div className="mt-3 mx-auto max-w-xs">
          <Progress
            value={Math.min(100, Math.max(0, levelProgress))}
            className="h-1.5"
            indicatorClassName="rep-xp-fill"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            {data.next_level_points
              ? `${rep.points_balance} / ${data.next_level_points} XP to next level`
              : "Max level reached!"}
          </p>
        </div>
      </div>

      {/* ── Discount Code (prominent) ── */}
      {data.discount_codes.length > 0 && (
        <Card className="py-0 gap-0 border-primary/20 bg-primary/5 rep-pulse-border rep-slide-up" style={{ animationDelay: "50ms" }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Flame size={14} className="text-primary" />
              <p className="text-[10px] uppercase tracking-[2px] text-primary font-bold">
                Your Code
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xl font-bold font-mono tracking-[3px] text-foreground flex-1">
                {data.discount_codes[0].code}
              </p>
              <Button
                size="sm"
                onClick={() => copyCode(data.discount_codes[0].code)}
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                {copiedCode ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Share this code — every sale earns you points
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-3 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <StatCard
          size="compact"
          label="Points"
          value={String(rep.points_balance)}
          icon={Zap}
        />
        <StatCard
          size="compact"
          label="Sales"
          value={String(rep.total_sales)}
          icon={TrendingUp}
        />
        <StatCard
          size="compact"
          label="Revenue"
          value={`£${Number(rep.total_revenue).toFixed(0)}`}
          icon={TrendingUp}
        />
        <Link href="/rep/leaderboard">
          <StatCard
            size="compact"
            label="Rank"
            value={`#${data.leaderboard_position || "—"}`}
            icon={Trophy}
          />
        </Link>
      </div>

      {/* ── Active Campaigns / Events ── */}
      {data.active_events.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "150ms" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Active Campaigns</h2>
            </div>
            <Link href="/rep/sales" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-2">
            {data.active_events.map((event) => (
              <Card key={event.id} className="py-0 gap-0 hover:border-primary/20 transition-all duration-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{event.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {event.sales_count} sales
                      </span>
                      <span className="text-[11px] font-mono text-success">
                        £{Number(event.revenue).toFixed(0)}
                      </span>
                    </div>
                  </div>
                  <TrendingUp size={16} className="text-primary" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-2 gap-3 rep-slide-up" style={{ animationDelay: "200ms" }}>
        <Link href="/rep/quests">
          <Card className="py-0 gap-0 hover:border-primary/20 transition-all duration-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Swords size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Quests</p>
                <p className="text-[11px] text-muted-foreground">{data.active_quests} active</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rep/rewards">
          <Card className="py-0 gap-0 hover:border-primary/20 transition-all duration-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Gift size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Rewards</p>
                <p className="text-[11px] text-muted-foreground">
                  {data.pending_rewards > 0 ? `${data.pending_rewards} pending` : "Shop & milestones"}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Recent Sales ── */}
      {data.recent_sales.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "250ms" }}>
          <h2 className="text-sm font-semibold text-foreground mb-3">Recent Sales</h2>
          <div className="space-y-2">
            {data.recent_sales.map((sale) => (
              <Card key={sale.id} className="py-0 gap-0">
                <CardContent className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-foreground">{sale.order_number}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(sale.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="text-sm font-bold font-mono text-success">
                    £{Number(sale.total).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Leaderboard CTA ── */}
      <Link href="/rep/leaderboard">
        <Card
          className="py-0 gap-0 border-warning/20 bg-warning/5 hover:border-warning/30 transition-all duration-200 rep-card-hover rep-slide-up"
          style={{ animationDelay: "300ms" }}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10">
                <Trophy size={18} className="text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Leaderboard</p>
                <p className="text-[11px] text-muted-foreground">
                  {data.leaderboard_position
                    ? `You're ranked #${data.leaderboard_position}`
                    : "See where you stand"}
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
