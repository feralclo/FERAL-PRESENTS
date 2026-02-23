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
} from "lucide-react";
import type { PlanId, PlatformPlan, OrgPlanSettings } from "@/types/plans";

interface BillingStatus {
  current_plan: PlatformPlan;
  plan_settings: OrgPlanSettings;
  plans: Record<PlanId, PlatformPlan>;
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
      if (!res.ok) throw new Error(json.error || "Failed to open billing portal");
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
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
  const hasActiveSubscription = plan_settings.subscription_status === "active";
  const isPastDue = plan_settings.subscription_status === "past_due";

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles size={20} className="text-primary" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
            Plan &amp; Billing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your subscription and platform fees
          </p>
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
              Your last payment was unsuccessful. Please update your payment
              method to keep your Pro plan active.
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
                <ExternalLink size={14} />
              )}
              Update payment method
            </Button>
          </div>
        </div>
      )}

      {/* Current plan banner */}
      <Card className="border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
                Current Plan
              </h2>
              <Badge
                variant={isPro ? "default" : "secondary"}
                className="text-[10px] uppercase"
              >
                {current_plan.name}
              </Badge>
              {billingWaived && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  Billing Waived
                </Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {current_plan.description}
            </p>
          </div>
          {isPro && (
            <Crown size={24} className="shrink-0 text-primary" />
          )}
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Platform fee</span>
            <p className="font-mono font-semibold text-foreground">
              {current_plan.fee_percent}%
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Minimum fee</span>
            <p className="font-mono font-semibold text-foreground">
              {"\u00A3"}{(current_plan.min_fee / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Monthly price</span>
            <p className="font-mono font-semibold text-foreground">
              {current_plan.monthly_price === 0
                ? "Free"
                : `\u00A3${(current_plan.monthly_price / 100).toFixed(2)}/mo`}
            </p>
          </div>
        </div>

        {/* Subscription info */}
        {isPro && hasActiveSubscription && plan_settings.current_period_end && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Next billing date</span>
              <span className="text-foreground">
                {new Date(plan_settings.current_period_end).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "long", year: "numeric" }
                )}
              </span>
            </div>
          </>
        )}

        {/* Billing actions */}
        {!billingWaived && (
          <>
            <Separator className="my-4" />
            <div className="flex gap-3">
              {isStarter && (
                <Button
                  onClick={handleUpgrade}
                  disabled={!!actionLoading}
                  className="gap-2"
                >
                  {actionLoading === "upgrade" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Zap size={14} />
                  )}
                  Upgrade to Pro — {"\u00A3"}29/mo
                </Button>
              )}
              {isPro && hasActiveSubscription && (
                <Button
                  variant="outline"
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
              )}
            </div>
          </>
        )}
      </Card>

      {/* Plan comparison */}
      <div>
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Compare Plans
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.values(plans) as PlatformPlan[]).map((plan) => {
            const isActive = current_plan.id === plan.id;
            return (
              <Card
                key={plan.id}
                className={`border-border bg-card p-5 transition-colors ${
                  isActive ? "ring-1 ring-primary/50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                    {plan.name}
                  </h3>
                  {isActive && (
                    <Badge variant="default" className="text-[10px]">
                      Current
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>

                <div className="mt-4">
                  <span className="text-2xl font-bold text-foreground">
                    {plan.monthly_price === 0
                      ? "Free"
                      : `\u00A3${(plan.monthly_price / 100).toFixed(0)}`}
                  </span>
                  {plan.monthly_price > 0 && (
                    <span className="text-sm text-muted-foreground">/month</span>
                  )}
                </div>

                <Separator className="my-4" />

                <div className="mb-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform fee</span>
                    <span className="font-mono font-medium text-foreground">
                      {plan.fee_percent}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min fee</span>
                    <span className="font-mono font-medium text-foreground">
                      {"\u00A3"}{(plan.min_fee / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                <Separator className="my-4" />

                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check
                        size={14}
                        className="mt-0.5 shrink-0 text-success"
                      />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
