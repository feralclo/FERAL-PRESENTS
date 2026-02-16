"use client";

import { useEffect, useState, useCallback } from "react";
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
  ArrowUp,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

const LEVEL_UP_STORAGE_KEY = "rep_last_level";

export default function RepDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState<{ level: number; name: string } | null>(null);
  const [xpAnimated, setXpAnimated] = useState(false);

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
          const d = {
            ...dashJson.data,
            discount_codes: discountJson.data || [],
          };
          setData(d);

          // Check for level-up
          const lastLevel = parseInt(localStorage.getItem(LEVEL_UP_STORAGE_KEY) || "0", 10);
          const currentLevel = d.rep.level;

          if (lastLevel > 0 && currentLevel > lastLevel) {
            setLevelUpInfo({ level: currentLevel, name: d.level_name });
            setShowLevelUp(true);
          }
          localStorage.setItem(LEVEL_UP_STORAGE_KEY, String(currentLevel));

          // Animate XP bar after load
          setTimeout(() => setXpAnimated(true), 300);
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
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Welcome skeleton */}
        <div className="flex flex-col items-center">
          <Skeleton className="h-16 w-16 rounded-full mb-3" />
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-1.5 w-48 mt-3 rounded-full" />
        </div>
        {/* Discount code skeleton */}
        <Skeleton className="h-[100px] rounded-2xl" />
        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[80px] rounded-2xl" />
          ))}
        </div>
        {/* Quick links skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[72px] rounded-2xl" />
          <Skeleton className="h-[72px] rounded-2xl" />
        </div>
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
      {/* ── Level-Up Celebration Overlay ── */}
      {showLevelUp && levelUpInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm rep-level-up-overlay">
          {/* Confetti */}
          <div className="rep-confetti-container" aria-hidden>
            {[...Array(20)].map((_, i) => {
              const angle = (i / 20) * 360;
              const distance = 80 + Math.random() * 120;
              const cx = Math.cos((angle * Math.PI) / 180) * distance;
              const cy = Math.sin((angle * Math.PI) / 180) * distance - 60;
              const colors = ["#8B5CF6", "#34D399", "#F59E0B", "#F43F5E", "#38BDF8", "#A78BFA"];
              return (
                <div
                  key={i}
                  className="rep-confetti-piece"
                  style={{
                    "--cx": `${cx}px`,
                    "--cy": `${cy}px`,
                    "--cr": `${Math.random() * 720 - 360}deg`,
                    backgroundColor: colors[i % colors.length],
                    animationDelay: `${i * 30}ms`,
                    borderRadius: i % 3 === 0 ? "50%" : "2px",
                    width: `${6 + Math.random() * 6}px`,
                    height: `${6 + Math.random() * 6}px`,
                  } as React.CSSProperties}
                />
              );
            })}
          </div>

          <div className="text-center z-10">
            <div className="relative inline-block mb-6">
              <div className="h-24 w-24 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center mx-auto rep-level-up-ring">
                <div className="rep-level-up-badge">
                  <ArrowUp size={32} className="text-primary" />
                </div>
              </div>
            </div>
            <div className="rep-level-up-text">
              <p className="text-[10px] uppercase tracking-[4px] text-primary font-bold mb-2">
                Level Up!
              </p>
              <p className="text-4xl font-bold text-foreground mb-1 font-mono">
                Lv.{levelUpInfo.level}
              </p>
              <p className="text-lg text-primary font-semibold">
                {levelUpInfo.name}
              </p>
            </div>
            <button
              onClick={() => setShowLevelUp(false)}
              className="mt-8 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

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
            value={xpAnimated ? Math.min(100, Math.max(0, levelProgress)) : 0}
            className="h-1.5"
            indicatorClassName="rep-xp-fill transition-all duration-1000 ease-out"
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
      <div className="grid grid-cols-3 gap-3 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <Link href="/rep/points">
          <Card className="py-0 gap-0 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap size={12} className="text-primary" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">XP</p>
              </div>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums">{rep.points_balance}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rep/sales">
          <Card className="py-0 gap-0 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Flame size={12} className="text-orange-400" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sold</p>
              </div>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums">{rep.total_sales}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rep/leaderboard">
          <Card className="py-0 gap-0 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Trophy size={12} className="text-yellow-500" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Rank</p>
              </div>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums">#{data.leaderboard_position || "—"}</p>
            </CardContent>
          </Card>
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
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {event.sales_count} ticket{event.sales_count !== 1 ? "s" : ""} sold
                    </p>
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
          <h2 className="text-sm font-semibold text-foreground mb-3">Recent Activity</h2>
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
