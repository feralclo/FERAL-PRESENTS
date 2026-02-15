"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import { generateNickname } from "@/lib/nicknames";
import type { Customer, AbandonedCart, CustomerSegment } from "@/types/orders";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  ShoppingBag,
  DollarSign,
  CalendarDays,
  Ticket as TicketIcon,
  ChevronRight,
  Package,
  Clock,
  TrendingUp,
  ScanLine,
  Shirt,
  Repeat,
  CreditCard,
  Send,
  AlertCircle,
  UserPlus,
  ShoppingCart,
  Zap,
  Target,
  Crown,
  Sparkles,
  MailWarning,
  Lock,
  Check,
  Star,
  Music,
} from "lucide-react";

/* ── Types ── */
interface CustomerOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  currency: string;
  payment_method: string;
  created_at: string;
  metadata?: Record<string, unknown>;
  event: { name: string; slug: string; date_start: string } | null;
  items?: { qty: number; merch_size?: string; unit_price: number }[];
}

interface CustomerTicket {
  id: string;
  ticket_code: string;
  status: string;
  merch_size?: string;
  merch_collected?: boolean;
  scanned_at?: string;
  scanned_by?: string;
  created_at: string;
  ticket_type: { name: string } | null;
  event: { name: string; slug: string; venue_name?: string; date_start: string } | null;
}

/* ── Status styling ── */
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  completed: "success",
  pending: "warning",
  refunded: "destructive",
  cancelled: "secondary",
  failed: "destructive",
};

/* ── Segment config ── */
const SEGMENT_CONFIG: Record<CustomerSegment, {
  label: string;
  variant: "warning" | "success" | "secondary" | "info";
  icon: typeof Crown;
  color: string;
  description: string;
  /** Raw CSS values for inline styles */
  raw: { color: string; bg: string; border: string; glow: string; barColor: string };
}> = {
  superfan: {
    label: "Superfan",
    variant: "warning",
    icon: Crown,
    color: "text-amber-400",
    description: "The ultimate supporter",
    raw: { color: "#fbbf24", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.4)", glow: "0 0 24px rgba(251,191,36,0.35)", barColor: "#fbbf24" },
  },
  fan: {
    label: "Fan",
    variant: "success",
    icon: Music,
    color: "text-emerald-400",
    description: "Coming back for more",
    raw: { color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.4)", glow: "0 0 24px rgba(52,211,153,0.35)", barColor: "#34d399" },
  },
  new_fan: {
    label: "New Fan",
    variant: "secondary",
    icon: Sparkles,
    color: "text-blue-400",
    description: "Just joined the movement",
    raw: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.4)", glow: "0 0 24px rgba(96,165,250,0.35)", barColor: "#60a5fa" },
  },
  discoverer: {
    label: "Discoverer",
    variant: "info",
    icon: Target,
    color: "text-purple-400",
    description: "Exploring the scene",
    raw: { color: "#a855f7", bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.4)", glow: "0 0 24px rgba(168,85,247,0.35)", barColor: "#a855f7" },
  },
};

/* ── Journey tier definitions ── */
const JOURNEY_TIERS: {
  key: CustomerSegment;
  label: string;
  icon: typeof Crown;
  unlockRequirement: string;
  xpLabel: string;
}[] = [
  {
    key: "discoverer",
    label: "Discoverer",
    icon: Target,
    unlockRequirement: "Enter your email at checkout",
    xpLabel: "Entry point",
  },
  {
    key: "new_fan",
    label: "New Fan",
    icon: Sparkles,
    unlockRequirement: "Complete your first purchase",
    xpLabel: "1 order",
  },
  {
    key: "fan",
    label: "Fan",
    icon: Music,
    unlockRequirement: "Place 2+ orders",
    xpLabel: "2+ orders",
  },
  {
    key: "superfan",
    label: "Superfan",
    icon: Crown,
    unlockRequirement: "Spend £200+ or place 5+ orders",
    xpLabel: "£200+ or 5+ orders",
  },
];

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
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

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function getInitials(first?: string, last?: string, nickname?: string): string {
  if (first || last) {
    return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
  }
  if (nickname) {
    const parts = nickname.split(" ");
    return parts.map((p) => p[0]?.toUpperCase() || "").join("").slice(0, 2);
  }
  return "?";
}

function getSegment(totalSpent: number, totalOrders: number): CustomerSegment {
  if (totalSpent >= 200 || totalOrders >= 5) return "superfan";
  if (totalOrders > 1) return "fan";
  if (totalOrders === 0) return "discoverer";
  return "new_fan";
}

function memberSince(dateStr?: string): string {
  if (!dateStr) return "—";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}+ years ago`;
}

/* ── Timeline ── */
interface TimelineEntry {
  label: string;
  detail?: string;
  time: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  sortDate: Date;
  color?: string;
}

function buildCustomerTimeline(
  customer: Customer,
  orders: CustomerOrder[],
  tickets: CustomerTicket[],
  abandonedCarts: AbandonedCart[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const fmt = (d: string) => formatDateTime(d);

  const isDiscoverer = customer.total_orders === 0;
  entries.push({
    label: isDiscoverer ? "Discoverer captured" : "Customer created",
    detail: isDiscoverer
      ? `${customer.nickname || customer.email} entered the funnel`
      : `${customer.first_name || ""} ${customer.last_name || ""} joined the movement`.trim(),
    time: fmt(customer.created_at),
    icon: isDiscoverer ? Target : UserPlus,
    sortDate: new Date(customer.created_at),
    color: isDiscoverer ? "text-purple-400" : undefined,
  });

  for (const cart of abandonedCarts) {
    const itemCount = cart.items?.reduce((s, i) => s + i.qty, 0) || 0;
    entries.push({
      label: "Cart abandoned",
      detail: `${itemCount} item${itemCount !== 1 ? "s" : ""} — ${formatCurrency(cart.subtotal)}${cart.event?.name ? ` for ${cart.event.name}` : ""}`,
      time: fmt(cart.created_at),
      icon: ShoppingCart,
      sortDate: new Date(cart.created_at),
      color: "text-amber-400",
    });

    if (cart.status === "recovered" && cart.recovered_at) {
      entries.push({
        label: "Cart recovered",
        detail: `Converted to order${cart.event?.name ? ` for ${cart.event.name}` : ""}`,
        time: fmt(cart.recovered_at),
        icon: Zap,
        sortDate: new Date(cart.recovered_at),
        color: "text-emerald-400",
      });
    }
  }

  for (const order of orders) {
    entries.push({
      label: `Order ${order.order_number} placed`,
      detail: `${formatCurrency(Number(order.total))}${order.event?.name ? ` — ${order.event.name}` : ""}`,
      time: fmt(order.created_at),
      icon: ShoppingBag,
      sortDate: new Date(order.created_at),
    });

    if (order.status === "completed") {
      entries.push({
        label: `Payment confirmed`,
        detail: `${order.order_number} via ${order.payment_method}`,
        time: fmt(order.created_at),
        icon: CreditCard,
        sortDate: new Date(new Date(order.created_at).getTime() + 1000),
        color: "text-emerald-400",
      });
    }

    const meta = (order.metadata || {}) as Record<string, unknown>;
    if (meta.email_sent === true && typeof meta.email_sent_at === "string") {
      entries.push({
        label: "Confirmation email sent",
        detail: `for ${order.order_number}`,
        time: fmt(meta.email_sent_at as string),
        icon: Send,
        sortDate: new Date(meta.email_sent_at as string),
      });
    } else if (meta.email_sent === false && typeof meta.email_attempted_at === "string") {
      entries.push({
        label: "Email delivery failed",
        detail: (meta.email_error as string) || `for ${order.order_number}`,
        time: fmt(meta.email_attempted_at as string),
        icon: AlertCircle,
        sortDate: new Date(meta.email_attempted_at as string),
        color: "text-red-400",
      });
    }

    if (order.status === "refunded") {
      entries.push({
        label: `Order ${order.order_number} refunded`,
        detail: formatCurrency(Number(order.total)),
        time: fmt(order.created_at),
        icon: DollarSign,
        sortDate: new Date(new Date(order.created_at).getTime() + 2000),
        color: "text-red-400",
      });
    }
  }

  for (const ticket of tickets) {
    if (ticket.scanned_at) {
      entries.push({
        label: "Ticket scanned at door",
        detail: `${ticket.ticket_code}${ticket.event?.name ? ` — ${ticket.event.name}` : ""}${ticket.scanned_by ? ` by ${ticket.scanned_by}` : ""}`,
        time: fmt(ticket.scanned_at),
        icon: ScanLine,
        sortDate: new Date(ticket.scanned_at),
        color: "text-emerald-400",
      });
    }
  }

  entries.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
  return entries;
}

/* ════════════════════════════════════════════════════════════
   TIER PROGRESS — computes what it takes to reach each tier
   ════════════════════════════════════════════════════════════ */
function getTierProgress(
  tierKey: CustomerSegment,
  totalOrders: number,
  totalSpent: number
): { unlocked: boolean; progressItems: { label: string; current: number; target: number; unit: string }[] } {
  switch (tierKey) {
    case "discoverer":
      return { unlocked: true, progressItems: [] };
    case "new_fan":
      return {
        unlocked: totalOrders >= 1,
        progressItems: [
          { label: "First purchase", current: Math.min(totalOrders, 1), target: 1, unit: "order" },
        ],
      };
    case "fan":
      return {
        unlocked: totalOrders >= 2,
        progressItems: [
          { label: "Orders placed", current: Math.min(totalOrders, 2), target: 2, unit: "orders" },
        ],
      };
    case "superfan": {
      const spendProgress = Math.min(totalSpent, 200);
      const orderProgress = Math.min(totalOrders, 5);
      const unlocked = totalSpent >= 200 || totalOrders >= 5;
      return {
        unlocked,
        progressItems: [
          { label: "Total spent", current: spendProgress, target: 200, unit: "£" },
          { label: "Orders placed", current: orderProgress, target: 5, unit: "orders" },
        ],
      };
    }
  }
}

/* ════════════════════════════════════════════════════════════
   TIER CARD — individual hoverable tier with glow effects
   ════════════════════════════════════════════════════════════ */
function TierCard({
  tier,
  config,
  isUnlocked,
  isCurrent,
  isNext,
  progress,
  totalOrders,
}: {
  tier: (typeof JOURNEY_TIERS)[number];
  config: (typeof SEGMENT_CONFIG)[CustomerSegment];
  isUnlocked: boolean;
  isCurrent: boolean;
  isNext: boolean;
  progress: ReturnType<typeof getTierProgress>;
  totalOrders: number;
}) {
  const [hovered, setHovered] = useState(false);
  const TierIcon = tier.icon;
  const { raw } = config;

  // Compute styles based on hover + state
  const cardStyle: React.CSSProperties = isCurrent
    ? { borderColor: raw.border, backgroundColor: raw.bg, boxShadow: raw.glow }
    : isUnlocked && hovered
      ? { borderColor: raw.border, backgroundColor: raw.bg, boxShadow: raw.glow }
      : {};

  const iconStyle: React.CSSProperties = isCurrent
    ? { backgroundColor: raw.bg, color: raw.color, boxShadow: `inset 0 0 0 2px ${raw.color}` }
    : isUnlocked && hovered
      ? { backgroundColor: raw.bg, color: raw.color, boxShadow: `inset 0 0 0 2px ${raw.color}` }
    : isUnlocked
      ? { color: raw.color }
      : hovered
        ? { color: "rgba(255,255,255,0.45)" }
        : { color: "rgba(255,255,255,0.25)" };

  const labelStyle: React.CSSProperties = isCurrent || (isUnlocked && hovered)
    ? { color: raw.color }
    : isUnlocked
      ? { color: "rgba(255,255,255,0.6)" }
      : hovered
        ? { color: "rgba(255,255,255,0.5)" }
        : { color: "rgba(255,255,255,0.3)" };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`relative flex flex-col items-center gap-2.5 rounded-xl border p-4 transition-all duration-300 ${
            isCurrent || (isUnlocked && hovered)
              ? ""
              : isUnlocked
                ? "border-border/60 bg-card"
                : hovered
                  ? "border-border/60 bg-card/60"
                  : "border-border/40 bg-card/40"
          }`}
          style={cardStyle}
        >
          {/* Tier icon */}
          <div
            className="relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300"
            style={isCurrent || (isUnlocked && hovered)
              ? iconStyle
              : isUnlocked
                ? { ...iconStyle, backgroundColor: "rgba(255,255,255,0.05)" }
                : { ...iconStyle, backgroundColor: "rgba(255,255,255,0.06)" }
            }
          >
            {isUnlocked && !isCurrent ? (
              <div className="relative">
                <TierIcon size={18} />
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check size={8} strokeWidth={3} />
                </span>
              </div>
            ) : !isUnlocked ? (
              <Lock size={16} />
            ) : (
              <TierIcon size={18} />
            )}

            {/* Pulse ring on current */}
            {isCurrent && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ boxShadow: `inset 0 0 0 2px ${raw.color}` }}
              />
            )}
          </div>

          {/* Tier name */}
          <span
            className="text-[11px] font-semibold tracking-wider uppercase transition-colors duration-300"
            style={labelStyle}
          >
            {tier.label}
          </span>

          {/* Current badge */}
          {isCurrent && (
            <span
              className="absolute -top-1.5 right-2 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest"
              style={{ backgroundColor: raw.bg, color: raw.color, boxShadow: `inset 0 0 0 1px ${raw.border}` }}
            >
              Now
            </span>
          )}

          {/* Next tier indicator */}
          {isNext && (
            <span className="absolute -top-1.5 right-2 rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
              Next
            </span>
          )}
        </button>
      </TooltipTrigger>

      {/* ── Hover tooltip ── */}
      <TooltipContent
        side="bottom"
        className="w-64 rounded-xl border border-border bg-card p-0 text-foreground shadow-xl"
      >
        {/* Tooltip header */}
        <div
          className="flex items-center gap-3 rounded-t-xl px-4 py-3"
          style={{ backgroundColor: raw.bg }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: raw.bg, color: raw.color, boxShadow: `inset 0 0 0 1px ${raw.border}` }}
          >
            <TierIcon size={14} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: raw.color }}>
              {tier.label}
            </p>
            <p className="text-[10px] text-muted-foreground">{config.description}</p>
          </div>
          {isUnlocked && (
            <Badge variant="success" className="ml-auto text-[8px] font-bold uppercase">
              <Check size={8} /> Unlocked
            </Badge>
          )}
        </div>

        {/* Requirements */}
        <div className="px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground/60">
            {isUnlocked ? "Requirement met" : "How to unlock"}
          </p>
          <p className="text-xs text-foreground/80">{tier.unlockRequirement}</p>

          {/* Progress indicators */}
          {progress.progressItems.length > 0 && (
            <div className="mt-3 space-y-2.5">
              {progress.progressItems.map((item) => {
                const pct = Math.min((item.current / item.target) * 100, 100);
                const isComplete = item.current >= item.target;
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className={isComplete ? "font-semibold text-emerald-400" : "font-mono text-foreground/70"}>
                        {item.unit === "£"
                          ? `${formatCurrency(item.current)} / ${formatCurrency(item.target)}`
                          : `${item.current} / ${item.target}`
                        }
                      </span>
                    </div>
                    {/* XP bar */}
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isComplete ? "#34d399" : raw.barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Superfan dual-path note */}
              {tier.key === "superfan" && !progress.unlocked && (
                <p className="mt-1 text-center text-[9px] italic text-muted-foreground/50">
                  Either path unlocks Superfan
                </p>
              )}
            </div>
          )}

          {/* Discoverer — no progress needed */}
          {tier.key === "discoverer" && isUnlocked && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400">
              <Check size={10} />
              <span>Entered via checkout</span>
            </div>
          )}

          {/* New Fan — single quest checkbox */}
          {tier.key === "new_fan" && !isUnlocked && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground/50">
              <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                totalOrders >= 1
                  ? "border-emerald-500 bg-emerald-500/20"
                  : "border-muted-foreground/20"
              }`}>
                {totalOrders >= 1 && <Check size={8} className="text-emerald-400" />}
              </div>
              <span>Complete a purchase</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/* ════════════════════════════════════════════════════════════
   GAMIFIED JOURNEY — hoverable tier cards with glow + progress
   ════════════════════════════════════════════════════════════ */
function GamifiedJourney({
  segment,
  totalOrders,
  totalSpent,
}: {
  segment: CustomerSegment;
  totalOrders: number;
  totalSpent: number;
}) {
  const tierOrder: CustomerSegment[] = ["discoverer", "new_fan", "fan", "superfan"];
  const currentIndex = tierOrder.indexOf(segment);

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Star size={15} className="text-primary" />
          Fan Journey
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <TooltipProvider delayDuration={0}>
          <div className="grid grid-cols-4 gap-3">
            {JOURNEY_TIERS.map((tier, i) => {
              const config = SEGMENT_CONFIG[tier.key];
              const isUnlocked = i <= currentIndex;
              const isCurrent = tier.key === segment;
              const isNext = i === currentIndex + 1;
              const progress = getTierProgress(tier.key, totalOrders, totalSpent);

              return (
                <TierCard
                  key={tier.key}
                  tier={tier}
                  config={config}
                  isUnlocked={isUnlocked}
                  isCurrent={isCurrent}
                  isNext={isNext}
                  progress={progress}
                  totalOrders={totalOrders}
                />
              );
            })}
          </div>
        </TooltipProvider>

        {/* Connecting progress line between tiers */}
        <div className="mt-4 flex items-center gap-1 px-8">
          {JOURNEY_TIERS.map((tier, i) => {
            if (i === JOURNEY_TIERS.length - 1) return null;
            const isComplete = i < currentIndex;
            const isActive = i === currentIndex;
            const config = SEGMENT_CONFIG[tier.key];
            return (
              <div key={`line-${tier.key}`} className="flex flex-1 items-center">
                <div
                  className="h-0.5 flex-1 rounded-full transition-all duration-500"
                  style={{
                    background: isComplete
                      ? "rgba(52,211,153,0.5)"
                      : isActive
                        ? `linear-gradient(to right, ${config.raw.color}, rgba(255,255,255,0.05))`
                        : "rgba(255,255,255,0.05)",
                  }}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   ABANDONED CARTS — shows active abandoned carts with status
   ════════════════════════════════════════════════════════════ */
function AbandonedCartsSection({ carts }: { carts: AbandonedCart[] }) {
  if (carts.length === 0) return null;

  const activeCarts = carts.filter((c) => c.status === "abandoned");
  const recoveredCarts = carts.filter((c) => c.status === "recovered");

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShoppingCart size={15} className="text-amber-400" />
            Abandoned Carts
            {activeCarts.length > 0 && (
              <Badge variant="warning" className="text-[10px]">
                {activeCarts.length} active
              </Badge>
            )}
          </CardTitle>
          {recoveredCarts.length > 0 && (
            <span className="text-[11px] text-emerald-400">
              {recoveredCarts.length} recovered
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {carts.map((cart) => {
          const itemCount = cart.items?.reduce((s, i) => s + i.qty, 0) || 0;
          const isAbandoned = cart.status === "abandoned";

          return (
            <div
              key={cart.id}
              className={`flex items-center gap-4 border-b border-border/50 px-5 py-4 last:border-b-0 ${
                isAbandoned ? "bg-amber-500/[0.02]" : ""
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isAbandoned
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {isAbandoned ? <ShoppingCart size={15} /> : <Zap size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                  </span>
                  <Badge
                    variant={isAbandoned ? "warning" : "success"}
                    className="text-[9px]"
                  >
                    {cart.status}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {cart.event?.name && <span>{cart.event.name}</span>}
                  <span>{timeAgo(cart.created_at)}</span>
                </div>
                {isAbandoned && cart.notification_count === 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400/70">
                    <MailWarning size={11} />
                    <span>Awaiting recovery email</span>
                  </div>
                )}
                {isAbandoned && cart.notification_count > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Send size={11} />
                    <span>
                      {cart.notification_count} email{cart.notification_count !== 1 ? "s" : ""} sent
                      {cart.notified_at && ` — last ${timeAgo(cart.notified_at)}`}
                    </span>
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-foreground">
                {formatCurrency(cart.subtotal)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   CUSTOMER PROFILE PAGE
   ════════════════════════════════════════════════════════════ */
export default function CustomerProfilePage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCustomer = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const [customerResult, ordersResult, ticketsResult, cartsResult] = await Promise.all([
      supabase
        .from(TABLES.CUSTOMERS)
        .select("*")
        .eq("id", customerId)
        .eq("org_id", ORG_ID)
        .single(),
      supabase
        .from(TABLES.ORDERS)
        .select("id, order_number, status, total, currency, payment_method, created_at, metadata, event:events(name, slug, date_start), items:order_items(qty, merch_size, unit_price)")
        .eq("customer_id", customerId)
        .eq("org_id", ORG_ID)
        .order("created_at", { ascending: false }),
      supabase
        .from(TABLES.TICKETS)
        .select("id, ticket_code, status, merch_size, merch_collected, scanned_at, scanned_by, created_at, ticket_type:ticket_types(name), event:events(name, slug, venue_name, date_start)")
        .eq("customer_id", customerId)
        .eq("org_id", ORG_ID)
        .order("created_at", { ascending: false }),
      supabase
        .from(TABLES.ABANDONED_CARTS)
        .select("*, event:events(name, slug, date_start)")
        .eq("customer_id", customerId)
        .eq("org_id", ORG_ID)
        .order("created_at", { ascending: false }),
    ]);

    if (customerResult.data) setCustomer(customerResult.data);
    if (ordersResult.data) setOrders(ordersResult.data as unknown as CustomerOrder[]);
    if (ticketsResult.data) setTickets(ticketsResult.data as unknown as CustomerTicket[]);
    if (cartsResult.data) setAbandonedCarts(cartsResult.data as unknown as AbandonedCart[]);

    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading customer...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <User size={40} className="text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Customer not found</p>
        <Link href="/admin/customers/" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft size={14} /> Back to Customers
          </Button>
        </Link>
      </div>
    );
  }

  // Derived data
  const completedOrders = orders.filter((o) => o.status === "completed");
  const totalSpent = completedOrders.reduce((s, o) => s + Number(o.total), 0);
  const avgOrderValue = completedOrders.length > 0 ? totalSpent / completedOrders.length : 0;
  const scannedTickets = tickets.filter((t) => t.scanned_at);
  const eventsAttended = new Set(scannedTickets.map((t) => t.event?.name)).size;

  const merchSpend = completedOrders.reduce((total, order) => {
    const merchItems = (order.items || []).filter((i) => i.merch_size);
    return total + merchItems.reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
  }, 0);

  const latestOrder = orders[0] || null;
  const latestOrderTicketQty = latestOrder
    ? (latestOrder.items || []).reduce((s, i) => s + i.qty, 0)
    : 0;

  // Segment
  const segment = getSegment(totalSpent, customer.total_orders);
  const segmentConfig = SEGMENT_CONFIG[segment];
  const SegmentIcon = segmentConfig.icon;

  // Display name — nickname for discoverers, real name for fans
  const isDiscoverer = segment === "discoverer";
  const displayName = isDiscoverer
    ? (customer.nickname || generateNickname(customer.email))
    : `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.nickname || customer.email;

  const activeAbandonedCarts = abandonedCarts.filter((c) => c.status === "abandoned");

  // Timeline
  const timeline = buildCustomerTimeline(customer, orders, tickets, abandonedCarts);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/admin/customers/"
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={12} /> Back to Customers
      </Link>

      {/* Customer Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar — colored by segment */}
              <div
                className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: segmentConfig.raw.bg,
                  boxShadow: `inset 0 0 0 1px ${segmentConfig.raw.border}`,
                }}
              >
                <span
                  className="font-mono text-lg font-bold"
                  style={{ color: segmentConfig.raw.color }}
                >
                  {getInitials(customer.first_name, customer.last_name, customer.nickname)}
                </span>
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-white"
                  style={{ backgroundColor: segmentConfig.raw.color }}
                >
                  <SegmentIcon size={9} />
                </span>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1
                    className="font-mono text-xl font-bold tracking-wider"
                    style={{ color: segmentConfig.raw.color }}
                  >
                    {displayName}
                  </h1>
                  <Badge variant={segmentConfig.variant} className="text-[10px] font-semibold uppercase">
                    <SegmentIcon size={10} />
                    {segmentConfig.label}
                  </Badge>
                  {customer.total_orders > 2 && (
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      <Repeat size={10} /> Loyal
                    </Badge>
                  )}
                </div>

                {/* Discoverer: show real name as subtitle if available */}
                {isDiscoverer && (customer.first_name || customer.last_name) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    aka {customer.first_name} {customer.last_name}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail size={13} className="text-muted-foreground/50" />
                    {customer.email}
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone size={13} className="text-muted-foreground/50" />
                      {customer.phone}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays size={13} className="text-muted-foreground/50" />
                    {isDiscoverer ? "First seen" : "Member since"} {memberSince(customer.first_order_at || customer.created_at)}
                  </div>
                  {activeAbandonedCarts.length > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-amber-400">
                      <ShoppingCart size={13} />
                      {activeAbandonedCarts.length} abandoned cart{activeAbandonedCarts.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gamified Journey */}
      <div className="mb-6">
        <GamifiedJourney
          segment={segment}
          totalOrders={customer.total_orders}
          totalSpent={totalSpent}
        />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          size="compact"
          label="Orders"
          value={customer.total_orders.toString()}
          icon={ShoppingBag}
        />
        <StatCard
          size="compact"
          label="Lifetime Value"
          value={formatCurrency(totalSpent)}
          icon={DollarSign}
        />
        <StatCard
          size="compact"
          label="Avg Order"
          value={formatCurrency(avgOrderValue)}
          icon={TrendingUp}
        />
        <StatCard
          size="compact"
          label="Tickets"
          value={tickets.length.toString()}
          icon={TicketIcon}
          detail={`${scannedTickets.length} scanned`}
        />
        <StatCard
          size="compact"
          label="Events Attended"
          value={eventsAttended.toString()}
          icon={CalendarDays}
        />
        <StatCard
          size="compact"
          label={activeAbandonedCarts.length > 0 ? "Abandoned Carts" : "Merch Spend"}
          value={activeAbandonedCarts.length > 0 ? activeAbandonedCarts.length.toString() : formatCurrency(merchSpend)}
          icon={activeAbandonedCarts.length > 0 ? ShoppingCart : Shirt}
        />
      </div>

      {/* Abandoned Carts (if any) */}
      {abandonedCarts.length > 0 && (
        <div className="mt-6">
          <AbandonedCartsSection carts={abandonedCarts} />
        </div>
      )}

      {/* Latest Order */}
      <div className="mt-6">
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package size={15} className="text-muted-foreground" />
                Latest Order
              </CardTitle>
              {orders.length > 1 && (
                <Link href={`/admin/orders/?customer_id=${customerId}&customer_name=${encodeURIComponent(displayName)}`}>
                  <Button variant="outline" size="sm">
                    View All Orders ({orders.length})
                    <ChevronRight size={14} />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {latestOrder ? (
              <div>
                {/* Order header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/orders/${latestOrder.id}/`}
                      className="font-mono text-[13px] font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {latestOrder.order_number}
                    </Link>
                    <Badge
                      variant={STATUS_VARIANT[latestOrder.status] || "secondary"}
                      className="text-[10px]"
                    >
                      {latestOrder.status}
                    </Badge>
                  </div>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {formatCurrency(Number(latestOrder.total))}
                  </span>
                </div>

                {/* Order details grid */}
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date</p>
                    <p className="mt-1 text-sm text-foreground">{formatDate(latestOrder.created_at)}</p>
                  </div>
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Event</p>
                    <p className="mt-1 text-sm text-foreground">{latestOrder.event?.name || "—"}</p>
                  </div>
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tickets</p>
                    <p className="mt-1 text-sm text-foreground">{latestOrderTicketQty} ticket{latestOrderTicketQty !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Payment</p>
                    <p className="mt-1 text-sm text-foreground">{latestOrder.payment_method}</p>
                  </div>
                </div>

                {/* Order items breakdown */}
                {latestOrder.items && latestOrder.items.length > 0 && (
                  <div className="border-t border-border">
                    {latestOrder.items.map((item, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-5 py-3 ${
                          i < latestOrder.items!.length - 1 ? "border-b border-border/50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.merch_size ? (
                            <Shirt size={14} className="text-muted-foreground/50" />
                          ) : (
                            <TicketIcon size={14} className="text-muted-foreground/50" />
                          )}
                          <div>
                            <span className="text-sm text-foreground">
                              {item.qty}x @ {formatCurrency(Number(item.unit_price))}
                            </span>
                            {item.merch_size && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Size {item.merch_size}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-sm text-foreground">
                          {formatCurrency(Number(item.unit_price) * item.qty)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* View full order link */}
                <Link
                  href={`/admin/orders/${latestOrder.id}/`}
                  className="group flex items-center justify-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                >
                  View Full Order Details
                  <ChevronRight
                    size={12}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10">
                <Package size={24} className="text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {isDiscoverer ? "No purchases yet — still a discoverer" : "No orders yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {customer.notes && (
        <Card className="mt-4">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-muted-foreground" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <p className="whitespace-pre-wrap text-sm text-foreground/80">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      {timeline.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-muted-foreground" />
              Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="relative pl-6">
              {/* Vertical line */}
              <div className="absolute bottom-0 left-[11px] top-0 w-px bg-border" />

              {timeline.map((entry, i) => {
                const Icon = entry.icon;
                return (
                  <div
                    key={i}
                    className={`relative flex items-start gap-4 ${
                      i < timeline.length - 1 ? "pb-6" : ""
                    }`}
                  >
                    <div
                      className={`absolute -left-6 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-background ring-2 ${
                        entry.color
                          ? `ring-current ${entry.color}`
                          : "ring-border text-muted-foreground"
                      }`}
                    >
                      <Icon size={11} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{entry.label}</p>
                      {entry.detail && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                      )}
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                        {entry.time}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
