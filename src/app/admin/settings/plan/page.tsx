"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Check,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Crown,
  Zap,
  CreditCard,
  ArrowRight,
  TrendingDown,
} from "lucide-react";
import type { PlanId, PlatformPlan, OrgPlanSettings } from "@/types/plans";

interface BillingStatus {
  current_plan: PlatformPlan;
  plan_settings: OrgPlanSettings;
  plans: Record<PlanId, PlatformPlan>;
}

/** Calculate total fee and "you keep" for a given ticket price (in £) */
function calcFee(plan: PlatformPlan, ticketPrice: number) {
  const fee =
    (ticketPrice * plan.card_rate_percent) / 100 + plan.card_rate_fixed / 100;
  const kept = ticketPrice - fee;
  return { fee: fee.toFixed(2), kept: kept.toFixed(2) };
}

export default function PlanPage() {
  const [data, setData] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/billing/status");
        if (!res.ok) throw new Error("Failed to fetch plan status");
        setData(await res.json());
      } catch {
        setError("Failed to load plan information");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleUpgrade() {
    setActionLoading("upgrade");
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create checkout");
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start upgrade");
      setActionLoading(null);
    }
  }

  async function handleManageBilling() {
    setActionLoading("portal");
    setError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error || "Failed to open billing portal");
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to open billing portal"
      );
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error || "Failed to load plan information"}
        </div>
      </div>
    );
  }

  const { current_plan, plan_settings, plans } = data;
  const isStarter = current_plan.id === "starter";
  const isPro = current_plan.id === "pro";
  const billingWaived = plan_settings.billing_waived;
  const hasActiveSubscription =
    plan_settings.subscription_status === "active";
  const isPastDue = plan_settings.subscription_status === "past_due";
  const proTrialDays = plans.pro?.trial_days || 0;

  // Savings calculation for upgrade pitch
  const starterFee20 = calcFee(plans.starter, 20);
  const proFee20 = calcFee(plans.pro, 20);
  const savingPer20 = (
    parseFloat(starterFee20.fee) - parseFloat(proFee20.fee)
  ).toFixed(2);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
              Plan &amp; Billing
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage your subscription and card rates
            </p>
          </div>
        </div>
      </div>

      {/* Past due warning */}
      {isPastDue && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Payment failed
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your last payment was unsuccessful. Update your payment method to
              keep your Pro rates.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={handleManageBilling}
              disabled={actionLoading === "portal"}
            >
              {actionLoading === "portal" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CreditCard size={14} />
              )}
              Update payment method
            </Button>
          </div>
        </div>
      )}

      {/* Billing waived banner */}
      {billingWaived && (
        <Card className="border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-3">
            <Crown size={20} className="text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Billing managed by platform
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Your billing has been waived. You have full access to all
                features at your current rate.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Plan cards — side by side */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Starter */}
        <PlanCard
          plan={plans.starter}
          isActive={isStarter}
          billingWaived={billingWaived}
          actionArea={
            isStarter && !billingWaived ? (
              <div className="rounded-lg bg-foreground/5 px-4 py-3 text-center text-sm text-muted-foreground">
                This is your current plan
              </div>
            ) : isPro && !billingWaived ? (
              <div className="text-center text-xs text-muted-foreground">
                Downgrade via Manage Billing below
              </div>
            ) : null
          }
        />

        {/* Pro */}
        <PlanCard
          plan={plans.pro}
          isActive={isPro}
          billingWaived={billingWaived}
          highlighted
          actionArea={
            !billingWaived ? (
              isPro && hasActiveSubscription ? (
                <div className="rounded-lg bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">
                  Your current plan
                </div>
              ) : (
                <Button
                  onClick={handleUpgrade}
                  disabled={!!actionLoading}
                  className="w-full gap-2"
                  size="lg"
                >
                  {actionLoading === "upgrade" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Zap size={16} />
                  )}
                  {proTrialDays > 0
                    ? `Start ${proTrialDays}-day free trial`
                    : "Upgrade to Pro"}
                </Button>
              )
            ) : null
          }
        />
      </div>

      {/* Savings pitch (only show on Starter) */}
      {isStarter && !billingWaived && (
        <Card className="border-primary/20 bg-primary/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <TrendingDown size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Save {"\u00A3"}{savingPer20} on every {"\u00A3"}20 ticket with
                Pro
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                On Starter, a {"\u00A3"}20 ticket costs {"\u00A3"}
                {starterFee20.fee} in fees. On Pro, it{"'"}s just {"\u00A3"}
                {proFee20.fee}. Sell around 850 tickets a month at that price
                and Pro pays for itself.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Active subscription management */}
      {isPro && hasActiveSubscription && !billingWaived && (
        <Card className="border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CreditCard size={18} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Subscription active
                </p>
                {plan_settings.current_period_end && (
                  <p className="text-xs text-muted-foreground">
                    Next billing:{" "}
                    {new Date(
                      plan_settings.current_period_end
                    ).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageBilling}
              disabled={!!actionLoading}
              className="gap-2"
            >
              {actionLoading === "portal" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ExternalLink size={14} />
              )}
              Manage Billing
            </Button>
          </div>
        </Card>
      )}

      {/* How card rates work */}
      <Card className="border-border bg-card p-5">
        <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          How card rates work
        </h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Card rates are charged per transaction when a customer buys a
            ticket. The fee is deducted automatically — you receive the rest.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-foreground/[0.03] p-3">
              <div className="mb-1 text-xs font-medium text-foreground">
                {"\u00A3"}20 ticket on Starter
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {"\u00A3"}{starterFee20.fee} fee
                <ArrowRight
                  size={12}
                  className="text-muted-foreground/50"
                />
                <span className="font-medium text-foreground">
                  you keep {"\u00A3"}{starterFee20.kept}
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-primary/5 p-3">
              <div className="mb-1 text-xs font-medium text-primary">
                {"\u00A3"}20 ticket on Pro
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {"\u00A3"}{proFee20.fee} fee
                <ArrowRight
                  size={12}
                  className="text-muted-foreground/50"
                />
                <span className="font-medium text-foreground">
                  you keep {"\u00A3"}{proFee20.kept}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Plan card component ── */

function PlanCard({
  plan,
  isActive,
  billingWaived,
  highlighted,
  actionArea,
}: {
  plan: PlatformPlan;
  isActive: boolean;
  billingWaived: boolean;
  highlighted?: boolean;
  actionArea?: React.ReactNode;
}) {
  const example = calcFee(plan, 20);

  return (
    <Card
      className={`relative flex flex-col border-border bg-card p-5 transition-all ${
        highlighted && !isActive
          ? "ring-1 ring-primary/30 hover:ring-primary/50"
          : ""
      } ${isActive && !billingWaived ? "ring-1 ring-primary/50" : ""}`}
    >
      {/* Top badges */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {plan.id === "pro" ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Crown size={14} className="text-primary" />
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground/5">
              <Zap size={14} className="text-muted-foreground" />
            </div>
          )}
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            {plan.name}
          </h3>
        </div>
        {isActive && !billingWaived && (
          <Badge variant="default" className="text-[10px]">
            Current
          </Badge>
        )}
        {plan.trial_days > 0 && !isActive && (
          <Badge
            variant="outline"
            className="border-primary/30 text-[10px] text-primary"
          >
            {plan.trial_days}-day free trial
          </Badge>
        )}
      </div>

      {/* Price */}
      <div className="mb-1">
        <span className="text-3xl font-bold tracking-tight text-foreground">
          {plan.monthly_price === 0
            ? "Free"
            : `\u00A3${(plan.monthly_price / 100).toFixed(0)}`}
        </span>
        {plan.monthly_price > 0 && (
          <span className="text-sm text-muted-foreground">/month</span>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{plan.description}</p>

      {/* Card rate highlight */}
      <div className="mb-4 rounded-lg bg-foreground/[0.03] px-4 py-3">
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Card rates</span>
        </div>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">
          {plan.card_rate_label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/60">
          {"\u00A3"}20 ticket{" "}
          <ArrowRight size={10} className="inline" /> you keep{" "}
          {"\u00A3"}{example.kept}
        </p>
      </div>

      <Separator className="mb-4" />

      {/* Features */}
      <ul className="mb-6 flex-1 space-y-2.5">
        {plan.features.map((feature) => {
          const isHighlight =
            feature === "Rep ambassador platform" ||
            feature === "Lower card rates";
          return (
            <li key={feature} className="flex items-start gap-2.5 text-sm">
              {isHighlight ? (
                <Zap size={15} className="mt-0.5 shrink-0 text-primary" />
              ) : (
                <Check size={15} className="mt-0.5 shrink-0 text-success" />
              )}
              <span
                className={
                  isHighlight
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {feature}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Action area */}
      {actionArea && <div className="mt-auto">{actionArea}</div>}
    </Card>
  );
}
