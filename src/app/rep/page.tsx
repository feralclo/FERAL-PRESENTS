"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Zap,
  TrendingUp,
  Compass,
  Gift,
  ChevronRight,
  Copy,
  Check,
  Flame,
  Share2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RadialGauge, HudSectionHeader, LevelUpOverlay, WelcomeOverlay, hasCompletedOnboarding } from "@/components/rep";
import { getTierFromLevel } from "@/lib/rep-tiers";
import { useCountUp } from "@/hooks/useCountUp";
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
  active_events: { id: string; name: string; sales_count: number; revenue: number; cover_image?: string }[];
  recent_sales: { id: string; order_number: string; total: number; created_at: string; points_earned?: number }[];
  discount_codes: { code: string }[];
}

const LEVEL_UP_STORAGE_KEY = "rep_last_level";

export default function RepDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState<{ level: number; name: string } | null>(null);
  const [xpAnimated, setXpAnimated] = useState(false);
  const [statsReady, setStatsReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

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

          const lastLevel = parseInt(localStorage.getItem(LEVEL_UP_STORAGE_KEY) || "0", 10);
          const currentLevel = d.rep.level;

          if (lastLevel > 0 && currentLevel > lastLevel) {
            setLevelUpInfo({ level: currentLevel, name: d.level_name });
            setShowLevelUp(true);
          }
          localStorage.setItem(LEVEL_UP_STORAGE_KEY, String(currentLevel));

          if (!hasCompletedOnboarding()) {
            setShowWelcome(true);
          }

          setTimeout(() => setXpAnimated(true), 300);
          setTimeout(() => setStatsReady(true), 150);
        }
      } catch { setError("Failed to load dashboard — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setCopyFlash(true);
      setTimeout(() => setCopiedCode(false), 2000);
      setTimeout(() => setCopyFlash(false), 400);
    } catch {
      /* clipboard not available */
    }
  };

  const shareCode = async (code: string) => {
    try {
      await navigator.share({ text: `Use my code ${code} for a discount!` });
    } catch {
      copyCode(code);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
        <div className="flex flex-col items-center">
          <Skeleton className="h-24 w-24 rounded-full mb-3" />
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-3 w-48 mt-3 rounded-full" />
        </div>
        <Skeleton className="h-[140px] rounded-2xl" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[160px] rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[88px] rounded-2xl" />
          <Skeleton className="h-[88px] rounded-2xl" />
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
  const tier = getTierFromLevel(rep.level);
  const levelRange = (data.next_level_points || 0) - data.current_level_points;
  const levelProgress = data.next_level_points && levelRange > 0
    ? ((rep.points_balance - data.current_level_points) / levelRange) * 100
    : 100;
  const xpToGo = data.next_level_points ? data.next_level_points - rep.points_balance : 0;

  const maxSales = Math.max(rep.total_sales, 50);
  const maxRank = 20;

  const tierGlow = { "--rep-tier-glow": `${tier.color}20` } as React.CSSProperties;
  const tierGlowStrong = { "--rep-tier-glow": `${tier.color}35` } as React.CSSProperties;

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      {showWelcome && (
        <WelcomeOverlay
          repName={rep.display_name || rep.first_name}
          discountCode={data.discount_codes[0]?.code}
          onDismiss={() => setShowWelcome(false)}
        />
      )}

      {showLevelUp && levelUpInfo && (
        <LevelUpOverlay
          newLevel={levelUpInfo.level}
          onDismiss={() => setShowLevelUp(false)}
        />
      )}

      {/* ── Hero Player Card ── */}
      <div className="relative rep-slide-up rep-hero-banner" style={tierGlowStrong}>
        <div className="text-center py-2 relative z-[1]">
          <div className={cn(
            "inline-flex h-24 w-24 items-center justify-center rounded-full overflow-hidden mx-auto mb-3 rep-avatar-ring",
            tier.ring
          )}>
            {rep.photo_url ? (
              <img src={rep.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-primary/10">
                <span className="text-3xl font-bold text-primary">
                  {rep.first_name.charAt(0)}
                </span>
              </div>
            )}
          </div>

          <h1 className="text-xl font-bold text-foreground">
            Hey, {rep.display_name || rep.first_name}
          </h1>

          <div className="flex items-center justify-center gap-2.5 mt-2">
            <Badge
              className={cn(
                "gap-1.5 px-4 py-1.5 border text-[11px]",
                tier.name === "Mythic" && "rep-badge-shimmer",
              )}
              style={{
                backgroundColor: `${tier.color}18`,
                borderColor: `${tier.color}35`,
                color: tier.color,
                boxShadow: `0 0 12px ${tier.color}10`,
              }}
            >
              <Zap size={12} />
              Level {rep.level} — {data.level_name}
            </Badge>
            {data.leaderboard_position && (
              <span
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: tier.color, textShadow: `0 0 10px ${tier.color}30` }}
              >
                #{data.leaderboard_position}
              </span>
            )}
          </div>

          <div className="mt-5 mx-auto max-w-xs">
            <Progress
              value={xpAnimated ? Math.min(100, Math.max(0, levelProgress)) : 0}
              className="h-3"
              indicatorClassName="rep-xp-fill transition-all duration-1000 ease-out"
              style={{ boxShadow: `0 0 8px ${tier.color}15` }}
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] font-mono tabular-nums" style={{ color: `${tier.color}90` }}>
                {rep.points_balance} XP
              </p>
              <p className="text-[10px] text-muted-foreground">
                {data.next_level_points
                  ? <span className="font-mono tabular-nums">{xpToGo} to go</span>
                  : "Max level!"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Weapon Card ── */}
      {data.discount_codes.length > 0 && (
        <div
          className={cn(
            "rep-surface-2 rep-weapon-card rounded-2xl rep-slide-up",
            copyFlash && "rep-copy-flash"
          )}
          style={{ animationDelay: "50ms", borderColor: `${tier.color}20`, ...tierGlow }}
        >
          <div className="p-5 relative z-[1]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${tier.color}18` }}>
                  <Flame size={14} style={{ color: tier.color }} />
                </div>
                <span className="text-[10px] uppercase tracking-[2px] font-bold" style={{ color: tier.color }}>
                  Your Weapon
                </span>
              </div>
              <span className="text-[10px] font-bold" style={{ color: `${tier.color}80` }}>+10 XP per sale</span>
            </div>
            <p
              className="text-[28px] font-black font-mono tracking-[6px] text-foreground mb-1 rep-weapon-code"
              style={{ "--rep-tier-glow": `${tier.color}25` } as React.CSSProperties}
            >
              {data.discount_codes[0].code}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Share this code — every sale earns you <span className="font-bold" style={{ color: tier.color }}>+10 XP</span>
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => copyCode(data.discount_codes[0].code)}
                style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}CC)`, boxShadow: `0 4px 14px ${tier.color}30` }}
                className="border-0 text-white"
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                {copiedCode ? "Copied" : "Copy Code"}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareCode(data.discount_codes[0].code)}
                  style={{ borderColor: `${tier.color}30`, color: tier.color }}
                >
                  <Share2 size={12} />
                  Share
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rep-section-line" />

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-3 gap-3 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <Link href="/rep/points">
          <div className="rep-stat-glow" style={{ "--rep-stat-color": "rgba(139, 92, 246, 0.25)" } as React.CSSProperties}>
            <GaugeWithCounter value={rep.points_balance} max={data.next_level_points || rep.points_balance || 100} color="#8B5CF6" icon={Zap} label="XP" enabled={statsReady} />
          </div>
        </Link>
        <Link href="/rep/sales">
          <div className="rep-stat-glow" style={{ "--rep-stat-color": "rgba(249, 115, 22, 0.25)" } as React.CSSProperties}>
            <GaugeWithCounter value={rep.total_sales} max={maxSales} color="#F97316" icon={Flame} label="Sold" enabled={statsReady} />
          </div>
        </Link>
        <Link href="/rep/leaderboard">
          <div className="rep-stat-glow" style={{ "--rep-stat-color": "rgba(245, 158, 11, 0.25)" } as React.CSSProperties}>
            <RadialGauge value={statsReady ? (data.leaderboard_position ? maxRank - data.leaderboard_position + 1 : 0) : 0} max={maxRank} color="#F59E0B" icon={Trophy} label="Rank" displayValue={data.leaderboard_position ? `#${data.leaderboard_position}` : "—"} />
          </div>
        </Link>
      </div>

      {/* ── Active Missions ── */}
      {data.active_events.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "150ms" }}>
          <HudSectionHeader label="Active Missions" />
          <div className="space-y-2.5">
            {data.active_events.map((event) => (
              <Link key={event.id} href="/rep/sales">
                <div className="rep-mission-card-vivid">
                  {event.cover_image && (
                    <div className="rep-mission-ambient">
                      <img src={event.cover_image} alt="" style={{ opacity: 0.22, filter: "blur(1px) brightness(0.85) saturate(1.2)" }} />
                    </div>
                  )}
                  <div className="relative z-[1] p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="rep-live-dot shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{event.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Flame size={11} className="text-orange-400" />
                            <span className="font-mono font-bold text-foreground">{event.sales_count}</span> ticket{event.sales_count !== 1 ? "s" : ""}
                          </span>
                          {event.revenue > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-success">
                              <TrendingUp size={11} />
                              £{Number(event.revenue).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground/50 shrink-0" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 gap-3 rep-slide-up" style={{ animationDelay: "200ms" }}>
        <Link href="/rep/quests">
          <Card className="py-0 gap-0 rep-action-hover" style={{ minHeight: "88px" }}>
            <CardContent className="p-4 flex items-center gap-3 h-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0 rep-action-icon-purple">
                <Compass size={20} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Side Quests</p>
                  {data.active_quests > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[9px] font-bold text-white rep-notification-badge">
                      {data.active_quests}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{data.active_quests} active</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/rep/rewards">
          <Card className="py-0 gap-0 rep-action-hover" style={{ minHeight: "88px" }}>
            <CardContent className="p-4 flex items-center gap-3 h-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0 rep-action-icon-amber">
                <Gift size={20} className="text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Rewards</p>
                  {data.pending_rewards > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[9px] font-bold text-white rep-notification-badge">
                      {data.pending_rewards}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.pending_rewards > 0 ? `${data.pending_rewards} pending` : "Shop & milestones"}
                </p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Recent Activity ── */}
      {data.recent_sales.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "250ms" }}>
          <HudSectionHeader label="Recent Activity" />
          <div className="space-y-2">
            {data.recent_sales.map((sale) => (
              <Card key={sale.id} className="py-0 gap-0 rep-battle-log-entry">
                <CardContent className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
                      <TrendingUp size={14} className="text-success" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-foreground">{sale.order_number}</p>
                      <p className="text-[10px] text-muted-foreground">{formatRelativeTime(sale.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="rep-xp-gain inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-primary" style={{ background: `${tier.color}12` }}>
                      <Zap size={9} />+10 XP
                    </span>
                    <p className="text-sm font-bold font-mono text-success tabular-nums">
                      £{Number(sale.total).toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Link href="/rep/sales" className="flex items-center justify-center gap-1 mt-3 text-xs hover:underline" style={{ color: tier.color }}>
            View all sales <ChevronRight size={12} />
          </Link>
        </div>
      )}

      {/* ── Arena CTA ── */}
      <Link href="/rep/leaderboard">
        <Card
          className={cn(
            "py-0 gap-0 rep-surface-1 rep-slide-up",
            data.leaderboard_position && data.leaderboard_position <= 3 ? "rep-arena-top3" : "border-warning/15",
          )}
          style={{ animationDelay: "300ms" }}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{
                  background: data.leaderboard_position && data.leaderboard_position <= 3
                    ? "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.08))"
                    : "rgba(245, 158, 11, 0.12)",
                  boxShadow: data.leaderboard_position && data.leaderboard_position <= 3
                    ? "0 0 16px rgba(245, 158, 11, 0.1)" : undefined,
                }}
              >
                <Trophy size={22} className="text-warning" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Arena</p>
                  {data.leaderboard_position && (
                    <span className="text-base font-bold font-mono tabular-nums text-warning" style={{ textShadow: "0 0 10px rgba(245, 158, 11, 0.25)" }}>
                      #{data.leaderboard_position}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.leaderboard_position ? "Challenge your crew" : "See where you stand"}
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-warning/60" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function GaugeWithCounter({
  value, max, color, icon, label, enabled,
}: {
  value: number; max: number; color: string;
  icon: typeof Zap; label: string; enabled: boolean;
}) {
  const animatedValue = useCountUp(enabled ? value : 0, 900, enabled);
  return (
    <RadialGauge
      value={enabled ? value : 0}
      max={max}
      color={color}
      icon={icon}
      label={label}
      displayValue={String(animatedValue)}
    />
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
