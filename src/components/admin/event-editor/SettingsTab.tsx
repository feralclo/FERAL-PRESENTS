"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TabProps } from "./types";

interface StripeAccount {
  account_id: string;
  email: string | null;
  business_name: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15";

export function SettingsTab({ event, updateEvent }: TabProps) {
  const [stripeAccounts, setStripeAccounts] = useState<StripeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Fetch Stripe Connect accounts when payment method is stripe
  useEffect(() => {
    if (event.payment_method !== "stripe") return;

    setLoadingAccounts(true);
    fetch("/api/stripe/connect")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setStripeAccounts(json.data);
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, [event.payment_method]);

  return (
    <div className="space-y-6">
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Status & Visibility</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                className={selectClass}
                value={event.status}
                onChange={(e) => updateEvent("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="past">Past</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <select
                className={selectClass}
                value={event.visibility}
                onChange={(e) => updateEvent("visibility", e.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Private (Secret Link)</option>
                <option value="unlisted">Unlisted</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Payment & Currency</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <select
                className={selectClass}
                value={event.payment_method}
                onChange={(e) => updateEvent("payment_method", e.target.value)}
              >
                <option value="test">Test (Simulated)</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <select
                className={selectClass}
                value={event.currency}
                onChange={(e) => updateEvent("currency", e.target.value)}
              >
                <option value="GBP">GBP (£)</option>
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {event.payment_method === "stripe" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Stripe Account</Label>
                {loadingAccounts ? (
                  <p className="text-xs text-muted-foreground">Loading accounts...</p>
                ) : stripeAccounts.length > 0 ? (
                  <>
                    <select
                      className={selectClass}
                      value={event.stripe_account_id || ""}
                      onChange={(e) =>
                        updateEvent(
                          "stripe_account_id",
                          e.target.value || null
                        )
                      }
                    >
                      <option value="">Platform Default</option>
                      {stripeAccounts.map((acc) => (
                        <option
                          key={acc.account_id}
                          value={acc.account_id}
                          disabled={!acc.charges_enabled}
                        >
                          {acc.business_name || acc.email || acc.account_id}
                          {!acc.charges_enabled && " (not ready)"}
                          {acc.charges_enabled && " ✓"}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground/60">
                      Select which Stripe Connect account receives payments for
                      this event. &quot;Platform Default&quot; uses the global
                      account from{" "}
                      <Link
                        href="/admin/payments/"
                        className="text-primary hover:underline"
                      >
                        Payment Settings
                      </Link>
                      .
                    </p>
                  </>
                ) : (
                  <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      No Stripe Connect accounts found. Payments will use the
                      global account from{" "}
                      <Link
                        href="/admin/payments/"
                        className="text-primary hover:underline"
                      >
                        Payment Settings
                      </Link>
                      .
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Platform Fee (%)</Label>
                <Input
                  type="number"
                  value={event.platform_fee_percent ?? 5}
                  onChange={(e) =>
                    updateEvent(
                      "platform_fee_percent",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  min="0"
                  max="100"
                  step="0.5"
                  className="max-w-[120px]"
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Platform fee applied on each transaction. Default: 5%
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
