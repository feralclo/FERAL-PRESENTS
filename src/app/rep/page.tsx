"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  ArrowUp,
  X,
  Share2,
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
  active_events: { id: string; name: string; sales_count: number; revenue: number; cover_image?: string }[];
  recent_sales: { id: string; order_number: string; total: number; created_at: string; points_earned?: number }[];
  discount_codes: { code: string }[];
}

const LEVEL_UP_STORAGE_KEY = "rep_last_level";

function getTierFromLevel(level: number): { name: string; ring: string; color: string; textColor: string; bgColor: string } {
  if (level >= 9) return { name: "Mythic", ring: "rep-avatar-ring-mythic", color: "#F59E0B", textColor: "text-amber-400", bgColor: "bg-amber-500/15" };
  if (level >= 7) return { name: "Elite", ring: "rep-avatar-ring-elite", color: "#8B5CF6", textColor: "text-purple-400", bgColor: "bg-purple-500/15" };
  if (level >= 4) return { name: "Pro", ring: "rep-avatar-ring-pro", color: "#38BDF8", textColor: "text-sky-400", bgColor: "bg-sky-500/15" };
  return { name: "Starter", ring: "rep-avatar-ring-starter", color: "#94A3B8", textColor: "text-slate-400", bgColor: "bg-slate-500/15" };
}

/** Animate a number counting up from 0 to target */
function useCountUp(target: number, duration: number = 800, enabled: boolean = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || target === 0) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled]);

  return value;
}

// ─── SVG Radial Gauge ──────────────────────────────────────────────────────────

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 30; // r=30

function RadialGauge({
  value,
  max,
  color,
  icon: Icon,
  label,
  displayValue,
  enabled,
}: {
  value: number;
  max: number;
  color: string;
  icon: typeof Zap;
  label: string;
  displayValue: string;
  enabled: boolean;
}) {
  const percent = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = GAUGE_CIRCUMFERENCE * (1 - (enabled ? percent : 0));

  return (
    <div className="rep-gauge">
      <div className="rep-gauge-accent" style={{ backgroundColor: color }} />
      <svg className="rep-gauge-svg" viewBox="0 0 72 72">
        <circle className="rep-gauge-track" cx="36" cy="36" r="30" />
        <circle
          className="rep-gauge-fill"
          cx="36" cy="36" r="30"
          stroke={color}
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ "--gauge-color": color } as React.CSSProperties}
        />
      </svg>
      <div className="rep-gauge-center">
        <Icon size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color}40)` }} />
      </div>
      <p className="rep-gauge-label">{label}</p>
      <p className="rep-gauge-value" style={{ color }}>{displayValue}</p>
    </div>
  );
}

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

          // Animate XP bar and stats after load
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
      // Fallback to copy
      copyCode(code);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Welcome skeleton */}
        <div className="flex flex-col items-center">
          <Skeleton className="h-24 w-24 rounded-full mb-3" />
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-2.5 w-48 mt-3 rounded-full" />
        </div>
        {/* Discount code skeleton */}
        <Skeleton className="h-[130px] rounded-2xl" />
        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[160px] rounded-2xl" />
          ))}
        </div>
        {/* Quick links skeleton */}
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

  // Gauge max values (for ring fill proportion)
  const maxSales = Math.max(rep.total_sales, 50);
  const maxRank = 20;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* ── Level-Up Celebration Overlay ── */}
      {showLevelUp && levelUpInfo && (
        <LevelUpOverlay
          levelUpInfo={levelUpInfo}
          onDismiss={() => setShowLevelUp(false)}
        />
      )}

      {/* ── Hero Player Card ── */}
      <div className="relative rep-slide-up">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[var(--rep-accent)]/[0.04] via-transparent to-transparent pointer-events-none" />
        <div className="text-center py-2">
          {/* Avatar with tier ring */}
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

          {/* Level badge + rank */}
          <div className="flex items-center justify-center gap-2 mt-2">
            <Badge
              className={cn(
                "gap-1.5 px-4 py-1.5 rep-badge-shimmer border",
              )}
              style={{
                backgroundColor: `${tier.color}15`,
                borderColor: `${tier.color}30`,
                color: tier.color,
              }}
            >
              <Zap size={12} />
              Level {rep.level} — {data.level_name}
            </Badge>
            {data.leaderboard_position && (
              <span
                className="text-sm font-bold font-mono tabular-nums"
                style={{ color: tier.color }}
              >
                #{data.leaderboard_position}
              </span>
            )}
          </div>

          {/* XP progress bar */}
          <div className="mt-4 mx-auto max-w-xs">
            <Progress
              value={xpAnimated ? Math.min(100, Math.max(0, levelProgress)) : 0}
              className="h-2.5"
              indicatorClassName="rep-xp-fill transition-all duration-1000 ease-out"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
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

      {/* ── Weapon Card (Discount Code) ── */}
      {data.discount_codes.length > 0 && (
        <div
          className={cn(
            "rep-weapon-card rep-slide-up",
            copyFlash && "rep-copy-flash"
          )}
          style={{ animationDelay: "50ms" }}
        >
          <div className="rep-weapon-grid" />
          <div className="p-5" style={{ position: "relative", zIndex: 1 }}>
            <div className="flex items-center gap-2 mb-3">
              <Flame size={14} className="text-primary" />
              <span
                className="text-[9px] uppercase tracking-[2px] font-bold px-2 py-0.5 rounded-md"
                style={{ backgroundColor: `${tier.color}15`, color: tier.color }}
              >
                Your Weapon
              </span>
            </div>
            <p
              className="text-[28px] font-black font-mono tracking-[6px] text-foreground mb-1"
              style={{ textShadow: "0 0 24px rgba(139, 92, 246, 0.2)" }}
            >
              {data.discount_codes[0].code}
            </p>
            <p className="text-[11px] text-muted-foreground mb-4">
              Share this code — every sale earns you <span className="text-primary font-bold">+10 XP</span>
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => copyCode(data.discount_codes[0].code)}
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                {copiedCode ? "Copied" : "Copy"}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareCode(data.discount_codes[0].code)}
                >
                  <Share2 size={12} />
                  Share
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Grid — Radial HUD Gauges ── */}
      <div className="grid grid-cols-3 gap-3 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <Link href="/rep/points">
          <RadialGauge
            value={rep.points_balance}
            max={data.next_level_points || rep.points_balance || 100}
            color="#8B5CF6"
            icon={Zap}
            label="XP"
            displayValue={String(statsReady ? rep.points_balance : 0)}
            enabled={statsReady}
          />
        </Link>
        <Link href="/rep/sales">
          <RadialGauge
            value={rep.total_sales}
            max={maxSales}
            color="#F97316"
            icon={Flame}
            label="Sold"
            displayValue={String(statsReady ? rep.total_sales : 0)}
            enabled={statsReady}
          />
        </Link>
        <Link href="/rep/leaderboard">
          <RadialGauge
            value={data.leaderboard_position ? maxRank - data.leaderboard_position + 1 : 0}
            max={maxRank}
            color="#F59E0B"
            icon={Trophy}
            label="Rank"
            displayValue={data.leaderboard_position ? `#${data.leaderboard_position}` : "—"}
            enabled={statsReady}
          />
        </Link>
      </div>

      {/* ── Active Missions (Battle Feed) ── */}
      {data.active_events.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "150ms" }}>
          <div className="rep-hud-header">
            <div className="rep-hud-header-diamond" />
            <span className="rep-hud-header-text">Active Missions</span>
            <div className="rep-hud-header-line" />
          </div>
          <div className="space-y-2">
            {data.active_events.map((event) => (
              <Link key={event.id} href="/rep/sales">
                <div className="rep-mission-card">
                  {/* Ambient event cover image */}
                  {event.cover_image && (
                    <div className="rep-mission-ambient">
                      <img src={event.cover_image} alt="" />
                    </div>
                  )}
                  <div className="rep-mission-content p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="rep-live-dot shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{event.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Flame size={10} className="text-orange-400" />
                            {event.sales_count} ticket{event.sales_count !== 1 ? "s" : ""}
                          </span>
                          {event.revenue > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-success">
                              <TrendingUp size={10} />
                              £{Number(event.revenue).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground shrink-0" />
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
          <Card className="py-0 gap-0 rep-card-lift" style={{ minHeight: "88px" }}>
            <CardContent className="p-4 flex items-center gap-3 h-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shrink-0">
                <Compass size={20} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Side Quests</p>
                  {data.active_quests > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[9px] font-bold text-white rep-notification-badge">
                      {data.active_quests}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{data.active_quests} active</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/rep/rewards">
          <Card className="py-0 gap-0 rep-card-lift" style={{ minHeight: "88px" }}>
            <CardContent className="p-4 flex items-center gap-3 h-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/10 shrink-0">
                <Gift size={20} className="text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Rewards</p>
                  {data.pending_rewards > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[9px] font-bold text-white rep-notification-badge">
                      {data.pending_rewards}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {data.pending_rewards > 0 ? `${data.pending_rewards} pending` : "Shop & milestones"}
                </p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Recent Activity (Battle Log) ── */}
      {data.recent_sales.length > 0 && (
        <div className="rep-slide-up" style={{ animationDelay: "250ms" }}>
          <div className="rep-hud-header">
            <div className="rep-hud-header-diamond" />
            <span className="rep-hud-header-text">Recent Activity</span>
            <div className="rep-hud-header-line" />
          </div>
          <div className="space-y-2">
            {data.recent_sales.map((sale, i) => (
              <Card
                key={sale.id}
                className="py-0 gap-0 rep-slide-up"
                style={{ animationDelay: `${280 + i * 40}ms` }}
              >
                <CardContent className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
                      <TrendingUp size={14} className="text-success" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-foreground">{sale.order_number}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(sale.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-primary">
                      <Zap size={9} />+10
                    </span>
                    <p className="text-sm font-bold font-mono text-success tabular-nums">
                      £{Number(sale.total).toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Link
            href="/rep/sales"
            className="flex items-center justify-center gap-1 mt-3 text-[11px] text-primary hover:underline"
          >
            View all sales <ChevronRight size={12} />
          </Link>
        </div>
      )}

      {/* ── Arena CTA (Leaderboard) ── */}
      <Link href="/rep/leaderboard">
        <Card
          className="py-0 gap-0 border-transparent bg-[var(--rep-gold)]/5 rep-gradient-border-gold rep-card-lift rep-slide-up overflow-hidden"
          style={{ animationDelay: "300ms" }}
        >
          <div className="absolute inset-[1px] rounded-[inherit] bg-[var(--rep-card)] z-[-1]" />
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--rep-gold)]/15">
                <Trophy size={22} className="text-[var(--rep-gold)]" style={{ filter: "drop-shadow(0 0 6px rgba(245, 158, 11, 0.4))" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Arena</p>
                <p className="text-[11px] text-muted-foreground">
                  {data.leaderboard_position
                    ? <>Ranked <span className="font-mono font-bold text-[var(--rep-gold)]">#{data.leaderboard_position}</span> — challenge your crew</>
                    : "See where you stand"}
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[var(--rep-gold)]/60 animate-[pulse_2s_ease-in-out_infinite]" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

// ─── Animated Number ─────────────────────────────────────────────────────────

function AnimatedNumber({ value, enabled }: { value: number; enabled: boolean }) {
  const display = useCountUp(value, 800, enabled);
  return <>{display}</>;
}

// ─── Level Up Overlay ────────────────────────────────────────────────────────

function LevelUpOverlay({ levelUpInfo, onDismiss }: { levelUpInfo: { level: number; name: string }; onDismiss: () => void }) {
  return (
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
          onClick={onDismiss}
          className="mt-8 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
