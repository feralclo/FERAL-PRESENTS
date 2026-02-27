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
import { TABLES } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { generateNickname } from "@/lib/nicknames";
import { fmtMoney } from "@/lib/format";
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
  ChevronDown,
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
  Flame,
  Timer,
  PartyPopper,
  CircleDot,
  X,
  MapPin,
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

interface EventInterestSignup {
  id: string;
  signed_up_at: string;
  notification_count: number;
  unsubscribed_at?: string | null;
  event: { name: string; slug: string } | null;
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

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
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
  const isPopupSource = customer.source === "popup";
  entries.push({
    label: isPopupSource ? "Captured via popup" : isDiscoverer ? "Discoverer captured" : "Customer created",
    detail: isPopupSource
      ? `${customer.nickname || customer.email} entered via discount popup`
      : isDiscoverer
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
      detail: `${itemCount} item${itemCount !== 1 ? "s" : ""} — ${fmtMoney(cart.subtotal)}${cart.event?.name ? ` for ${cart.event.name}` : ""}`,
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
      detail: `${fmtMoney(Number(order.total), order.currency)}${order.event?.name ? ` — ${order.event.name}` : ""}`,
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
        detail: fmtMoney(Number(order.total), order.currency),
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
                          ? `${fmtMoney(item.current)} / ${fmtMoney(item.target)}`
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
   RECOVERY ROADMAP — visual timeline for each abandoned cart
   ════════════════════════════════════════════════════════════ */
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
  const isExpired = cart.status === "expired";

  const THIRTY_MIN = 30 * 60 * 1000;
  const TWENTY_FOUR_HR = 24 * 60 * 60 * 1000;
  const FORTY_EIGHT_HR = 48 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  const steps: RoadmapStep[] = [];

  // Step 1: Cart abandoned
  steps.push({
    label: "Cart Abandoned",
    detail: `Captured at checkout`,
    icon: ShoppingCart,
    status: "completed",
    timestamp: cart.created_at,
    color: "#f59e0b",
    glowColor: "rgba(245,158,11,0.3)",
  });

  // Step 2: Recovery Email #1 (30 min)
  const email1Sent = cart.notification_count >= 1;
  const email1Due = createdAt + THIRTY_MIN;
  if (isRecovered && !email1Sent) {
    steps.push({
      label: "Recovery Email #1",
      detail: "Cart recovered before email needed",
      icon: Send,
      status: "skipped",
      color: "#71717a",
      glowColor: "transparent",
    });
  } else {
    steps.push({
      label: "Recovery Email #1",
      detail: email1Sent
        ? "Nudge email delivered"
        : elapsed >= THIRTY_MIN
          ? "Ready to send"
          : `Scheduled — ${formatCountdown(email1Due - now)}`,
      icon: Send,
      status: email1Sent ? "completed" : elapsed >= THIRTY_MIN ? "active" : "upcoming",
      timestamp: email1Sent && cart.notified_at ? cart.notified_at : undefined,
      color: "#8B5CF6",
      glowColor: "rgba(139,92,246,0.3)",
    });
  }

  // Step 3: Recovery Email #2 (24hr)
  const email2Sent = cart.notification_count >= 2;
  const email2Due = createdAt + TWENTY_FOUR_HR;
  if (isRecovered && !email2Sent) {
    steps.push({
      label: "Recovery Email #2",
      detail: "Cart recovered before email needed",
      icon: MailWarning,
      status: "skipped",
      color: "#71717a",
      glowColor: "transparent",
    });
  } else {
    steps.push({
      label: "Recovery Email #2",
      detail: email2Sent
        ? "Urgency email delivered"
        : elapsed >= TWENTY_FOUR_HR
          ? "Ready to send"
          : `Scheduled — ${formatCountdown(email2Due - now)}`,
      icon: MailWarning,
      status: email2Sent ? "completed" : elapsed >= TWENTY_FOUR_HR ? "active" : "upcoming",
      color: "#f97316",
      glowColor: "rgba(249,115,22,0.3)",
    });
  }

  // Step 4: Final reminder (48hr)
  const email3Sent = cart.notification_count >= 3;
  const email3Due = createdAt + FORTY_EIGHT_HR;
  if (isRecovered && !email3Sent) {
    steps.push({
      label: "Final Reminder",
      detail: "Cart recovered before reminder needed",
      icon: Flame,
      status: "skipped",
      color: "#71717a",
      glowColor: "transparent",
    });
  } else {
    steps.push({
      label: "Final Reminder",
      detail: email3Sent
        ? "Last chance email delivered"
        : elapsed >= FORTY_EIGHT_HR
          ? "Ready to send"
          : `Scheduled — ${formatCountdown(email3Due - now)}`,
      icon: Flame,
      status: email3Sent ? "completed" : elapsed >= FORTY_EIGHT_HR ? "active" : "upcoming",
      color: "#ef4444",
      glowColor: "rgba(239,68,68,0.3)",
    });
  }

  // Step 5: Outcome — recovered or expires
  if (isRecovered) {
    steps.push({
      label: "Recovered!",
      detail: "Converted to order",
      icon: PartyPopper,
      status: "completed",
      timestamp: cart.recovered_at,
      color: "#10b981",
      glowColor: "rgba(16,185,129,0.4)",
    });
  } else if (isExpired) {
    steps.push({
      label: "Expired",
      detail: "Cart window closed",
      icon: X,
      status: "completed",
      color: "#71717a",
      glowColor: "transparent",
    });
  } else {
    const expiresAt = createdAt + SEVEN_DAYS;
    steps.push({
      label: "Cart Expires",
      detail: elapsed >= SEVEN_DAYS
        ? "Expiring soon"
        : `Expires in ${formatCountdown(expiresAt - now)}`,
      icon: Timer,
      status: "upcoming",
      color: "#71717a",
      glowColor: "transparent",
    });
  }

  return steps;
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

function getUrgencyLevel(cart: AbandonedCart): {
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
      bg: "rgba(16,185,129,0.08)",
      border: "rgba(16,185,129,0.25)",
      glow: "0 0 20px rgba(16,185,129,0.2)",
      icon: PartyPopper,
      pulse: false,
    };
  }
  const elapsed = Date.now() - new Date(cart.created_at).getTime();
  const hours = elapsed / (1000 * 60 * 60);
  if (hours < 1) {
    return {
      label: "HOT",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.3)",
      glow: "0 0 24px rgba(239,68,68,0.25)",
      icon: Flame,
      pulse: true,
    };
  }
  if (hours < 24) {
    return {
      label: "WARM",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.25)",
      glow: "0 0 20px rgba(245,158,11,0.2)",
      icon: Zap,
      pulse: true,
    };
  }
  return {
    label: "COOLING",
    color: "#71717a",
    bg: "rgba(113,113,122,0.06)",
    border: "rgba(113,113,122,0.15)",
    glow: "none",
    icon: Clock,
    pulse: false,
  };
}

/* ═══ Single cart card with expandable roadmap ═══ */
function AbandonedCartCard({ cart }: { cart: AbandonedCart }) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = cart.items?.reduce((s, i) => s + i.qty, 0) || 0;
  const isAbandoned = cart.status === "abandoned";
  const isRecovered = cart.status === "recovered";
  const urgency = getUrgencyLevel(cart);
  const UrgencyIcon = urgency.icon;
  const roadmap = getRecoveryRoadmap(cart);

  return (
    <div
      className="overflow-hidden rounded-xl border transition-all duration-300"
      style={{
        borderColor: expanded ? urgency.border : "var(--color-border)",
        backgroundColor: expanded ? urgency.bg : "transparent",
        boxShadow: expanded ? urgency.glow : "none",
      }}
    >
      {/* Cart header — clickable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/20"
      >
        {/* Urgency icon with optional pulse */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: urgency.bg }}>
          <UrgencyIcon size={16} style={{ color: urgency.color }} />
          {urgency.pulse && (
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-20"
              style={{ backgroundColor: urgency.color }}
            />
          )}
        </div>

        {/* Cart info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {cart.event?.name || "Unknown Event"}
            </span>
            <Badge
              variant={isRecovered ? "success" : isAbandoned ? "warning" : "secondary"}
              className="text-[9px] font-bold uppercase"
            >
              {urgency.label}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Package size={11} />
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </span>
            <span>{timeAgo(cart.created_at)}</span>
            {isAbandoned && cart.notification_count > 0 && (
              <span className="flex items-center gap-1 text-primary/70">
                <Send size={10} />
                {cart.notification_count} sent
              </span>
            )}
          </div>
        </div>

        {/* Value */}
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-lg font-bold tabular-nums"
            style={{ color: isRecovered ? "#10b981" : urgency.color }}
          >
            {fmtMoney(cart.subtotal)}
          </span>
          <ChevronDown
            size={16}
            className={`text-muted-foreground/50 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Expanded: Recovery Roadmap + Cart Contents */}
      {expanded && (
        <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: urgency.border }}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Recovery Roadmap — left side */}
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
                      {/* Vertical connecting line */}
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

                      {/* Step icon node */}
                      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300"
                          style={{
                            backgroundColor: isCompleted || isActive
                              ? `${step.color}18`
                              : isSkipped
                                ? "rgba(255,255,255,0.03)"
                                : "rgba(255,255,255,0.04)",
                            boxShadow: isActive
                              ? `0 0 16px ${step.glowColor}, inset 0 0 0 1.5px ${step.color}`
                              : isCompleted
                                ? `inset 0 0 0 1.5px ${step.color}60`
                                : "none",
                          }}
                        >
                          {isCompleted && !isSkipped ? (
                            <Check size={12} style={{ color: step.color }} />
                          ) : isSkipped ? (
                            <span className="text-[10px] text-muted-foreground/30">—</span>
                          ) : (
                            <StepIcon
                              size={13}
                              style={{
                                color: isActive ? step.color : "rgba(255,255,255,0.15)",
                              }}
                            />
                          )}
                        </div>
                        {isActive && (
                          <span
                            className="absolute inset-0 animate-ping rounded-full opacity-15"
                            style={{ backgroundColor: step.color }}
                          />
                        )}
                      </div>

                      {/* Step content */}
                      <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[12px] font-semibold uppercase tracking-wider"
                            style={{
                              color: isCompleted || isActive
                                ? step.color
                                : isSkipped
                                  ? "rgba(255,255,255,0.2)"
                                  : "rgba(255,255,255,0.3)",
                            }}
                          >
                            {step.label}
                          </span>
                          {isActive && (
                            <span
                              className="inline-flex h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: step.color, boxShadow: `0 0 6px ${step.color}` }}
                            />
                          )}
                        </div>
                        <p
                          className="mt-0.5 text-[11px]"
                          style={{
                            color: isSkipped ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)",
                          }}
                        >
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

            {/* Cart Contents — right side */}
            <div className="lg:col-span-2">
              <h4 className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[2px] text-muted-foreground/60">
                <Package size={11} />
                Cart Contents
              </h4>
              <div className="space-y-2">
                {cart.items?.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-foreground">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {item.qty}x @ {fmtMoney(item.price)}
                        {item.merch_size && ` — Size ${item.merch_size}`}
                      </p>
                    </div>
                    <span className="ml-3 shrink-0 font-mono text-[12px] font-semibold tabular-nums text-foreground/70">
                      {fmtMoney(item.price * item.qty)}
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
                  {fmtMoney(cart.subtotal)}
                </span>
              </div>

              {/* Recovery status */}
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
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ABANDONED CARTS — gamified section with urgency + roadmap
   ════════════════════════════════════════════════════════════ */
function AbandonedCartsSection({ carts }: { carts: AbandonedCart[] }) {
  if (carts.length === 0) return null;

  const activeCarts = carts.filter((c) => c.status === "abandoned");
  const recoveredCarts = carts.filter((c) => c.status === "recovered");
  const totalAtRisk = activeCarts.reduce((s, c) => s + c.subtotal, 0);
  const totalRecovered = recoveredCarts.reduce((s, c) => s + c.subtotal, 0);
  const recoveryRate = carts.length > 0 ? (recoveredCarts.length / carts.length) * 100 : 0;

  // Hot carts (< 1hr old) for counter
  const hotCarts = activeCarts.filter((c) => {
    const elapsed = Date.now() - new Date(c.created_at).getTime();
    return elapsed < 60 * 60 * 1000;
  });

  return (
    <Card className="overflow-hidden">
      {/* Gamified header with revenue at risk */}
      <div
        className="relative border-b px-5 py-4"
        style={{
          borderColor: activeCarts.length > 0 ? "rgba(245,158,11,0.15)" : "var(--color-border)",
          background: activeCarts.length > 0
            ? "linear-gradient(135deg, rgba(245,158,11,0.04), rgba(239,68,68,0.02))"
            : "transparent",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
              <ShoppingCart size={16} className="text-amber-400" />
              {hotCarts.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                  {hotCarts.length}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                  Abandoned Carts
                </h3>
                {activeCarts.length > 0 && (
                  <Badge variant="warning" className="text-[9px] font-bold">
                    {activeCarts.length} active
                  </Badge>
                )}
              </div>
              {activeCarts.length > 0 && (
                <p className="mt-0.5 text-[11px] text-amber-400/70">
                  {fmtMoney(totalAtRisk)} revenue at risk
                </p>
              )}
            </div>
          </div>

          {/* Mini stats */}
          <div className="flex items-center gap-4">
            {recoveredCarts.length > 0 && (
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-emerald-400">{fmtMoney(totalRecovered)}</p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/50">
                  Recovered
                </p>
              </div>
            )}
            {carts.length > 1 && (
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-foreground/70">{recoveryRate.toFixed(0)}%</p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Rate
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cart cards */}
      <CardContent className="space-y-3 p-4">
        {carts.map((cart) => (
          <AbandonedCartCard key={cart.id} cart={cart} />
        ))}
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   CUSTOMER PROFILE PAGE
   ════════════════════════════════════════════════════════════ */
export default function CustomerProfilePage() {
  const orgId = useOrgId();
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [eventInterests, setEventInterests] = useState<EventInterestSignup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCustomer = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const [customerResult, ordersResult, ticketsResult, cartsResult, interestsResult] = await Promise.all([
      supabase
        .from(TABLES.CUSTOMERS)
        .select("*")
        .eq("id", customerId)
        .eq("org_id", orgId)
        .single(),
      supabase
        .from(TABLES.ORDERS)
        .select("id, order_number, status, total, currency, payment_method, created_at, metadata, event:events(name, slug, date_start), items:order_items(qty, merch_size, unit_price)")
        .eq("customer_id", customerId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from(TABLES.TICKETS)
        .select("id, ticket_code, status, merch_size, merch_collected, scanned_at, scanned_by, created_at, ticket_type:ticket_types(name), event:events(name, slug, venue_name, date_start)")
        .eq("customer_id", customerId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from(TABLES.ABANDONED_CARTS)
        .select("*, event:events(name, slug, date_start)")
        .eq("customer_id", customerId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from(TABLES.EVENT_INTEREST_SIGNUPS)
        .select("id, signed_up_at, notification_count, unsubscribed_at, event:events(name, slug)")
        .eq("customer_id", customerId)
        .eq("org_id", orgId)
        .order("signed_up_at", { ascending: false }),
    ]);

    if (customerResult.data) setCustomer(customerResult.data);
    if (ordersResult.data) setOrders(ordersResult.data as unknown as CustomerOrder[]);
    if (ticketsResult.data) setTickets(ticketsResult.data as unknown as CustomerTicket[]);
    if (cartsResult.data) setAbandonedCarts(cartsResult.data as unknown as AbandonedCart[]);
    if (interestsResult.data) setEventInterests(interestsResult.data as unknown as EventInterestSignup[]);

    setLoading(false);
  }, [customerId, orgId]);

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
                  {customer.source === "popup" && (
                    <Badge variant="info" className="text-[10px] font-semibold">
                      Via Popup
                    </Badge>
                  )}
                  {customer.marketing_consent === true && (
                    <Badge variant="success" className="text-[10px] font-semibold">
                      <Mail size={10} /> Marketing
                    </Badge>
                  )}
                  {customer.marketing_consent === false && (
                    <Badge variant="secondary" className="text-[10px] font-semibold text-muted-foreground">
                      <MailWarning size={10} /> Unsubscribed
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
                  {(customer.city || customer.country) && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin size={13} className="text-muted-foreground/50" />
                      {countryFlag(customer.country || null)}{" "}
                      {customer.city ? `Last seen in ${customer.city}` : customer.country || ""}
                    </div>
                  )}
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
          value={fmtMoney(totalSpent)}
          icon={DollarSign}
        />
        <StatCard
          size="compact"
          label="Avg Order"
          value={fmtMoney(avgOrderValue)}
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
          value={activeAbandonedCarts.length > 0 ? activeAbandonedCarts.length.toString() : fmtMoney(merchSpend)}
          icon={activeAbandonedCarts.length > 0 ? ShoppingCart : Shirt}
        />
      </div>

      {/* Event Interests (if any) */}
      {eventInterests.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Star size={15} className="text-muted-foreground" />
                Event Interests ({eventInterests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {eventInterests.map((signup) => (
                <div
                  key={signup.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {signup.event?.name || "Unknown event"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Signed up {new Date(signup.signed_up_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="secondary"
                      className="text-[9px] font-semibold tabular-nums"
                    >
                      Step {signup.notification_count}/4
                    </Badge>
                    {signup.unsubscribed_at && (
                      <Badge variant="destructive" className="text-[9px] font-semibold">
                        Unsub
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

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
                    {fmtMoney(Number(latestOrder.total), latestOrder.currency)}
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
                              {item.qty}x @ {fmtMoney(Number(item.unit_price), latestOrder.currency)}
                            </span>
                            {item.merch_size && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Size {item.merch_size}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-sm text-foreground">
                          {fmtMoney(Number(item.unit_price) * item.qty, latestOrder.currency)}
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
