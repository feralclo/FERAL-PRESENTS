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
  Calendar,
  MapPin,
  Plus,
  Loader2,
  Clock,
  Sparkles,
  Target,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RadialGauge, LevelUpOverlay, WelcomeOverlay, CurrencyIcon } from "@/components/rep";
import { getTierFromLevel } from "@/lib/rep-tiers";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";

interface DashboardData {
  rep: {
    id: string;
    first_name: string;
    display_name?: string;
    photo_url?: string;
    points_balance: number;
    currency_balance: number;
    total_sales: number;
    total_revenue: number;
    level: number;
    onboarding_completed: boolean;
    status?: string;
  };
  currency_name: string;
  level_name: string;
  next_level_points: number | null;
  current_level_points: number;
  leaderboard_position: number | null;
  active_quests: number;
  pending_rewards: number;
  active_events: { id: string; name: string; slug: string; sales_count: number; revenue: number; cover_image?: string }[];
  discoverable_events: { id: string; name: string; slug: string; date_start?: string; cover_image?: string; venue_name?: string }[];
  recent_sales: { id: string; order_number: string; total: number; created_at: string; points_earned?: number }[];
  discount_codes: { code: string }[];
  settings?: { points_per_sale: number; currency_per_sale: number };
  public_url: string | null;
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
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [dashRes, discountRes, settingsRes] = await Promise.all([
          fetch("/api/rep-portal/dashboard"),
          fetch("/api/rep-portal/discount"),
          fetch("/api/rep-portal/settings"),
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
        const settingsJson = settingsRes.ok ? await settingsRes.json() : { data: null };

        if (dashJson.data) {
          const d = {
            ...dashJson.data,
            discount_codes: discountJson.data || [],
            settings: settingsJson.data || undefined,
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

          // Check if first visit (onboarding) — uses server-side flag
          if (!d.rep.onboarding_completed) {
            setShowWelcome(true);
          }
          // Clean up legacy localStorage key
          try { localStorage.removeItem("rep_onboarded"); } catch { /* noop */ }

          // Animate XP bar and stats after load
          setTimeout(() => setXpAnimated(true), 300);
          setTimeout(() => setStatsReady(true), 150);
        }
      } catch { setError("Failed to load dashboard — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  const getShareUrl = (code: string) => {
    if (!data?.public_url) return null;
    return `${data.public_url}?ref=${code}`;
  };

  const copyCode = async (code: string) => {
    try {
      const url = getShareUrl(code);
      await navigator.clipboard.writeText(url || code);
      setCopiedCode(true);
      setCopyFlash(true);
      setTimeout(() => setCopiedCode(false), 2000);
      setTimeout(() => setCopyFlash(false), 400);
    } catch {
      /* clipboard not available */
    }
  };

  const shareCode = async (code: string) => {
    const url = getShareUrl(code);
    try {
      await navigator.share({
        text: `Use my code ${code} for a discount!`,
        ...(url ? { url } : {}),
      });
    } catch {
      // Fallback to copy
      copyCode(code);
    }
  };

  const joinEvent = async (eventId: string) => {
    setJoiningEventId(eventId);
    try {
      const res = await fetch("/api/rep-portal/join-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) {
        // Reload dashboard to reflect new assignment
        setLoadKey((k) => k + 1);
      }
    } catch { /* ignore */ }
    setJoiningEventId(null);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
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
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      {/* ── Welcome Onboarding Overlay (first visit) ── */}
      {showWelcome && (
        <WelcomeOverlay
          repName={rep.display_name || rep.first_name}
          displayName={rep.display_name || ""}
          photoUrl={rep.photo_url || ""}
          discountCode={data.discount_codes[0]?.code}
          isPending={rep.status === "pending"}
          onDismiss={() => { setShowWelcome(false); setLoadKey((k) => k + 1); }}
        />
      )}

      {/* ── Level-Up Celebration Overlay ── */}
      {showLevelUp && levelUpInfo && (
        <LevelUpOverlay
          newLevel={levelUpInfo.level}
          onDismiss={() => setShowLevelUp(false)}
        />
      )}

      {/* ── Pending Rep Dashboard ── */}
      {rep.status === "pending" && !showWelcome && (
        <PendingDashboard repName={rep.display_name || rep.first_name} photoUrl={rep.photo_url} />
      )}

      {/* ── Active Rep Dashboard ── */}
      {rep.status !== "pending" && (
        <>
      {/* ── Hero Player Card ── */}
      <div className="relative rep-slide-up rep-hero-banner">
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
                "gap-1.5 px-4 py-1.5 border",
                tier.name === "Mythic" && "rep-badge-shimmer",
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

      {/* ── Discount Code ── */}
      {data.discount_codes.length > 0 && (
        <div
          className={cn(
            "rep-surface-2 rounded-2xl border-primary/15 rep-slide-up",
            copyFlash && "rep-copy-flash"
          )}
          style={{ animationDelay: "50ms" }}
        >
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Flame size={14} className="text-primary" />
              <span
                className="text-[10px] uppercase tracking-[2px] font-bold px-2 py-0.5 rounded-md"
                style={{ backgroundColor: `${tier.color}15`, color: tier.color }}
              >
                Your Code
              </span>
            </div>
            <p
              className="text-[28px] font-black font-mono tracking-[6px] text-foreground mb-1"
            >
              {data.discount_codes[0].code}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Share your link — every sale earns you{" "}
              <span className="text-primary font-bold">+{data.settings?.points_per_sale ?? 10} XP</span>{" "}
              <span className="text-amber-400 font-bold">+{data.settings?.currency_per_sale ?? 10} {data.currency_name}</span>
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => copyCode(data.discount_codes[0].code)}
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                {copiedCode ? "Copied!" : "Copy Link"}
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

      {/* ── Stats Grid — XP gauge, Currency card, Sold gauge ── */}
      <div className="grid grid-cols-3 gap-3 rep-slide-up" style={{ animationDelay: "100ms" }}>
        <Link href="/rep/points">
          <GaugeWithCounter
            value={rep.points_balance}
            max={data.next_level_points || rep.points_balance || 100}
            color="#8B5CF6"
            icon={Zap}
            label="XP"
            enabled={statsReady}
          />
        </Link>
        <Link href="/rep/rewards">
          <GaugeWithCounter
            value={rep.currency_balance ?? 0}
            max={Math.max((rep.currency_balance ?? 0) * 1.5, 200)}
            color="#FBBF24"
            icon={CurrencyIcon}
            label={data.currency_name}
            enabled={statsReady}
          />
        </Link>
        <Link href="/rep/sales">
          <GaugeWithCounter
            value={rep.total_sales}
            max={maxSales}
            color="#F97316"
            icon={Flame}
            label="Sold"
            enabled={statsReady}
          />
        </Link>
      </div>

      {/* ── Rank Bar ── */}
      <Link href="/rep/leaderboard" className="block rep-slide-up" style={{ animationDelay: "120ms" }}>
        <div className="rep-surface-1 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Trophy size={16} className="text-amber-400" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">Leaderboard Rank</span>
          </div>
          <span className="text-lg font-extrabold font-mono tabular-nums text-amber-400">
            {data.leaderboard_position ? `#${data.leaderboard_position}` : "—"}
          </span>
        </div>
      </Link>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 gap-3 rep-slide-up" style={{ animationDelay: "200ms" }}>
        <Link href="/rep/quests">
          <Card className="py-0 gap-0 rep-action-hover" style={{ minHeight: "88px" }}>
            <CardContent className="p-4 flex items-center gap-3 h-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shrink-0">
                <Compass size={20} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Quests</p>
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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-400/10 shrink-0">
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
                <p className="text-xs text-muted-foreground">
                  {data.pending_rewards > 0 ? `${data.pending_rewards} pending` : "Shop & milestones"}
                </p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Discover Events ── */}
      {data.discoverable_events && data.discoverable_events.length > 0 && (
        <div className="space-y-3 rep-slide-up" style={{ animationDelay: "225ms" }}>
          <div className="flex items-center gap-2 px-1">
            <Calendar size={14} className="text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-[2px] text-muted-foreground">
              Join Events
            </h2>
          </div>
          {data.discoverable_events.map((event) => (
            <Card key={event.id} className="py-0 gap-0 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-3 p-3">
                  {event.cover_image ? (
                    <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0 bg-muted/50">
                      <img src={event.cover_image} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-14 w-14 rounded-xl shrink-0 bg-primary/10 flex items-center justify-center">
                      <Calendar size={20} className="text-primary/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{event.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {event.date_start && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(event.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      {event.venue_name && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MapPin size={8} />
                          {event.venue_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => joinEvent(event.id)}
                    disabled={joiningEventId === event.id}
                    className="shrink-0 rounded-xl"
                  >
                    {joiningEventId === event.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Plus size={12} />
                    )}
                    Join
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Recent Sales (max 2) ── */}
      {data.recent_sales.length > 0 && (
        <div className="space-y-2 rep-slide-up" style={{ animationDelay: "250ms" }}>
          {data.recent_sales.slice(0, 2).map((sale) => (
            <Card
              key={sale.id}
              className="py-0 gap-0 rep-battle-log-entry"
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
                    <Zap size={9} />+{data.settings?.points_per_sale ?? 10}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-400">
                    <CurrencyIcon size={9} />+{data.settings?.currency_per_sale ?? 10}
                  </span>
                  <p className="text-sm font-bold font-mono text-success tabular-nums">
                    £{Number(sale.total).toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      </>
      )}

    </div>
  );
}

// ─── Pending Rep Dashboard ───────────────────────────────────────────────────

function PendingDashboard({ repName, photoUrl }: { repName: string; photoUrl?: string }) {
  const previewFeatures = [
    {
      icon: Flame,
      color: "#F97316",
      bg: "bg-orange-500/10",
      title: "Your Discount Code",
      desc: "Get your unique code to share with friends",
    },
    {
      icon: Compass,
      color: "#8B5CF6",
      bg: "bg-primary/10",
      title: "Bonus Quests",
      desc: "Complete tasks for bonus XP and rewards",
    },
    {
      icon: Trophy,
      color: "#F59E0B",
      bg: "bg-amber-500/10",
      title: "Leaderboard",
      desc: "Compete for the top spot and win prizes",
    },
    {
      icon: Gift,
      color: "#34D399",
      bg: "bg-success/10",
      title: "Reward Shop",
      desc: "Spend earnings on tickets, merch, and more",
    },
  ];

  return (
    <div className="space-y-6 rep-slide-up">
      {/* Welcome header */}
      <div className="text-center py-4">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full overflow-hidden mx-auto mb-4 ring-2 ring-warning/30">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-warning/10">
              <span className="text-3xl font-bold text-warning">
                {repName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <h1 className="text-xl font-bold text-foreground mb-1">
          Welcome, {repName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your profile is all set — you&apos;re almost in
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-2xl border border-warning/15 bg-warning/[0.04] p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10">
            <Clock size={20} className="text-warning" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground mb-1">Application Under Review</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your application is being reviewed by the team. This usually takes less than 24 hours.
              You&apos;ll receive a notification as soon as you&apos;re approved.
            </p>
          </div>
        </div>
      </div>

      {/* What's coming — preview cards */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Sparkles size={14} className="text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-[2px] text-muted-foreground">
            What&apos;s Waiting for You
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {previewFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="py-0 gap-0 opacity-80">
                <CardContent className="p-4">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl mb-3", feature.bg)}>
                    <Icon size={18} style={{ color: feature.color }} />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-0.5">{feature.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Tips */}
      <div className="rounded-2xl border border-border/50 bg-card/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-[2px] text-muted-foreground">While You Wait</h3>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
              <Target size={10} className="text-primary" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">Complete your profile</span> — add your socials and bio in the profile tab
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
              <TrendingUp size={10} className="text-primary" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">Install the app</span> — add it to your home screen for the best experience
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Gauge with Animated Counter ─────────────────────────────────────────────

function GaugeWithCounter({
  value, max, color, icon, label, enabled,
}: {
  value: number; max: number; color: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; label: string; enabled: boolean;
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
