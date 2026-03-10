"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Gift,
  Lock,
  Check,
  Loader2,
  ShoppingCart,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  Ticket,
  ArrowUpCircle,
  Package,
  ZoomIn,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState, RepPageError, CurrencyIcon } from "@/components/rep";
import { playSuccessSound } from "@/lib/rep-utils";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";
import type { FulfillmentType, ClaimMetadata } from "@/types/reps";

// ─── Ticket QR Button + Fullscreen Modal ─────────────────────────────────────

function TicketQRButton({ ticketCode, label }: { ticketCode: string; label?: string }) {
  const [showModal, setShowModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (showModal && !qrDataUrl) {
      QRCode.toDataURL(ticketCode, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 320,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setQrDataUrl).catch(() => {});
    }
  }, [showModal, qrDataUrl, ticketCode]);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background hover:border-primary/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Ticket size={12} className="text-primary shrink-0" />
          <span className="text-xs font-mono text-foreground truncate">{ticketCode}</span>
        </div>
        <span className="text-[10px] text-primary font-medium shrink-0 ml-2">
          Show QR
        </span>
      </button>

      {showModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md rep-fade-in"
          onClick={() => setShowModal(false)}
        >
          <div
            className="flex flex-col items-center w-full max-w-xs mx-4 rep-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              className="self-end mb-3 text-white/60 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            {/* QR Card */}
            <div className="w-full rounded-2xl bg-white p-6 flex flex-col items-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR code for ${ticketCode}`} className="w-64 h-64" />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              )}
              <p className="mt-4 text-sm font-mono text-gray-900 tracking-wide select-all text-center">
                {ticketCode}
              </p>
              {label && (
                <p className="mt-1 text-xs text-gray-500 text-center">{label}</p>
              )}
            </div>

            <p className="mt-4 text-xs text-white/50">Tap outside to close</p>
          </div>
        </div>,
        document.getElementById("rep-portal-root") || document.body
      )}
    </>
  );
}

// ─── Image Lightbox ──────────────────────────────────────────────────────────

function ImageLightbox({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Entire image area is tappable */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="absolute inset-0 z-10 flex items-center justify-center cursor-zoom-in"
        title="View full image"
      >
        <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70">
          <ZoomIn size={14} />
        </span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md rep-fade-in"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors z-20"
          >
            <X size={20} />
          </button>
          <div className="w-full h-full flex items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain rep-slide-up"
              style={{ imageRendering: "auto" }}
              onClick={() => setOpen(false)}
            />
          </div>
        </div>,
        document.getElementById("rep-portal-root") || document.body
      )}
    </>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Reward {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  reward_type: "milestone" | "points_shop" | "manual";
  points_cost?: number;
  custom_value?: string;
  total_available?: number;
  total_claimed: number;
  product_id?: string;
  metadata?: {
    fulfillment_type?: FulfillmentType;
    event_id?: string;
    ticket_type_id?: string;
    upgrade_to_ticket_type_id?: string;
    max_claims_per_rep?: number | null;
  };
  product?: { name?: string; images?: string[]; sizes?: string[] } | null;
  milestones?: {
    id: string;
    title: string;
    milestone_type: string;
    threshold_value: number;
    current_value: number;
    achieved: boolean;
    claimed: boolean;
    progress_percent: number;
  }[];
  my_claims?: { id: string; status: string; metadata?: ClaimMetadata }[];
  claims_count?: number;
  max_claims?: number | null;
  event_name?: string | null;
  ticket_type_name?: string | null;
  upgrade_ticket_type_name?: string | null;
  can_purchase?: boolean;
}

interface Claim {
  id: string;
  claim_type: "milestone" | "points_shop" | "manual";
  points_spent: number;
  status: "claimed" | "fulfilled" | "cancelled";
  notes?: string;
  metadata?: ClaimMetadata;
  created_at: string;
  fulfilled_at?: string;
  reward?: {
    id: string;
    name: string;
    description?: string;
    image_url?: string;
    reward_type: string;
    points_cost?: number;
    custom_value?: string;
    metadata?: { fulfillment_type?: FulfillmentType; event_id?: string };
    product?: { name: string; images?: string[] } | null;
  };
  event?: {
    id: string;
    name: string;
    date_start: string | null;
    venue_name: string | null;
    cover_image: string | null;
  } | null;
  ticket_status?: {
    scanned: boolean;
    any_scanned: boolean;
    scanned_at: string | null;
    merch_collected: boolean;
    any_merch_collected: boolean;
    merch_collected_at: string | null;
  };
}

type TabId = "earned" | "shop" | "history";

// ─── Claim celebration limiter ──────────────────────────────────────────────

const CLAIM_COUNT_KEY = "rep_reward_claim_count";
const MAX_CONFETTI_CLAIMS = 3;

function shouldShowConfetti(): boolean {
  try {
    const count = parseInt(localStorage.getItem(CLAIM_COUNT_KEY) || "0", 10);
    return count < MAX_CONFETTI_CLAIMS;
  } catch { return true; }
}

function incrementClaimCount(): void {
  try {
    const count = parseInt(localStorage.getItem(CLAIM_COUNT_KEY) || "0", 10);
    localStorage.setItem(CLAIM_COUNT_KEY, String(count + 1));
  } catch { /* storage unavailable */ }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CLAIM_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof Check }> = {
  claimed: { label: "Pending", variant: "secondary", icon: Clock },
  fulfilled: { label: "Fulfilled", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
};

function getFulfillmentIcon(ft?: FulfillmentType) {
  switch (ft) {
    case "free_ticket":
    case "extra_tickets":
      return Ticket;
    case "vip_upgrade":
      return ArrowUpCircle;
    case "merch":
      return Package;
    default:
      return null;
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RepRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [myBalance, setMyBalance] = useState(0);
  const [currencyName, setCurrencyName] = useState("FRL");
  const [tab, setTab] = useState<TabId>("shop");
  const hasAutoSelectedTab = useRef(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [confirmReward, setConfirmReward] = useState<Reward | null>(null);
  const [successReward, setSuccessReward] = useState<Reward | null>(null);
  const [successData, setSuccessData] = useState<Record<string, unknown> | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  // Merch size picker
  const [selectedMerchSize, setSelectedMerchSize] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      const [rewardsRes, meRes, claimsRes, settingsRes] = await Promise.all([
        fetch("/api/rep-portal/rewards"),
        fetch("/api/rep-portal/me"),
        fetch("/api/rep-portal/rewards/claims"),
        fetch("/api/rep-portal/settings"),
      ]);
      if (!rewardsRes.ok) {
        const errJson = await rewardsRes.json().catch(() => null);
        setError(errJson?.error || `Failed to load rewards (${rewardsRes.status})`);
        setLoading(false);
        return;
      }
      const rewardsJson = await rewardsRes.json();
      const meJson = meRes.ok ? await meRes.json() : { data: null };
      const claimsJson = claimsRes.ok ? await claimsRes.json() : { data: [] };
      const settingsJson = settingsRes.ok ? await settingsRes.json() : { data: null };

      if (rewardsJson.data) setRewards(rewardsJson.data);
      if (meJson.data) setMyBalance(meJson.data.currency_balance ?? meJson.data.points_balance ?? 0);
      if (claimsJson.data) setClaims(claimsJson.data);
      if (settingsJson.data?.currency_name) setCurrencyName(settingsJson.data.currency_name);
    } catch {
      setError("Failed to load rewards — check your connection");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData, loadKey]);

  const handleClaim = async (reward: Reward) => {
    setClaimingId(reward.id);
    setConfirmReward(null);
    try {
      const body: Record<string, unknown> = {};
      if (reward.metadata?.fulfillment_type === "merch" && selectedMerchSize) {
        body.merch_size = selectedMerchSize;
      }

      const res = await fetch(`/api/rep-portal/rewards/${reward.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setError("");
        const resJson = await res.json();
        setSuccessReward(reward);
        setSuccessData(resJson.data || null);
        incrementClaimCount();
        playSuccessSound();
        setSelectedMerchSize("");
        // Refresh data
        const [rewardsRes, meRes, claimsRes] = await Promise.all([
          fetch("/api/rep-portal/rewards"),
          fetch("/api/rep-portal/me"),
          fetch("/api/rep-portal/rewards/claims"),
        ]);
        if (rewardsRes.ok) {
          const json = await rewardsRes.json();
          if (json.data) setRewards(json.data);
        }
        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.data) setMyBalance(meJson.data.currency_balance ?? meJson.data.points_balance ?? 0);
        }
        if (claimsRes.ok) {
          const claimsJson = await claimsRes.json();
          if (claimsJson.data) setClaims(claimsJson.data);
        }
        // Auto-dismiss success after 4s
        setTimeout(() => { setSuccessReward(null); setSuccessData(null); }, 4000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setClaimError(errJson.error || "Failed to claim reward");
      }
    } catch {
      setClaimError("Failed to claim reward — check your connection");
    }
    setClaimingId(null);
  };

  const canClaimMore = (r: Reward) => r.can_purchase === true;

  const activeClaimCount = (r: Reward) => r.claims_count ?? (r.my_claims?.filter((c) => c.status !== "cancelled").length ?? 0);

  const milestoneRewards = rewards.filter((r) => r.reward_type === "milestone");
  const shopRewards = rewards.filter((r) => r.reward_type === "points_shop");

  // Auto-select tab based on content (first load only)
  useEffect(() => {
    if (!loading && !hasAutoSelectedTab.current) {
      hasAutoSelectedTab.current = true;
      if (shopRewards.length > 0) setTab("shop");
      else if (milestoneRewards.length > 0) setTab("earned");
      else if (claims.length > 0) setTab("history");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-28 mb-2" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-16 w-24 rounded-xl" />
        </div>
        <Skeleton className="h-10 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[200px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error && rewards.length === 0 && claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button
          variant="link"
          size="sm"
          onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
        >
          Try again
        </Button>
      </div>
    );
  }

  // Confirmation text based on fulfillment type
  const getConfirmText = (reward: Reward) => {
    const ft = reward.metadata?.fulfillment_type;
    switch (ft) {
      case "free_ticket":
      case "extra_tickets":
        return `A ticket${reward.event_name ? ` for ${reward.event_name}` : ""} will be emailed to you.`;
      case "vip_upgrade":
        return `Your existing${reward.event_name ? ` ${reward.event_name}` : ""} ticket will be upgraded${reward.upgrade_ticket_type_name ? ` to ${reward.upgrade_ticket_type_name}` : ""}.`;
      case "merch":
        return reward.event_name
          ? `Pick your size. Collect at ${reward.event_name}.`
          : "Pick your size. Collect at the event.";
      default:
        return "Admin will fulfil your reward.";
    }
  };

  // Success message based on fulfillment type
  const getSuccessMessage = (reward: Reward, data: Record<string, unknown> | null) => {
    const ft = reward.metadata?.fulfillment_type || (data?.fulfillment_type as string);
    switch (ft) {
      case "free_ticket":
      case "extra_tickets":
        return {
          title: "Ticket Created!",
          subtitle: `Check your email for the QR code${data?.order_number ? ` — Order ${data.order_number}` : ""}`,
        };
      case "vip_upgrade":
        return {
          title: "Ticket Upgraded!",
          subtitle: reward.upgrade_ticket_type_name
            ? `Your ticket has been upgraded to ${reward.upgrade_ticket_type_name}`
            : "Your ticket has been upgraded",
        };
      case "merch":
        return {
          title: "Merch Claimed!",
          subtitle: `Size ${data?.merch_size || "selected"} — check your email for the collection QR.`,
        };
      default:
        return {
          title: "Reward Claimed!",
          subtitle: reward.name,
        };
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      {/* Header with points balance */}
      <div className="flex items-center justify-between rep-slide-up">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rewards</h1>
          <p className="text-sm text-muted-foreground">Earn, spend, collect</p>
        </div>
        <div className="rounded-xl rep-surface-2 border-amber-400/15 px-5 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CurrencyIcon size={12} className="text-amber-400" />
            <p className="text-[10px] uppercase tracking-[2px] text-amber-400 font-bold">{currencyName}</p>
          </div>
          <p className="text-xl font-bold font-mono text-amber-400 tabular-nums">{myBalance}</p>
        </div>
      </div>

      {/* Inline error */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Tab bar */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="gap-4 rep-slide-up" style={{ animationDelay: "50ms" }}>
        <TabsList className="w-full bg-secondary rounded-xl border border-border">
          <TabsTrigger value="earned" className="flex-1 rounded-[10px] text-[13px] font-semibold data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            Earned
            {milestoneRewards.length > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground data-[state=active]:text-white/70">{milestoneRewards.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="shop" className="flex-1 rounded-[10px] text-[13px] font-semibold data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            Shop
            {shopRewards.length > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground data-[state=active]:text-white/70">{shopRewards.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 rounded-[10px] text-[13px] font-semibold data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            My Rewards
            {claims.length > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground data-[state=active]:text-white/70">{claims.length}</span>}
          </TabsTrigger>
        </TabsList>

      {/* ── Earned (Milestones) Tab ── */}
      <TabsContent value="earned">
        <div className="space-y-3 rep-slide-up">
          {milestoneRewards.length === 0 ? (
            <EmptyState icon={Target} title="No milestones yet" subtitle="Milestones will appear as the team sets them up" />
          ) : (
            milestoneRewards.map((reward) => {
              const claimed = activeClaimCount(reward) > 0;
              return (
                <Card
                  key={reward.id}
                  className={cn(
                    "py-0 gap-0",
                    claimed
                      ? "border-success/30 bg-success/5 rep-reward-unlocked"
                      : "border-border/40"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {reward.image_url ? (
                        <div className={cn(
                          "h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-muted/30",
                          !claimed && "rep-reward-locked"
                        )}>
                          <img src={reward.image_url} alt="" className="h-full w-full object-contain" />
                        </div>
                      ) : (
                        <div className={cn(
                          "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                          claimed ? "bg-success/10" : "bg-muted/30"
                        )}>
                          {claimed ? (
                            <Check size={20} className="text-success" style={{ filter: "drop-shadow(0 0 6px rgba(52, 211, 153, 0.4))" }} />
                          ) : (
                            <Lock size={20} className="text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-foreground">{reward.name}</h3>
                          {claimed && (
                            <Badge variant="default" className="bg-success/15 text-success border-success/20 text-[10px] px-1.5 py-0">
                              Unlocked
                            </Badge>
                          )}
                        </div>
                        {reward.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{reward.description}</p>
                        )}
                        {reward.milestones && reward.milestones.length > 0 && (
                          <div className="mt-3 space-y-2.5">
                            {reward.milestones.map((m) => (
                              <div key={m.id}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <div className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      m.achieved ? "bg-success" : "bg-border"
                                    )} />
                                    <span className={cn(
                                      "text-xs",
                                      m.achieved ? "text-success font-medium" : "text-muted-foreground"
                                    )}>
                                      {m.title}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                                    {m.current_value}/{m.threshold_value}
                                  </span>
                                </div>
                                <Progress
                                  value={m.progress_percent}
                                  className="h-1"
                                  indicatorClassName={m.achieved ? "bg-success" : ""}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </TabsContent>

      {/* ── Shop (Points Shop) Tab ── */}
      <TabsContent value="shop">
        <div className="rep-slide-up">
          {shopRewards.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Shop is empty" subtitle="Rewards will appear here when they're available" />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {shopRewards.map((reward) => {
                const claimedCount = activeClaimCount(reward);
                const hasClaimed = claimedCount > 0;
                const maxClaims = reward.max_claims ?? 1; // 0 = unlimited
                const isMultiClaim = maxClaims === 0 || maxClaims > 1;
                const allClaimed = !canClaimMore(reward) && hasClaimed;
                const canAfford = myBalance >= (reward.points_cost || 0);
                const soldOut = reward.total_available != null && reward.total_claimed >= reward.total_available;
                const remaining = reward.total_available != null ? reward.total_available - reward.total_claimed : null;
                const ft = reward.metadata?.fulfillment_type;
                const FtIcon = getFulfillmentIcon(ft);

                // Tier glow based on cost
                const cost = reward.points_cost || 0;
                const glowClass = (hasClaimed && !isMultiClaim) ? "" : cost >= 500 ? "rep-reward-glow-legendary" : cost >= 200 ? "rep-reward-glow-high" : cost >= 50 ? "rep-reward-glow-mid" : "rep-reward-glow-low";

                return (
                  <Card
                    key={reward.id}
                    className={cn(
                      "py-0 gap-0 overflow-hidden rep-shop-hover flex flex-col",
                      (hasClaimed && !isMultiClaim) ? "border-success/30" : "border-border/40",
                      glowClass
                    )}
                  >
                    {/* Fixed-height image area — always rendered for consistency */}
                    <div className="relative h-32 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0">
                      {reward.image_url ? (
                        <>
                          <img src={reward.image_url} alt="" className="max-h-full max-w-full object-contain p-2" />
                          <ImageLightbox src={reward.image_url} alt={reward.name} />
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {FtIcon ? <FtIcon size={28} className="text-muted-foreground/30" /> : <Gift size={28} className="text-muted-foreground/30" />}
                        </div>
                      )}
                      {remaining !== null && remaining > 0 && remaining <= 5 && !allClaimed && (
                        <span className="absolute top-2 left-2 text-[10px] font-bold text-warning bg-warning/15 border border-warning/20 px-2 py-0.5 rounded-full animate-pulse">
                          {remaining} left
                        </span>
                      )}
                    </div>

                    {/* Content — flex-1 to fill remaining space, mt-auto on action */}
                    <CardContent className="p-3 flex flex-col flex-1">
                      <h3 className="text-xs font-medium text-foreground mb-1 line-clamp-2">{reward.name}</h3>
                      {/* Event badge */}
                      {reward.event_name && (
                        <div className="flex items-center gap-1 mb-1">
                          {FtIcon && <FtIcon size={10} className="text-primary/70" />}
                          <span className="text-[10px] text-primary/70 font-medium truncate">{reward.event_name}</span>
                        </div>
                      )}
                      {/* Ticket type name */}
                      {reward.ticket_type_name && (
                        <p className="text-[10px] text-muted-foreground mb-1 truncate">{reward.ticket_type_name}</p>
                      )}
                      {reward.description && !reward.event_name && (
                        <p className="text-[10px] text-muted-foreground mb-1 line-clamp-2">{reward.description}</p>
                      )}

                      {/* Price — always same position */}
                      <div className="flex items-baseline gap-1 mb-2">
                        <CurrencyIcon size={10} className="text-amber-400" />
                        <span className="text-lg font-bold font-mono text-amber-400 tabular-nums">
                          {reward.points_cost}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{currencyName}</span>
                      </div>

                      {/* Spacer pushes action to bottom */}
                      <div className="mt-auto">
                        {/* Multi-claim counter */}
                        {isMultiClaim && hasClaimed && (
                          <p className="text-[10px] text-muted-foreground mb-2 font-mono tabular-nums">
                            {claimedCount}/{maxClaims === null || maxClaims === 0 ? "\u221E" : maxClaims} claimed
                          </p>
                        )}

                        {/* Action — consistent height across all states */}
                        {allClaimed ? (
                          <div className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-success/10 text-xs text-success font-medium">
                            <Check size={12} style={{ filter: "drop-shadow(0 0 4px rgba(52, 211, 153, 0.4))" }} />
                            {isMultiClaim ? "Max claimed" : "Claimed"}
                          </div>
                        ) : soldOut ? (
                          <div className="flex items-center justify-center h-8 text-xs text-muted-foreground font-medium">Sold out</div>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full text-xs h-8"
                            disabled={!canAfford || claimingId === reward.id}
                            onClick={() => { setConfirmReward(reward); setSelectedMerchSize(""); }}
                          >
                            {claimingId === reward.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : canAfford ? (
                              <>
                                <ShoppingCart size={12} />
                                {hasClaimed && isMultiClaim ? "Buy Another" : `Buy with ${reward.points_cost} ${currencyName}`}
                              </>
                            ) : (
                              `Need ${(reward.points_cost || 0) - myBalance} more`
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </TabsContent>

      {/* ── My Rewards Tab ── */}
      <TabsContent value="history">
        <div className="space-y-3 rep-slide-up">
          {claims.length === 0 ? (
            <EmptyState icon={Gift} title="No rewards yet" subtitle="Claimed rewards and tickets will show up here" />
          ) : (
            claims.map((claim) => {
              const reward = claim.reward;
              const productImg = reward?.product?.images?.[0];
              const imgUrl = reward?.image_url || productImg || claim.event?.cover_image;
              const claimMeta = claim.metadata;
              const hasTickets = claimMeta?.ticket_codes && claimMeta.ticket_codes.length > 0;
              const ft = reward?.metadata?.fulfillment_type;
              const isMerch = ft === "merch" || !!claimMeta?.merch_size;
              const isTicket = ft === "free_ticket" || ft === "extra_tickets";
              const isUpgrade = ft === "vip_upgrade";
              const ts = claim.ticket_status;
              const eventDate = claim.event?.date_start ? new Date(claim.event.date_start) : null;
              const eventPassed = eventDate ? eventDate < new Date() : false;

              // Determine the real state for the user
              let stateLabel = "";
              let stateColor = "";
              let StateIcon = Clock;

              if (claim.status === "cancelled") {
                stateLabel = "Cancelled";
                stateColor = "text-destructive";
                StateIcon = XCircle;
              } else if (isMerch && ts?.merch_collected) {
                stateLabel = "Collected";
                stateColor = "text-success";
                StateIcon = CheckCircle2;
              } else if (isTicket && ts?.scanned) {
                stateLabel = "Used";
                stateColor = "text-success";
                StateIcon = CheckCircle2;
              } else if (isUpgrade && claim.status === "fulfilled") {
                stateLabel = "Upgraded";
                stateColor = "text-success";
                StateIcon = CheckCircle2;
              } else if (isMerch && claim.status === "fulfilled" && !ts?.merch_collected) {
                stateLabel = "Ready to collect";
                stateColor = "text-amber-400";
                StateIcon = Package;
              } else if (isTicket && claim.status === "fulfilled" && !ts?.scanned) {
                stateLabel = eventPassed ? "Unused" : "Ready";
                stateColor = eventPassed ? "text-muted-foreground" : "text-primary";
                StateIcon = Ticket;
              } else if (claim.status === "claimed") {
                stateLabel = "Processing";
                stateColor = "text-muted-foreground";
                StateIcon = Clock;
              } else if (claim.status === "fulfilled") {
                stateLabel = "Completed";
                stateColor = "text-success";
                StateIcon = CheckCircle2;
              }

              return (
                <Card key={claim.id} className={cn(
                  "py-0 gap-0 overflow-hidden",
                  claim.status === "cancelled" ? "border-border/20 opacity-60" : "border-border/40"
                )}>
                  {/* Hero image for visual impact */}
                  {imgUrl && (
                    <div className="relative h-28 bg-muted/20 flex items-center justify-center overflow-hidden">
                      <img src={imgUrl} alt="" className="max-h-full max-w-full object-contain p-3" />
                      {imgUrl && <ImageLightbox src={imgUrl} alt={reward?.name || "Reward"} />}
                    </div>
                  )}

                  <CardContent className="p-4">
                    {/* Title + state */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground line-clamp-1">
                          {reward?.name || "Reward"}
                        </p>
                        {reward?.product?.name && reward.product.name !== reward.name && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{reward.product.name}</p>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] px-2 py-0.5 gap-1 shrink-0", stateColor)}
                      >
                        <StateIcon size={10} />
                        {stateLabel}
                      </Badge>
                    </div>

                    {/* Event info */}
                    {claim.event && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/30 border border-border/50 px-3 py-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{claim.event.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {claim.event.venue_name && (
                              <span className="text-[10px] text-muted-foreground truncate">{claim.event.venue_name}</span>
                            )}
                            {eventDate && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {eventDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Merch details */}
                    {isMerch && claimMeta?.merch_size && (
                      <div className="flex items-center gap-2 mb-3">
                        <Package size={12} className="text-muted-foreground shrink-0" />
                        <span className="text-xs text-foreground">Size {claimMeta.merch_size}</span>
                        {ts?.merch_collected ? (
                          <span className="text-[10px] text-success font-medium ml-auto">
                            Collected{ts.merch_collected_at ? ` ${new Date(ts.merch_collected_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                          </span>
                        ) : claim.status === "fulfilled" ? (
                          <span className="text-[10px] text-amber-400 font-medium ml-auto">
                            {eventDate ? (eventPassed ? "Event has passed" : `Collect at event`) : "Waiting to collect"}
                          </span>
                        ) : null}
                      </div>
                    )}

                    {/* Ticket status */}
                    {isTicket && claim.status === "fulfilled" && (
                      <div className="flex items-center gap-2 mb-3">
                        <Ticket size={12} className="text-muted-foreground shrink-0" />
                        {ts?.scanned ? (
                          <span className="text-xs text-success font-medium">
                            Scanned{ts.scanned_at ? ` ${new Date(ts.scanned_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-foreground">
                            {eventPassed ? "Ticket unused" : "Check your email for the QR"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* VIP upgrade info */}
                    {isUpgrade && claim.status === "fulfilled" && (
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowUpCircle size={12} className="text-success shrink-0" />
                        <span className="text-xs text-foreground">Your ticket has been upgraded</span>
                      </div>
                    )}

                    {/* Pending manual fulfilment */}
                    {claim.status === "claimed" && !isMerch && !isTicket && !isUpgrade && (
                      <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 mb-3">
                        <p className="text-[10px] text-muted-foreground">Awaiting fulfilment from your team.</p>
                      </div>
                    )}

                    {/* Cancelled reason */}
                    {claim.status === "cancelled" && claim.notes && (
                      <p className="text-[10px] text-muted-foreground mb-3 italic">{claim.notes}</p>
                    )}

                    {/* QR codes */}
                    {hasTickets && claim.status !== "cancelled" && (
                      <div className="space-y-1.5">
                        {claimMeta!.ticket_codes!.map((code) => (
                          <TicketQRButton
                            key={code}
                            ticketCode={code}
                            label={isMerch ? "Present at the merch stand to collect" : "Show this at the door"}
                          />
                        ))}
                      </div>
                    )}

                    {/* Footer: cost + date */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                      {claim.points_spent > 0 ? (
                        <p className="text-[10px] font-mono text-muted-foreground tabular-nums">
                          -{claim.points_spent} {currencyName}
                        </p>
                      ) : (
                        <span />
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(claim.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </TabsContent>
      </Tabs>
      {rewards.length === 0 && claims.length === 0 && (
        <EmptyState icon={Gift} title="No rewards yet" subtitle="Rewards will appear here once they're set up" />
      )}

      {/* ── Confirmation Modal (portalled) ── */}
      {confirmReward && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rep-fade-in px-4 pb-20">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 rep-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Confirm Purchase</h3>
              <button onClick={() => { setConfirmReward(null); setSelectedMerchSize(""); }} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              {confirmReward.image_url ? (
                <div className="h-14 w-14 rounded-xl overflow-hidden bg-muted/30 shrink-0">
                  <img src={confirmReward.image_url} alt="" className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Gift size={20} className="text-primary" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground">{confirmReward.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{getConfirmText(confirmReward)}</p>
              </div>
            </div>

            {/* Merch size picker */}
            {confirmReward.metadata?.fulfillment_type === "merch" && confirmReward.product?.sizes && confirmReward.product.sizes.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-foreground mb-2">Select Size</p>
                <div className="flex flex-wrap gap-2">
                  {confirmReward.product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedMerchSize(size)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        selectedMerchSize === size
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Cost</span>
                <div className="flex items-center gap-1">
                  <CurrencyIcon size={10} className="text-amber-400" />
                  <span className="text-sm font-bold font-mono text-amber-400">{confirmReward.points_cost}</span>
                  <span className="text-[10px] text-muted-foreground">{currencyName}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">Your balance</span>
                <span className="text-sm font-mono text-foreground tabular-nums">{myBalance} {currencyName}</span>
              </div>
              <div className="border-t border-border mt-2 pt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">After purchase</span>
                <span className="text-sm font-mono text-foreground tabular-nums">
                  {myBalance - (confirmReward.points_cost || 0)} {currencyName}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setConfirmReward(null); setSelectedMerchSize(""); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={
                  claimingId === confirmReward.id ||
                  (confirmReward.metadata?.fulfillment_type === "merch" && !selectedMerchSize)
                }
                onClick={() => handleClaim(confirmReward)}
              >
                {claimingId === confirmReward.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <ShoppingCart size={14} />
                    Buy Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.getElementById("rep-portal-root") || document.body
      )}

      {/* ── Success Animation with Confetti (portalled) ── */}
      {successReward && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* Confetti burst — skipped after 3rd claim */}
          {shouldShowConfetti() && (
            <div className="rep-confetti-container" aria-hidden>
              {[...Array(8)].map((_, i) => {
                const angle = (i / 8) * 360;
                const distance = 60 + Math.random() * 140;
                const cx = Math.cos((angle * Math.PI) / 180) * distance;
                const cy = Math.sin((angle * Math.PI) / 180) * distance - 40;
                const colors = ["#8B5CF6", "#34D399", "#F59E0B", "#F43F5E", "#38BDF8", "#A78BFA", "#FBBF24"];
                return (
                  <div
                    key={i}
                    className="rep-confetti-piece"
                    style={{
                      "--cx": `${cx}px`,
                      "--cy": `${cy}px`,
                      "--cr": `${Math.random() * 720 - 360}deg`,
                      backgroundColor: colors[i % colors.length],
                      animationDelay: `${i * 25}ms`,
                      borderRadius: i % 3 === 0 ? "50%" : "2px",
                      width: `${5 + Math.random() * 5}px`,
                      height: `${5 + Math.random() * 5}px`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          )}

          <div className="text-center rep-celebrate z-10">
            <div className="relative inline-block mb-4">
              <div className="h-20 w-20 rounded-2xl bg-success/15 border border-success/30 flex items-center justify-center mx-auto rep-reward-success-ring">
                {successReward.image_url ? (
                  <img src={successReward.image_url} alt="" className="h-14 w-14 object-contain" />
                ) : (
                  <Sparkles size={28} className="text-success" />
                )}
              </div>
              {/* Particles */}
              <div className="rep-success-particles" aria-hidden>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rep-success-particle" style={{ '--i': i } as React.CSSProperties} />
                ))}
              </div>
            </div>
            {(() => {
              const msg = getSuccessMessage(successReward, successData);
              return (
                <>
                  <h3 className="text-lg font-bold text-foreground mb-1 rep-title-reveal">
                    {msg.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-1">{msg.subtitle}</p>
                </>
              );
            })()}
            <p className="text-xs text-amber-400 font-mono">-{successReward.points_cost} {currencyName}</p>
            <button
              onClick={() => { setSuccessReward(null); setSuccessData(null); }}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>,
        document.getElementById("rep-portal-root") || document.body
      )}

      {/* ── Claim Error Modal (portalled) ── */}
      {claimError && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm rep-fade-in">
          <div className="w-full max-w-sm mx-4 mb-4 md:mb-0 rounded-2xl border border-destructive/20 bg-background p-6 rep-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4">
                <XCircle size={24} className="text-destructive" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">Couldn&apos;t Claim</h3>
              <p className="text-sm text-muted-foreground mb-5">{claimError}</p>
              <Button onClick={() => setClaimError(null)} className="w-full">
                OK
              </Button>
            </div>
          </div>
        </div>,
        document.getElementById("rep-portal-root") || document.body
      )}
    </div>
  );
}
