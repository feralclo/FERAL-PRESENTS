"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gift,
  Lock,
  Check,
  Loader2,
  ShoppingCart,
  Target,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  my_claims?: { id: string; status: string }[];
  can_purchase?: boolean;
}

interface Claim {
  id: string;
  claim_type: "milestone" | "points_shop" | "manual";
  points_spent: number;
  status: "claimed" | "fulfilled" | "cancelled";
  notes?: string;
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
    product?: { name: string; images?: string[] } | null;
  };
}

type TabId = "earned" | "shop" | "history";

// ─── Helpers ────────────────────────────────────────────────────────────────

const CLAIM_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof Check }> = {
  claimed: { label: "Pending", variant: "secondary", icon: Clock },
  fulfilled: { label: "Fulfilled", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RepRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [myPoints, setMyPoints] = useState(0);
  const [tab, setTab] = useState<TabId>("shop");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [confirmReward, setConfirmReward] = useState<Reward | null>(null);
  const [successReward, setSuccessReward] = useState<Reward | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [rewardsRes, meRes, claimsRes] = await Promise.all([
        fetch("/api/rep-portal/rewards"),
        fetch("/api/rep-portal/me"),
        fetch("/api/rep-portal/rewards/claims"),
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

      if (rewardsJson.data) setRewards(rewardsJson.data);
      if (meJson.data) setMyPoints(meJson.data.points_balance || 0);
      if (claimsJson.data) setClaims(claimsJson.data);
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
      const res = await fetch(`/api/rep-portal/rewards/${reward.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setError("");
        setSuccessReward(reward);
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
          if (meJson.data) setMyPoints(meJson.data.points_balance || 0);
        }
        if (claimsRes.ok) {
          const claimsJson = await claimsRes.json();
          if (claimsJson.data) setClaims(claimsJson.data);
        }
        // Auto-dismiss success after 3s
        setTimeout(() => setSuccessReward(null), 3000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Failed to claim reward");
      }
    } catch {
      setError("Failed to claim reward — check your connection");
    }
    setClaimingId(null);
  };

  const hasClaimed = (r: Reward) =>
    (r.my_claims?.length ?? 0) > 0 &&
    r.my_claims!.some((c) => c.status !== "cancelled");

  const milestoneRewards = rewards.filter((r) => r.reward_type === "milestone");
  const shopRewards = rewards.filter((r) => r.reward_type === "points_shop");

  // Auto-select tab based on content
  useEffect(() => {
    if (!loading) {
      if (shopRewards.length > 0) setTab("shop");
      else if (milestoneRewards.length > 0) setTab("earned");
      else if (claims.length > 0) setTab("history");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header with points balance */}
      <div className="flex items-center justify-between rep-slide-up">
        <div>
          <h1 className="text-xl font-bold rep-gradient-text">Rewards</h1>
          <p className="text-sm text-muted-foreground">Earn, spend, collect</p>
        </div>
        <div className="rounded-xl bg-primary/10 border border-primary/20 px-5 py-3 rep-glow rep-balance-breathe rep-scan-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={12} className="text-primary" />
            <p className="text-[9px] uppercase tracking-[2px] text-primary font-bold">Balance</p>
          </div>
          <p className="text-xl font-bold font-mono text-primary tabular-nums" style={{ textShadow: "0 0 16px rgba(139, 92, 246, 0.2)" }}>{myPoints}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="rep-tab-bar rep-slide-up" style={{ animationDelay: "50ms" }}>
        {[
          { id: "earned" as TabId, label: "Earned", count: milestoneRewards.length },
          { id: "shop" as TabId, label: "Shop", count: shopRewards.length },
          { id: "history" as TabId, label: "History", count: claims.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn("rep-tab", tab === t.id && "active")}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "ml-1.5 text-[10px]",
                tab === t.id ? "text-white/70" : "text-muted-foreground"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Inline error */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* ── Earned (Milestones) Tab ── */}
      {tab === "earned" && (
        <div className="space-y-3 rep-slide-up">
          {milestoneRewards.length === 0 ? (
            <EmptyState icon={Target} text="No milestones yet" sub="Milestones will appear as the team sets them up" />
          ) : (
            milestoneRewards.map((reward) => {
              const claimed = hasClaimed(reward);
              return (
                <Card
                  key={reward.id}
                  className={cn(
                    "py-0 gap-0 rep-card-lift",
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
                            <Badge variant="default" className="bg-success/15 text-success border-success/20 text-[9px] px-1.5 py-0">
                              Unlocked
                            </Badge>
                          )}
                        </div>
                        {reward.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{reward.description}</p>
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
                                      "text-[11px]",
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
      )}

      {/* ── Shop (Points Shop) Tab ── */}
      {tab === "shop" && (
        <div className="rep-slide-up">
          {shopRewards.length === 0 ? (
            <EmptyState icon={ShoppingCart} text="Shop is empty" sub="Rewards will appear here when they're available" />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {shopRewards.map((reward) => {
                const claimed = hasClaimed(reward);
                const canAfford = myPoints >= (reward.points_cost || 0);
                const soldOut = reward.total_available != null && reward.total_claimed >= reward.total_available;
                const remaining = reward.total_available != null ? reward.total_available - reward.total_claimed : null;

                // Tier glow based on cost
                const cost = reward.points_cost || 0;
                const glowClass = claimed ? "" : cost >= 500 ? "rep-reward-glow-legendary" : cost >= 200 ? "rep-reward-glow-high" : cost >= 50 ? "rep-reward-glow-mid" : "rep-reward-glow-low";

                return (
                  <Card
                    key={reward.id}
                    className={cn(
                      "py-0 gap-0 overflow-hidden rep-card-lift rep-shop-hover",
                      claimed ? "border-success/30" : "border-border/40",
                      glowClass
                    )}
                  >
                    {reward.image_url && (
                      <div className="relative h-32 bg-muted/20 flex items-center justify-center">
                        <img src={reward.image_url} alt="" className="max-h-full max-w-full object-contain p-3" />
                        {remaining !== null && remaining > 0 && remaining <= 5 && !claimed && (
                          <span className="absolute top-2 right-2 text-[9px] font-bold text-warning bg-warning/15 border border-warning/20 px-2 py-0.5 rounded-full animate-pulse">
                            {remaining} left
                          </span>
                        )}
                      </div>
                    )}
                    <CardContent className="p-3">
                      <h3 className="text-xs font-medium text-foreground mb-1 line-clamp-2">{reward.name}</h3>
                      {reward.description && (
                        <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">{reward.description}</p>
                      )}
                      <div className="flex items-baseline gap-1 mb-3">
                        <Zap size={10} className="text-primary" />
                        <span className="text-lg font-bold font-mono text-primary tabular-nums">
                          {reward.points_cost}
                        </span>
                        <span className="text-[10px] text-muted-foreground">pts</span>
                      </div>

                      {claimed ? (
                        <div className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-success/10 text-[11px] text-success font-medium">
                          <Check size={12} style={{ filter: "drop-shadow(0 0 4px rgba(52, 211, 153, 0.4))" }} /> Claimed
                        </div>
                      ) : soldOut ? (
                        <div className="text-[11px] text-muted-foreground font-medium text-center py-2">Sold out</div>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full text-[11px]"
                          disabled={!canAfford || claimingId === reward.id}
                          onClick={() => setConfirmReward(reward)}
                        >
                          {claimingId === reward.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : canAfford ? (
                            <>
                              <ShoppingCart size={12} />
                              Buy with {reward.points_cost} pts
                            </>
                          ) : (
                            `Need ${(reward.points_cost || 0) - myPoints} more`
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div className="space-y-2 rep-slide-up">
          {claims.length === 0 ? (
            <EmptyState icon={Clock} text="No claim history" sub="Your reward claims will show up here" />
          ) : (
            claims.map((claim) => {
              const config = CLAIM_STATUS_CONFIG[claim.status] || CLAIM_STATUS_CONFIG.claimed;
              const StatusIcon = config.icon;
              const reward = claim.reward;
              const productImg = reward?.product?.images?.[0];
              const imgUrl = reward?.image_url || productImg;

              return (
                <Card key={claim.id} className="py-0 gap-0 rep-card-lift border-border/40">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {imgUrl ? (
                        <div className="h-11 w-11 shrink-0 rounded-lg overflow-hidden bg-muted/30">
                          <img src={imgUrl} alt="" className="h-full w-full object-contain" />
                        </div>
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/30">
                          <Gift size={16} className="text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-foreground line-clamp-1">
                              {reward?.name || "Reward"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant={config.variant} className="text-[9px] px-1.5 py-0 gap-1">
                                <StatusIcon size={9} />
                                {config.label}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground capitalize">
                                {claim.claim_type === "points_shop" ? "Points" : claim.claim_type}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {claim.points_spent > 0 && (
                              <p className="text-xs font-mono text-muted-foreground tabular-nums">
                                -{claim.points_spent} pts
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(claim.created_at).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                          </div>
                        </div>
                        {/* Show fulfilment details */}
                        {claim.status === "fulfilled" && (
                          <div className="mt-2 rounded-lg bg-success/5 border border-success/10 px-3 py-2">
                            <p className="text-[10px] text-success font-medium flex items-center gap-1">
                              <CheckCircle2 size={10} /> Fulfilled
                              {claim.fulfilled_at && (
                                <span className="text-muted-foreground font-normal ml-1">
                                  {new Date(claim.fulfilled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </span>
                              )}
                            </p>
                            {reward?.custom_value && (
                              <p className="text-[11px] text-foreground/80 mt-1">{reward.custom_value}</p>
                            )}
                            {reward?.product?.name && (
                              <p className="text-[11px] text-foreground/80 mt-1">Product: {reward.product.name}</p>
                            )}
                            {claim.notes && (
                              <p className="text-[10px] text-muted-foreground mt-1 italic">&ldquo;{claim.notes}&rdquo;</p>
                            )}
                          </div>
                        )}
                        {claim.status === "cancelled" && claim.notes && (
                          <p className="text-[10px] text-muted-foreground mt-1 italic">{claim.notes}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {rewards.length === 0 && claims.length === 0 && (
        <EmptyState icon={Gift} text="No rewards yet" sub="Rewards will appear here once they're set up" />
      )}

      {/* ── Confirmation Modal ── */}
      {confirmReward && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm rep-fade-in">
          <div className="w-full max-w-sm mx-4 mb-4 md:mb-0 rounded-2xl border border-border bg-background p-6 rep-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Confirm Purchase</h3>
              <button onClick={() => setConfirmReward(null)} className="text-muted-foreground hover:text-foreground">
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
                {confirmReward.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{confirmReward.description}</p>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Cost</span>
                <div className="flex items-center gap-1">
                  <Zap size={10} className="text-primary" />
                  <span className="text-sm font-bold font-mono text-primary">{confirmReward.points_cost}</span>
                  <span className="text-[10px] text-muted-foreground">pts</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">Your balance</span>
                <span className="text-sm font-mono text-foreground tabular-nums">{myPoints} pts</span>
              </div>
              <div className="border-t border-border mt-2 pt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">After purchase</span>
                <span className="text-sm font-mono text-foreground tabular-nums">
                  {myPoints - (confirmReward.points_cost || 0)} pts
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmReward(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={claimingId === confirmReward.id}
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
        </div>
      )}

      {/* ── Success Animation with Confetti ── */}
      {successReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* Confetti burst */}
          <div className="rep-confetti-container" aria-hidden>
            {[...Array(24)].map((_, i) => {
              const angle = (i / 24) * 360;
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
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="rep-success-particle" style={{ '--i': i } as React.CSSProperties} />
                ))}
              </div>
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1 rep-title-reveal">
              Reward Claimed!
            </h3>
            <p className="text-sm text-muted-foreground mb-1">{successReward.name}</p>
            <p className="text-xs text-primary font-mono">-{successReward.points_cost} pts</p>
            <button
              onClick={() => setSuccessReward(null)}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  text,
  sub,
}: {
  icon: typeof Gift;
  text: string;
  sub: string;
}) {
  return (
    <div className="text-center py-16">
      <div className="rep-empty-icon h-14 w-14 mx-auto mb-4">
        <div className="rep-empty-ring" />
        <div className="rep-empty-ring" />
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Icon size={22} className="text-primary/50" />
        </div>
      </div>
      <p className="text-sm text-foreground font-medium mb-1">{text}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
