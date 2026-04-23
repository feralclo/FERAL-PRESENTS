"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Coins,
  Wallet,
  Scroll,
  ArrowDownToLine,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";

// ---------------------------------------------------------------------------
// Types matching the three backend endpoints
// ---------------------------------------------------------------------------

interface BalanceData {
  float: number;
  earned: number;
  committed: number;
  float_net_of_commitments: number;
  fiat_rate_pence: number;
  float_pence: number;
  earned_pence_gross: number;
  platform_cut_bps: number;
  earned_pence_net: number;
  min_payout_pence: number;
  low_float_warning: boolean;
}

interface LedgerEntry {
  id: number;
  created_at: string;
  entry_type: string;
  ep_amount: number;
  fiat_rate_pence: number;
  notes: string | null;
  rep_id: string | null;
  rep_display_name: string | null;
  quest_submission_id: string | null;
  reward_claim_id: string | null;
  ep_purchase_id: string | null;
  payout_id: string | null;
  signed_float_delta: number;
  signed_earned_delta: number;
  signed_rep_delta: number;
}

interface Payout {
  id: string;
  ep_amount: number;
  platform_cut_bps: number;
  fiat_rate_pence: number;
  gross_pence: number;
  platform_cut_pence: number;
  tenant_net_pence: number;
  fiat_currency: string;
  stripe_transfer_id: string | null;
  period_start: string;
  period_end: string;
  status: "pending" | "paid" | "failed";
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatEp(n: number): string {
  return `${n.toLocaleString("en-GB")} EP`;
}

function formatPence(pence: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(pence / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  tenant_purchase: "Bought EP",
  tenant_purchase_reversal: "Refund of EP purchase",
  tenant_quest_debit: "Quest reward awarded",
  tenant_quest_reversal: "Quest approval reversed",
  rep_shop_debit: "Rep redeemed reward",
  rep_shop_reversal: "Rep claim cancelled",
  tenant_payout: "Payout to you",
  tenant_payout_reversal: "Payout reversed",
  rep_quest_credit: "Rep earned EP",
  rep_quest_reversal: "Rep EP clawback",
  platform_bonus: "Platform bonus",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "float" | "earned" | "ledger" | "payouts";

export default function EpAdminPage() {
  const [tab, setTab] = useState<Tab>("float");
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  // Per-resource loading — Float / Earned only need balance, Ledger & Payouts
  // each render a skeleton independently so a slow endpoint doesn't block the page.
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [balanceError, setBalanceError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load helpers set state only asynchronously (after await). Initial
  // loading=true comes from useState; refresh button handles resets.
  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ep/balance", { cache: "no-store" });
      if (res.ok) {
        const { data } = await res.json();
        setBalance(data);
        setBalanceError(false);
      } else {
        setBalanceError(true);
      }
    } catch {
      setBalanceError(true);
    }
    setLoadingBalance(false);
  }, []);

  const loadLedger = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ep/ledger?limit=100", { cache: "no-store" });
      if (res.ok) {
        const { data } = await res.json();
        setLedger(data);
      }
    } catch {
      /* network */
    }
    setLoadingLedger(false);
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ep/payouts?limit=50", { cache: "no-store" });
      if (res.ok) {
        const { data } = await res.json();
        setPayouts(data);
      }
    } catch {
      /* network */
    }
    setLoadingPayouts(false);
  }, []);

  useEffect(() => {
    // Fires three async fetches; state writes happen after await so they're
    // not synchronous-within-effect in practice. Rule flags the transitive
    // chain; refactoring to avoid it would require pulling in a data-library.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBalance();
    loadLedger();
    loadPayouts();
  }, [loadBalance, loadLedger, loadPayouts]);

  const refresh = async () => {
    setRefreshing(true);
    setLoadingBalance(true);
    setLoadingLedger(true);
    setLoadingPayouts(true);
    await Promise.all([loadBalance(), loadLedger(), loadPayouts()]);
    setRefreshing(false);
  };

  // Hard-fail only if the balance endpoint dies — without it we can't render
  // the Float/Earned tabs meaningfully. Ledger/Payouts skeletons render inline.
  if (balanceError && !balance) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Failed to load EP data</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Coins size={20} className="text-primary" />
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
              EP Economy
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your EP balance, ledger, and payout history
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="gap-2">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Low-float warning */}
      {balance?.low_float_warning && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Low EP float</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your EP float ({formatEp(balance.float)}) is below your open
                quest commitments ({formatEp(balance.committed)}). Approvals
                will be blocked once float hits zero — top up to keep running.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            { id: "float", label: "Float", icon: Wallet },
            { id: "earned", label: "Earned", icon: Coins },
            { id: "ledger", label: "Ledger", icon: Scroll },
            { id: "payouts", label: "Payouts", icon: ArrowDownToLine },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              {label}
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Float tab */}
      {tab === "float" &&
        (loadingBalance && !balance ? (
          <BalanceSkeleton withBuyCta />
        ) : balance ? (
          <FloatTab balance={balance} onBought={refresh} />
        ) : (
          <InlineError onRetry={loadBalance} />
        ))}

      {/* Earned tab */}
      {tab === "earned" &&
        (loadingBalance && !balance ? (
          <BalanceSkeleton />
        ) : balance ? (
          <EarnedTab balance={balance} />
        ) : (
          <InlineError onRetry={loadBalance} />
        ))}

      {/* Ledger tab */}
      {tab === "ledger" &&
        (loadingLedger && ledger.length === 0 ? (
          <RowsSkeleton rows={6} />
        ) : (
          <LedgerTab entries={ledger} />
        ))}

      {/* Payouts tab */}
      {tab === "payouts" &&
        (loadingPayouts && payouts.length === 0 ? (
          <RowsSkeleton rows={4} />
        ) : (
          <PayoutsTab payouts={payouts} />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function BalanceSkeleton({ withBuyCta }: { withBuyCta?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="border-border bg-card p-6">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-7 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
          </Card>
        ))}
      </div>
      {withBuyCta && (
        <Card className="border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          </div>
        </Card>
      )}
    </div>
  );
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="border-border bg-card">
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-border bg-card p-10 text-center">
      <p className="text-sm text-muted-foreground">Couldn&apos;t load EP balance.</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 gap-2">
        <RefreshCw size={14} />
        Retry
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Float tab — current balance + Buy EP flow
// ---------------------------------------------------------------------------

function FloatTab({
  balance,
  onBought,
}: {
  balance: BalanceData;
  onBought: () => void;
}) {
  const [showBuy, setShowBuy] = useState(false);
  const [amount, setAmount] = useState("1000");
  const [purchasing, setPurchasing] = useState(false);
  const [status, setStatus] = useState("");
  // Confirmation modal — protects against fat-finger large purchases.
  // "Confirm" in the form opens this; actual Stripe redirect happens from here.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleBuy = async () => {
    const ep = parseInt(amount, 10);
    if (!Number.isFinite(ep) || ep < 100) {
      setStatus("Minimum purchase is 100 EP");
      return;
    }
    setPurchasing(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/ep/purchase-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ep_amount: ep }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to create purchase");
      }
      const { data } = await res.json();
      const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!pk) throw new Error("Stripe publishable key not configured");
      const stripe = await loadStripe(pk);
      if (!stripe) throw new Error("Stripe failed to load");
      const { error } = await stripe.confirmPayment({
        clientSecret: data.client_secret,
        confirmParams: {
          return_url: `${window.location.origin}/admin/ep/?purchase_id=${data.purchase_id}`,
        },
      });
      if (error) throw new Error(error.message || "Payment failed");
      // Stripe redirects away on success; if we get here it's pending
      setStatus("Payment pending confirmation");
      onBought();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Balance cards — keyed numeric spans remount on value change, which
          fires the `.numeric-change` animation for an iOS-style fade-in. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Available float
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            <span key={balance.float} className="numeric-change inline-block">
              {formatEp(balance.float)}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ≈ {formatPence(balance.float_pence)} at{" "}
            {formatPence(balance.fiat_rate_pence)}/EP
          </p>
        </Card>
        <Card className="border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Committed
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            <span key={balance.committed} className="numeric-change inline-block">
              {formatEp(balance.committed)}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reserved for open quest approvals
          </p>
        </Card>
        <Card className="border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Net available
          </p>
          <p
            className={`mt-2 text-2xl font-bold tabular-nums ${
              balance.float_net_of_commitments < 0
                ? "text-destructive"
                : "text-foreground"
            }`}
          >
            <span
              key={balance.float_net_of_commitments}
              className="numeric-change inline-block"
            >
              {formatEp(Math.max(0, balance.float_net_of_commitments))}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Float minus commitments
          </p>
        </Card>
      </div>

      {/* Buy EP */}
      <Card className="border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
              Buy EP
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Top up your float to fund quest rewards. 1 EP ={" "}
              {formatPence(balance.fiat_rate_pence)}.
            </p>
          </div>
          {!showBuy && (
            <Button onClick={() => setShowBuy(true)} className="gap-2">
              <Plus size={14} />
              Buy EP
            </Button>
          )}
        </div>

        {showBuy && (
          <div className="mt-4 space-y-4">
            <Separator />
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="ep-amount">EP amount</Label>
                <Input
                  id="ep-amount"
                  type="number"
                  min={100}
                  step={100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000"
                />
                <p className="text-xs text-muted-foreground">
                  {formatEp(parseInt(amount || "0", 10))} ={" "}
                  {formatPence(
                    (parseInt(amount || "0", 10) || 0) * balance.fiat_rate_pence
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBuy(false);
                    setStatus("");
                  }}
                  disabled={purchasing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const ep = parseInt(amount || "0", 10);
                    if (!Number.isFinite(ep) || ep < 100) {
                      setStatus("Minimum purchase is 100 EP");
                      return;
                    }
                    setStatus("");
                    setConfirmOpen(true);
                  }}
                  disabled={purchasing}
                  className="gap-2"
                >
                  {purchasing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  Confirm
                </Button>
              </div>
            </div>
            {status && (
              <p className="text-sm text-destructive">{status}</p>
            )}
          </div>
        )}
      </Card>

      {/* Buy EP confirmation — two-step so large amounts don't skip straight to Stripe */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!purchasing) setConfirmOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm EP purchase</DialogTitle>
            <DialogDescription>
              You&apos;ll be redirected to Stripe to complete the payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                {formatEp(parseInt(amount || "0", 10) || 0)}
              </span>
            </div>
            <Separator />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">You pay</span>
              <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                {formatPence(
                  (parseInt(amount || "0", 10) || 0) * balance.fiat_rate_pence
                )}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>Rate</span>
              <span className="font-mono tabular-nums">
                {formatPence(balance.fiat_rate_pence)} per EP
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={purchasing}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleBuy();
                setConfirmOpen(false);
              }}
              disabled={purchasing}
              className="gap-2"
            >
              {purchasing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Go to Stripe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Earned tab — EP redeemed by reps at your shop, pending next payout
// ---------------------------------------------------------------------------

function EarnedTab({ balance }: { balance: BalanceData }) {
  const cutPct = (balance.platform_cut_bps / 100).toFixed(1);
  const aboveMin = balance.earned_pence_net >= balance.min_payout_pence;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Earned this cycle
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            <span key={balance.earned} className="numeric-change inline-block">
              {formatEp(balance.earned)}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Gross {formatPence(balance.earned_pence_gross)}
          </p>
        </Card>
        <Card className="border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Platform fee ({cutPct}%)
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            <span
              key={balance.earned_pence_gross - balance.earned_pence_net}
              className="numeric-change inline-block"
            >
              {formatPence(balance.earned_pence_gross - balance.earned_pence_net)}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Entry&apos;s cut on redemptions
          </p>
        </Card>
        <Card className="border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Next payout (net)
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            <span key={balance.earned_pence_net} className="numeric-change inline-block">
              {formatPence(balance.earned_pence_net)}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {aboveMin
              ? "Will pay at next monthly cron"
              : `Below ${formatPence(balance.min_payout_pence)} minimum — rolls to next cycle`}
          </p>
        </Card>
      </div>

      <Card className="border-border bg-card p-6">
        <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          How this works
        </h2>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            When a rep on your team redeems an EP reward from your shop, EP
            flows out of their balance and into your &ldquo;earned&rdquo; pot.
          </p>
          <p>
            Once a month, Entry issues a Stripe Transfer to your connected
            account for the total earned this cycle, minus the platform fee.
            You need a connected Stripe account to receive payouts.
          </p>
          <p>
            Amounts below {formatPence(balance.min_payout_pence)} (net) roll
            forward to the next cycle instead of paying out, to avoid
            Stripe&apos;s small-transfer fees eating the whole transfer.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger tab — every EP movement affecting this tenant
// ---------------------------------------------------------------------------

export type LedgerCategory = "all" | "purchase" | "quest" | "shop" | "payout";

// Map entry_type to a user-facing category for filter pills
export function categoryOf(entryType: string): Exclude<LedgerCategory, "all"> | null {
  if (entryType.startsWith("tenant_purchase")) return "purchase";
  if (entryType.endsWith("quest_debit") || entryType.endsWith("quest_reversal") || entryType.startsWith("rep_quest")) return "quest";
  if (entryType.startsWith("rep_shop")) return "shop";
  if (entryType.startsWith("tenant_payout")) return "payout";
  return null;
}

export function dayKey(iso: string): string {
  // Group by local calendar date — tenants expect "yesterday" to behave
  // like their own day, not UTC midnight.
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function LedgerTab({ entries }: { entries: LedgerEntry[] }) {
  const [cat, setCat] = useState<LedgerCategory>("all");

  const filtered = cat === "all"
    ? entries
    : entries.filter((e) => categoryOf(e.entry_type) === cat);

  const counts: Record<LedgerCategory, number> = {
    all: entries.length,
    purchase: entries.filter((e) => categoryOf(e.entry_type) === "purchase").length,
    quest: entries.filter((e) => categoryOf(e.entry_type) === "quest").length,
    shop: entries.filter((e) => categoryOf(e.entry_type) === "shop").length,
    payout: entries.filter((e) => categoryOf(e.entry_type) === "payout").length,
  };

  if (entries.length === 0) {
    return (
      <Card className="border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No EP movements yet. Buy EP or create a quest with a reward to get
          started.
        </p>
      </Card>
    );
  }

  // Group filtered entries by day for sticky headers
  const grouped: Array<{ day: string; entries: LedgerEntry[] }> = [];
  let current: { day: string; entries: LedgerEntry[] } | null = null;
  for (const e of filtered) {
    const k = dayKey(e.created_at);
    if (!current || current.day !== k) {
      current = { day: k, entries: [] };
      grouped.push(current);
    }
    current.entries.push(e);
  }

  return (
    <div className="space-y-4">
      {/* Category filter pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {(
          [
            { id: "all" as const, label: "All" },
            { id: "purchase" as const, label: "Purchases" },
            { id: "quest" as const, label: "Quests" },
            { id: "shop" as const, label: "Shop" },
            { id: "payout" as const, label: "Payouts" },
          ]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setCat(id)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              cat === id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {label}
            <span className={`ml-1.5 text-[10px] tabular-nums ${cat === id ? "opacity-90" : "opacity-60"}`}>
              {counts[id]}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No entries match this filter.
          </p>
        </Card>
      ) : (
        <Card className="border-border bg-card">
          {grouped.map((group) => (
            <div key={group.day}>
              <div className="sticky top-0 z-[1] border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                  {group.day}
                  <span className="ml-2 tabular-nums text-foreground/60">
                    {group.entries.length}
                  </span>
                </p>
              </div>
              <div className="divide-y divide-border">
                {group.entries.map((entry) => (
                  <LedgerRow key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const label = ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type;
  // Which column is primary for this entry type? Float-affecting rows show
  // float delta; shop/payout rows show earned delta; rep-only rows show rep.
  const primary =
    entry.signed_float_delta !== 0
      ? {
          label: "Float",
          value: entry.signed_float_delta,
        }
      : entry.signed_earned_delta !== 0
      ? { label: "Earned", value: entry.signed_earned_delta }
      : { label: "Rep", value: entry.signed_rep_delta };

  const isReversal = entry.entry_type.endsWith("_reversal");
  const isPositive = primary.value > 0;

  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
          {isReversal && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              reversal
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDate(entry.created_at)}</span>
          {entry.rep_display_name && <span>· {entry.rep_display_name}</span>}
          {entry.notes && <span className="truncate">· {entry.notes}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`font-mono text-sm font-semibold ${
            isPositive
              ? "text-[color:var(--success,_#34D399)]"
              : primary.value < 0
              ? "text-[color:var(--destructive,_#F43F5E)]"
              : "text-muted-foreground"
          }`}
        >
          {primary.value > 0 ? "+" : ""}
          {primary.value} EP
        </p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {primary.label}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payouts tab — Stripe Transfer history
// ---------------------------------------------------------------------------

function PayoutsTab({ payouts }: { payouts: Payout[] }) {
  if (payouts.length === 0) {
    return (
      <Card className="border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No payouts yet. Payouts run on the 1st of each month for any tenant
          with earned EP above the minimum threshold.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <div className="divide-y divide-border">
        {payouts.map((payout) => (
          <div key={payout.id} className="flex items-center gap-4 p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {formatPence(payout.tenant_net_pence, payout.fiat_currency)}{" "}
                  payout
                </p>
                <StatusBadge status={payout.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>
                  {formatEp(payout.ep_amount)} ·{" "}
                  {new Date(payout.period_start).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                  {" → "}
                  {new Date(payout.period_end).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span>· Fee {formatPence(payout.platform_cut_pence)}</span>
                {payout.paid_at && (
                  <span>· Paid {formatDate(payout.paid_at)}</span>
                )}
              </div>
              {payout.failure_reason && (
                <p className="mt-1 text-xs text-destructive">
                  {payout.failure_reason}
                </p>
              )}
            </div>
            {payout.stripe_transfer_id && (
              <a
                href={`https://dashboard.stripe.com/transfers/${payout.stripe_transfer_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="View in Stripe Dashboard"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: Payout["status"] }) {
  const label = status;
  if (status === "paid") {
    return (
      <Badge variant="outline" className="gap-1 text-[10px]">
        <CheckCircle2 size={10} /> paid
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="text-[10px]">
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {label}
    </Badge>
  );
}
