"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import type { TabProps } from "./types";

interface StripeAccount {
  account_id: string;
  email: string | null;
  business_name: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
}

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
              <Select value={event.status} onValueChange={(v) => updateEvent("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="past">Past</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={event.visibility} onValueChange={(v) => updateEvent("visibility", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private (Secret Link)</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                </SelectContent>
              </Select>
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
              <Select value={event.payment_method} onValueChange={(v) => updateEvent("payment_method", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test (Simulated)</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={event.currency} onValueChange={(v) => updateEvent("currency", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
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
                    <Select
                      value={event.stripe_account_id || "__platform_default__"}
                      onValueChange={(v) =>
                        updateEvent(
                          "stripe_account_id",
                          v === "__platform_default__" ? null : v
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__platform_default__">Platform Default</SelectItem>
                        {stripeAccounts.map((acc) => (
                          <SelectItem
                            key={acc.account_id}
                            value={acc.account_id}
                            disabled={!acc.charges_enabled}
                          >
                            {acc.business_name || acc.email || acc.account_id}
                            {!acc.charges_enabled && " (not ready)"}
                            {acc.charges_enabled && " ✓"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
