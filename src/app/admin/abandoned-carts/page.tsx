"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ShoppingCart,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Package,
  Flame,
  Zap,
  Send,
  MailWarning,
  Timer,
  PartyPopper,
  CircleDot,
  X,
  Check,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import { generateNickname } from "@/lib/nicknames";
import type { AbandonedCart } from "@/types/orders";

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours}h ${totalMinutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/* ── Urgency ── */
function getUrgency(cart: AbandonedCart): {
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  icon: typeof Flame;
  pulse: boolean;
} {
  if (cart.status === "recovered") {
    return {
      label: "RECOVERED",
      color: "#10b981",
      bg: "rgba(16,185,129,0.06)",
      border: "rgba(16,185,129,0.2)",
      glow: "0 0 16px rgba(16,185,129,0.15)",
      icon: PartyPopper,
      pulse: false,
    };
  }
  if (cart.status === "expired") {
    return {
      label: "EXPIRED",
      color: "#71717a",
      bg: "rgba(113,113,122,0.04)",
      border: "rgba(113,113,122,0.12)",
      glow: "none",
      icon: AlertCircle,
      pulse: false,
    };
  }
  const elapsed = Date.now() - new Date(cart.created_at).getTime();
  const hours = elapsed / (1000 * 60 * 60);
  if (hours < 1) {
    return {
      label: "HOT",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
      glow: "0 0 20px rgba(239,68,68,0.2)",
      icon: Flame,
      pulse: true,
    };
  }
  if (hours < 24) {
    return {
      label: "WARM",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.06)",
      border: "rgba(245,158,11,0.2)",
      glow: "0 0 16px rgba(245,158,11,0.15)",
      icon: Zap,
      pulse: true,
    };
  }
  return {
    label: "COOLING",
    color: "#71717a",
    bg: "rgba(113,113,122,0.04)",
    border: "rgba(113,113,122,0.12)",
    glow: "none",
    icon: Clock,
    pulse: false,
  };
}

/* ── Recovery roadmap steps ── */
interface RoadmapStep {
  label: string;
  detail: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  status: "completed" | "active" | "upcoming" | "skipped";
  timestamp?: string;
  color: string;
  glowColor: string;
}

function getRecoveryRoadmap(cart: AbandonedCart): RoadmapStep[] {
  const createdAt = new Date(cart.created_at).getTime();
  const now = Date.now();
  const elapsed = now - createdAt;
  const isRecovered = cart.status === "recovered";

  const THIRTY_MIN = 30 * 60 * 1000;
  const TWENTY_FOUR_HR = 24 * 60 * 60 * 1000;
  const FORTY_EIGHT_HR = 48 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  const steps: RoadmapStep[] = [];

  steps.push({
    label: "Cart Abandoned",
    detail: "Captured at checkout",
    icon: ShoppingCart,
    status: "completed",
    timestamp: cart.created_at,
    color: "#f59e0b",
    glowColor: "rgba(245,158,11,0.3)",
  });

  const email1Sent = cart.notification_count >= 1;
  const email1Due = createdAt + THIRTY_MIN;
  if (isRecovered && !email1Sent) {
    steps.push({ label: "Recovery Email #1", detail: "Recovered before email needed", icon: Send, status: "skipped", color: "#71717a", glowColor: "transparent" });
  } else {
    steps.push({
      label: "Recovery Email #1",
      detail: email1Sent ? "Nudge email delivered" : elapsed >= THIRTY_MIN ? "Ready to send" : `Scheduled — ${formatCountdown(email1Due - now)}`,
      icon: Send,
      status: email1Sent ? "completed" : elapsed >= THIRTY_MIN ? "active" : "upcoming",
      timestamp: email1Sent && cart.notified_at ? cart.notified_at : undefined,
      color: "#8B5CF6",
      glowColor: "rgba(139,92,246,0.3)",
    });
  }

  const email2Sent = cart.notification_count >= 2;
  const email2Due = createdAt + TWENTY_FOUR_HR;
  if (isRecovered && !email2Sent) {
    steps.push({ label: "Recovery Email #2", detail: "Recovered before email needed", icon: MailWarning, status: "skipped", color: "#71717a", glowColor: "transparent" });
  } else {
    steps.push({
      label: "Recovery Email #2",
      detail: email2Sent ? "Urgency email delivered" : elapsed >= TWENTY_FOUR_HR ? "Ready to send" : `Scheduled — ${formatCountdown(email2Due - now)}`,
      icon: MailWarning,
      status: email2Sent ? "completed" : elapsed >= TWENTY_FOUR_HR ? "active" : "upcoming",
      color: "#f97316",
      glowColor: "rgba(249,115,22,0.3)",
    });
  }

  const email3Sent = cart.notification_count >= 3;
  const email3Due = createdAt + FORTY_EIGHT_HR;
  if (isRecovered && !email3Sent) {
    steps.push({ label: "Final Reminder", detail: "Recovered before reminder needed", icon: Flame, status: "skipped", color: "#71717a", glowColor: "transparent" });
  } else {
    steps.push({
      label: "Final Reminder",
      detail: email3Sent ? "Last chance email delivered" : elapsed >= FORTY_EIGHT_HR ? "Ready to send" : `Scheduled — ${formatCountdown(email3Due - now)}`,
      icon: Flame,
      status: email3Sent ? "completed" : elapsed >= FORTY_EIGHT_HR ? "active" : "upcoming",
      color: "#ef4444",
      glowColor: "rgba(239,68,68,0.3)",
    });
  }

  if (isRecovered) {
    steps.push({ label: "Recovered!", detail: "Converted to order", icon: PartyPopper, status: "completed", timestamp: cart.recovered_at, color: "#10b981", glowColor: "rgba(16,185,129,0.4)" });
  } else if (cart.status === "expired") {
    steps.push({ label: "Expired", detail: "Cart window closed", icon: X, status: "completed", color: "#71717a", glowColor: "transparent" });
  } else {
    const expiresAt = createdAt + SEVEN_DAYS;
    steps.push({
      label: "Cart Expires",
      detail: elapsed >= SEVEN_DAYS ? "Expiring soon" : `Expires in ${formatCountdown(expiresAt - now)}`,
      icon: Timer,
      status: "upcoming",
      color: "#71717a",
      glowColor: "transparent",
    });
  }

  return steps;
}

/* ═══ Expanded cart detail with roadmap ═══ */
function CartRoadmap({ cart }: { cart: AbandonedCart }) {
  const roadmap = getRecoveryRoadmap(cart);
  const urgency = getUrgency(cart);
  const isRecovered = cart.status === "recovered";

  return (
    <div className="border-t px-6 pb-5 pt-4" style={{ borderColor: urgency.border, background: urgency.bg }}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Roadmap timeline */}
        <div className="lg:col-span-3">
          <h4 className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground/60">
            <CircleDot size={11} />
            Recovery Roadmap
          </h4>
          <div className="relative space-y-0">
            {roadmap.map((step, i) => {
              const StepIcon = step.icon;
              const isLast = i === roadmap.length - 1;
              const isActive = step.status === "active";
              const isCompleted = step.status === "completed";
              const isSkipped = step.status === "skipped";

              return (
                <div key={i} className="relative flex items-start gap-4">
                  {!isLast && (
                    <div
                      className="absolute left-[15px] top-[32px] w-0.5"
                      style={{
                        height: "calc(100% - 16px)",
                        background: isCompleted
                          ? `linear-gradient(to bottom, ${step.color}, ${roadmap[i + 1]?.color || step.color})`
                          : "rgba(255,255,255,0.06)",
                      }}
                    />
                  )}
                  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: isCompleted || isActive ? `${step.color}18` : isSkipped ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)",
                        boxShadow: isActive ? `0 0 16px ${step.glowColor}, inset 0 0 0 1.5px ${step.color}` : isCompleted ? `inset 0 0 0 1.5px ${step.color}60` : "none",
                      }}
                    >
                      {isCompleted && !isSkipped ? (
                        <Check size={12} style={{ color: step.color }} />
                      ) : isSkipped ? (
                        <span className="text-[10px] text-muted-foreground/30">&mdash;</span>
                      ) : (
                        <StepIcon size={13} style={{ color: isActive ? step.color : "rgba(255,255,255,0.15)" }} />
                      )}
                    </div>
                    {isActive && (
                      <span className="absolute inset-0 animate-ping rounded-full opacity-15" style={{ backgroundColor: step.color }} />
                    )}
                  </div>
                  <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[12px] font-semibold uppercase tracking-wider"
                        style={{ color: isCompleted || isActive ? step.color : isSkipped ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.3)" }}
                      >
                        {step.label}
                      </span>
                      {isActive && (
                        <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: step.color, boxShadow: `0 0 6px ${step.color}` }} />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px]" style={{ color: isSkipped ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)" }}>
                      {step.detail}
                    </p>
                    {step.timestamp && (
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/40">
                        {formatDateTime(step.timestamp)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cart contents + customer */}
        <div className="lg:col-span-2">
          <h4 className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground/60">
            <Package size={11} />
            Cart Contents
          </h4>
          <div className="space-y-2">
            {cart.items?.map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-foreground">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {item.qty}x @ {formatCurrency(item.price)}
                    {item.merch_size && ` — Size ${item.merch_size}`}
                  </p>
                </div>
                <span className="ml-3 shrink-0 font-mono text-[12px] font-semibold tabular-nums text-foreground/70">
                  {formatCurrency(item.price * item.qty)}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-3 flex items-center justify-between rounded-lg border px-3.5 py-3" style={{ borderColor: urgency.border, backgroundColor: urgency.bg }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: urgency.color }}>
              {isRecovered ? "Recovered Value" : "Revenue at Risk"}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums" style={{ color: urgency.color }}>
              {formatCurrency(cart.subtotal)}
            </span>
          </div>

          {/* Customer link */}
          {cart.customer && (
            <Link
              href={`/admin/customers/${cart.customer.id}/`}
              className="mt-3 flex items-center gap-2 rounded-lg border border-border/30 bg-background/40 px-3.5 py-2.5 text-[11px] text-primary transition-colors hover:bg-primary/5"
              onClick={(e) => e.stopPropagation()}
            >
              View customer profile &rarr;
            </Link>
          )}

          {isRecovered && cart.recovered_at && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/8 px-3.5 py-2.5">
              <PartyPopper size={14} className="text-emerald-400" />
              <div>
                <p className="text-[11px] font-semibold text-emerald-400">Cart Recovered</p>
                <p className="text-[10px] text-emerald-400/60">{formatDateTime(cart.recovered_at)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AbandonedCartStats {
  total: number;
  abandoned: number;
  recovered: number;
  total_value: number;
  recovered_value: number;
}

/* ════════════════════════════════════════════════════════
   ABANDONED CARTS PAGE — gamified dashboard
   ════════════════════════════════════════════════════════ */
export default function AbandonedCartsPage() {
  const router = useRouter();
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AbandonedCartStats>({
    total: 0,
    abandoned: 0,
    recovered: 0,
    total_value: 0,
    recovered_value: 0,
  });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const loadCarts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);

    try {
      const res = await fetch(`/api/abandoned-carts?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(`API error (${res.status}): ${json.error || "Unknown error"}`);
        setLoading(false);
        return;
      }

      if (json.data) {
        setCarts(json.data);
        setTotal(json.total || json.data.length);
      }
      if (json.stats) {
        setStats(json.stats);
      }
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : "Failed to fetch carts"}`);
    }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(loadCarts, 300);
    return () => clearTimeout(debounce);
  }, [loadCarts]);

  const recoveryRate = stats.total > 0
    ? ((stats.recovered / stats.total) * 100).toFixed(0)
    : "0";
  const lostRevenue = stats.total_value - stats.recovered_value;

  // Count hot carts (< 1hr old, still abandoned)
  const hotCount = carts.filter((c) => {
    if (c.status !== "abandoned") return false;
    return (Date.now() - new Date(c.created_at).getTime()) < 60 * 60 * 1000;
  }).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
            Abandoned Carts
          </h1>
          {hotCount > 0 && (
            <Badge variant="destructive" className="gap-1 text-[10px] font-bold uppercase">
              <Flame size={10} />
              {hotCount} hot
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Track and recover lost revenue from incomplete checkouts
        </p>
      </div>

      {/* Stats — gamified cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {/* Revenue at Risk */}
        <div
          className="relative overflow-hidden rounded-xl border p-5"
          style={{
            borderColor: stats.abandoned > 0 ? "rgba(239,68,68,0.2)" : "var(--color-border)",
            background: stats.abandoned > 0
              ? "linear-gradient(135deg, rgba(239,68,68,0.04), rgba(245,158,11,0.02))"
              : "var(--color-card)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
              <DollarSign size={14} className="text-red-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Revenue at Risk</span>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-red-400">{formatCurrency(lostRevenue)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">{stats.abandoned} abandoned cart{stats.abandoned !== 1 ? "s" : ""}</p>
          {stats.abandoned > 0 && (
            <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-red-500/5" />
          )}
        </div>

        {/* Recovered */}
        <div
          className="relative overflow-hidden rounded-xl border p-5"
          style={{
            borderColor: stats.recovered > 0 ? "rgba(16,185,129,0.2)" : "var(--color-border)",
            background: stats.recovered > 0
              ? "linear-gradient(135deg, rgba(16,185,129,0.04), rgba(52,211,153,0.02))"
              : "var(--color-card)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
              <PartyPopper size={14} className="text-emerald-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Recovered</span>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-emerald-400">{formatCurrency(stats.recovered_value)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">{stats.recovered} cart{stats.recovered !== 1 ? "s" : ""} saved</p>
        </div>

        {/* Recovery Rate */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <TrendingUp size={14} className="text-primary" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Recovery Rate</span>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">{recoveryRate}%</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(Number(recoveryRate), 100)}%`,
                background: Number(recoveryRate) >= 30 ? "#10b981" : Number(recoveryRate) >= 15 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/60">{stats.recovered} of {stats.total} total</p>
        </div>

        {/* Awaiting Email */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
              <Send size={14} className="text-amber-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Awaiting Email</span>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
            {carts.filter((c) => c.status === "abandoned" && c.notification_count === 0).length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">Ready for recovery outreach</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5">
          {[
            { value: "", label: "All", count: stats.total },
            { value: "abandoned", label: "Abandoned", count: stats.abandoned },
            { value: "recovered", label: "Recovered", count: stats.recovered },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                statusFilter === opt.value
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-border hover:bg-card"
              }`}
            >
              {opt.label}
              {opt.count > 0 && (
                <span className={`font-mono text-[9px] ${statusFilter === opt.value ? "text-primary/60" : "text-muted-foreground/40"}`}>
                  {opt.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Carts list */}
      <div className="mt-4 space-y-3">
        {error ? (
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-lg bg-destructive/10 p-3">
                <ShoppingCart size={24} className="text-destructive" />
              </div>
              <p className="mt-3 text-sm font-medium text-destructive">Failed to load abandoned carts</p>
              <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">{error}</p>
              <button
                onClick={() => loadCarts()}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading abandoned carts...</p>
              </div>
            </CardContent>
          </Card>
        ) : carts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <ShoppingCart size={28} className="text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {search || statusFilter ? "No matches found" : "No abandoned carts yet"}
              </p>
              {!search && !statusFilter && (
                <p className="mt-1 text-xs text-muted-foreground/50">
                  Carts are captured when customers enter their email at checkout
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          carts.map((cart) => {
            const urgency = getUrgency(cart);
            const UrgencyIcon = urgency.icon;
            const isExpanded = expandedRow === cart.id;
            const itemCount = cart.items?.reduce((sum, i) => sum + i.qty, 0) || 0;
            const name = [cart.first_name, cart.last_name].filter(Boolean).join(" ");
            const displayName = name || (cart.email ? generateNickname(cart.email) : "Unknown");
            const isRecovered = cart.status === "recovered";

            return (
              <div
                key={cart.id}
                className="overflow-hidden rounded-xl border transition-all duration-300"
                style={{
                  borderColor: isExpanded ? urgency.border : "var(--color-border)",
                  boxShadow: isExpanded ? urgency.glow : "none",
                }}
              >
                {/* Row header */}
                <button
                  type="button"
                  onClick={() => setExpandedRow(isExpanded ? null : cart.id)}
                  className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/20"
                >
                  {/* Urgency icon */}
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: urgency.bg }}>
                    <UrgencyIcon size={16} style={{ color: urgency.color }} />
                    {urgency.pulse && (
                      <span className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ backgroundColor: urgency.color }} />
                    )}
                  </div>

                  {/* Customer + event info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: name ? "var(--color-foreground)" : "#a855f7" }}
                      >
                        {displayName}
                      </span>
                      <Badge
                        variant={isRecovered ? "success" : cart.status === "expired" ? "secondary" : "warning"}
                        className="text-[9px] font-bold uppercase"
                      >
                        {urgency.label}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{cart.email}</span>
                      <span className="text-muted-foreground/30">|</span>
                      <span>{cart.event?.name || "—"}</span>
                      <span className="text-muted-foreground/30">|</span>
                      <span className="flex items-center gap-1">
                        <Package size={11} />
                        {itemCount} item{itemCount !== 1 ? "s" : ""}
                      </span>
                      <span className="text-muted-foreground/30">|</span>
                      <span>{timeAgo(cart.created_at)}</span>
                    </div>
                  </div>

                  {/* Value + expand */}
                  <div className="flex items-center gap-3">
                    {cart.status === "abandoned" && cart.notification_count > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-primary/60">
                        <Send size={10} />
                        {cart.notification_count}
                      </div>
                    )}
                    <span
                      className="font-mono text-lg font-bold tabular-nums"
                      style={{ color: isRecovered ? "#10b981" : urgency.color }}
                    >
                      {formatCurrency(cart.subtotal)}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-muted-foreground/50 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                {/* Expanded roadmap */}
                {isExpanded && <CartRoadmap cart={cart} />}
              </div>
            );
          })
        )}
      </div>

      {/* Total count */}
      {!loading && carts.length > 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground/50">
          Showing {carts.length} of {total} abandoned carts
        </p>
      )}
    </div>
  );
}
