"use client";

import { useEffect, useState } from "react";
import { Gift, Lock, Check, Loader2, ShoppingCart, Target } from "lucide-react";

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
  // Milestone info
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
  // User claim status
  my_claims?: { id: string }[];
  can_purchase?: boolean;
}

export default function RepRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [myPoints, setMyPoints] = useState(0);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rewardsRes, meRes] = await Promise.all([
          fetch("/api/rep-portal/rewards"),
          fetch("/api/rep-portal/me"),
        ]);
        if (!rewardsRes.ok) {
          const errJson = await rewardsRes.json().catch(() => null);
          setError(errJson?.error || "Failed to load rewards (" + rewardsRes.status + ")");
          setLoading(false);
          return;
        }
        const rewardsJson = await rewardsRes.json();
        const meJson = meRes.ok ? await meRes.json() : { data: null };
        if (rewardsJson.data) setRewards(rewardsJson.data);
        if (meJson.data) setMyPoints(meJson.data.points_balance || 0);
      } catch { setError("Failed to load rewards — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  const handleClaim = async (rewardId: string) => {
    setClaimingId(rewardId);
    try {
      const res = await fetch(`/api/rep-portal/rewards/${rewardId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setError("");
        // Refresh
        const rewardsRes = await fetch("/api/rep-portal/rewards");
        const json = await rewardsRes.json();
        if (json.data) setRewards(json.data);

        const meRes = await fetch("/api/rep-portal/me");
        const meJson = await meRes.json();
        if (meJson.data) setMyPoints(meJson.data.points_balance || 0);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Failed to claim reward");
      }
    } catch { setError("Failed to claim reward — check your connection"); }
    setClaimingId(null);
  };

  const hasClaimed = (r: Reward) => (r.my_claims?.length ?? 0) > 0;

  const milestoneRewards = rewards.filter((r) => r.reward_type === "milestone");
  const shopRewards = rewards.filter((r) => r.reward_type === "points_shop");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && rewards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button
          onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
          className="text-xs text-[var(--rep-accent)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Rewards</h1>
          <p className="text-sm text-[var(--rep-text-muted)]">
            Earn points, unlock rewards
          </p>
        </div>
        <div className="rounded-xl bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/20 px-4 py-2">
          <p className="text-[10px] uppercase tracking-wider text-[var(--rep-accent)] mb-0.5">Balance</p>
          <p className="text-lg font-bold font-mono text-[var(--rep-accent)] tabular-nums">{myPoints}</p>
        </div>
      </div>

      {/* Inline error (e.g. claim failure) */}
      {error && rewards.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Milestones */}
      {milestoneRewards.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Target size={16} className="text-[var(--rep-accent)]" />
            <h2 className="text-sm font-semibold text-white">Milestones</h2>
          </div>
          <div className="space-y-3">
            {milestoneRewards.map((reward) => (
              <div
                key={reward.id}
                className={`rounded-2xl border p-4 transition-all ${
                  hasClaimed(reward)
                    ? "border-[var(--rep-success)]/30 bg-[var(--rep-success)]/5"
                    : "border-[var(--rep-border)] bg-[var(--rep-card)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  {reward.image_url ? (
                    <div className={`h-14 w-14 shrink-0 rounded-xl overflow-hidden ${!hasClaimed(reward) ? "rep-reward-locked" : ""}`}>
                      <img src={reward.image_url} alt="" className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${
                      hasClaimed(reward) ? "bg-[var(--rep-success)]/10" : "bg-[var(--rep-surface)]"
                    }`}>
                      {hasClaimed(reward) ? <Check size={20} className="text-[var(--rep-success)]" /> : <Lock size={20} className="text-[var(--rep-text-muted)]" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white">{reward.name}</h3>
                    {reward.description && (
                      <p className="text-[11px] text-[var(--rep-text-muted)] mt-0.5">{reward.description}</p>
                    )}
                    {reward.milestones && reward.milestones.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {reward.milestones.map((m) => (
                          <div key={m.id}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <div className={`h-1.5 w-1.5 rounded-full ${m.achieved ? "bg-[var(--rep-success)]" : "bg-[var(--rep-border)]"}`} />
                                <span className={`text-[11px] ${m.achieved ? "text-[var(--rep-success)]" : "text-[var(--rep-text-muted)]"}`}>
                                  {m.title}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-[var(--rep-text-muted)] tabular-nums">
                                {m.current_value}/{m.threshold_value}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-[var(--rep-border)] overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${m.achieved ? "bg-[var(--rep-success)]" : "bg-[var(--rep-accent)]"}`}
                                style={{ width: `${m.progress_percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {hasClaimed(reward) && (
                    <span className="shrink-0 text-[10px] font-semibold text-[var(--rep-success)] uppercase tracking-wider">
                      Unlocked
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Points Shop */}
      {shopRewards.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart size={16} className="text-[var(--rep-accent)]" />
            <h2 className="text-sm font-semibold text-white">Points Shop</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {shopRewards.map((reward) => {
              const canAfford = myPoints >= (reward.points_cost || 0);
              const soldOut = reward.total_available != null && reward.total_claimed >= reward.total_available;

              return (
                <div
                  key={reward.id}
                  className={`rounded-2xl border bg-[var(--rep-card)] overflow-hidden transition-all rep-card-hover ${
                    hasClaimed(reward) ? "border-[var(--rep-success)]/30" : "border-[var(--rep-border)]"
                  }`}
                >
                  {reward.image_url && (
                    <div className="relative h-28 bg-[var(--rep-surface)] flex items-center justify-center">
                      <img src={reward.image_url} alt="" className="max-h-full max-w-full object-contain p-3" />
                    </div>
                  )}
                  <div className="p-3">
                    <h3 className="text-xs font-medium text-white mb-1 line-clamp-1">{reward.name}</h3>
                    <p className="text-lg font-bold font-mono text-[var(--rep-accent)] tabular-nums mb-2">
                      {reward.points_cost} <span className="text-[10px] font-normal">pts</span>
                    </p>
                    {hasClaimed(reward) ? (
                      <div className="flex items-center gap-1 text-[10px] text-[var(--rep-success)]">
                        <Check size={10} /> Claimed
                      </div>
                    ) : soldOut ? (
                      <div className="text-[10px] text-[var(--rep-text-muted)]">Sold out</div>
                    ) : (
                      <button
                        onClick={() => handleClaim(reward.id)}
                        disabled={!canAfford || claimingId === reward.id}
                        className={`w-full rounded-lg py-2 text-[11px] font-semibold transition-all ${
                          canAfford
                            ? "bg-[var(--rep-accent)] text-white hover:brightness-110"
                            : "bg-[var(--rep-surface)] text-[var(--rep-text-muted)] cursor-not-allowed"
                        }`}
                      >
                        {claimingId === reward.id ? (
                          <Loader2 size={12} className="animate-spin mx-auto" />
                        ) : canAfford ? (
                          "Claim"
                        ) : (
                          `Need ${(reward.points_cost || 0) - myPoints} more`
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rewards.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rep-accent)]/10 mb-4">
            <Gift size={22} className="text-[var(--rep-accent)]" />
          </div>
          <p className="text-sm text-white font-medium mb-1">No rewards yet</p>
          <p className="text-xs text-[var(--rep-text-muted)]">Rewards will appear here once they&apos;re set up</p>
        </div>
      )}
    </div>
  );
}
