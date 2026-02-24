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
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateVatNumber } from "@/lib/vat";
import { vatKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { AlertCircle } from "lucide-react";
import type { VatSettings } from "@/types/settings";
import type { TabProps } from "./types";

interface StripeAccount {
  account_id: string;
  email: string | null;
  business_name: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
}

export function SettingsTab({ event, updateEvent }: TabProps) {
  const orgId = useOrgId();
  const [stripeAccounts, setStripeAccounts] = useState<StripeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [orgVat, setOrgVat] = useState<VatSettings | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [liveBlockedMsg, setLiveBlockedMsg] = useState("");

  // Detect platform owner + Stripe connection status
  useEffect(() => {
    (async () => {
      try {
        const [, stripeRes] = await Promise.all([
          (async () => {
            const supabase = getSupabaseClient();
            if (!supabase) return;
            const { data } = await supabase.auth.getUser();
            if (data.user?.app_metadata?.is_platform_owner === true) {
              setIsPlatformOwner(true);
            }
          })(),
          fetch("/api/stripe/connect/my-account").catch(() => null),
        ]);
        if (stripeRes?.ok) {
          const json = await stripeRes.json();
          setStripeConnected(!!json.connected && !!json.charges_enabled);
        } else {
          setStripeConnected(false);
        }
      } catch {
        // Fail silently
      }
    })();
  }, []);

  // Fetch Stripe Connect accounts when payment method is stripe (platform owner only)
  useEffect(() => {
    if (event.payment_method !== "stripe" || !isPlatformOwner) return;

    setLoadingAccounts(true);
    fetch("/api/stripe/connect")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setStripeAccounts(json.data);
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, [event.payment_method, isPlatformOwner]);

  // Fetch org-level VAT settings for hint display
  useEffect(() => {
    fetch(`/api/settings?key=${vatKey(orgId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setOrgVat(json.data as VatSettings);
      })
      .catch(() => {});
  }, []);

  // Derive VAT override mode: "default" | "enabled" | "disabled"
  const vatMode =
    event.vat_registered === true
      ? "enabled"
      : event.vat_registered === false
        ? "disabled"
        : "default";

  const orgVatHint = orgVat
    ? orgVat.vat_registered
      ? `Org default: ${orgVat.vat_rate}%, ${orgVat.prices_include_vat ? "inclusive" : "exclusive"}${orgVat.vat_number ? `, ${orgVat.vat_number}` : ""}`
      : "Org default: No VAT"
    : "Loading org settings...";

  const vatNumberError =
    event.vat_number && !validateVatNumber(event.vat_number)
      ? "Invalid VAT number format"
      : null;

  return (
    <div className="space-y-6">
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Status & Visibility</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          {liveBlockedMsg && (
            <Alert variant="warning">
              <AlertCircle className="size-4" />
              <AlertDescription>{liveBlockedMsg}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={event.status}
                onValueChange={(v) => {
                  // Gate: block going live if Stripe not connected (non-platform-owner only)
                  if (
                    v === "live" &&
                    !isPlatformOwner &&
                    event.payment_method === "stripe" &&
                    stripeConnected === false
                  ) {
                    setLiveBlockedMsg(
                      "Connect your payment account before going live. Go to Settings → Payments to set up."
                    );
                    return;
                  }
                  setLiveBlockedMsg("");
                  updateEvent("status", v);
                }}
              >
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
          <CardTitle className="text-sm">
            {isPlatformOwner ? "Payment & Currency" : "Currency"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className={isPlatformOwner ? "grid gap-4 sm:grid-cols-2" : ""}>
            {/* Payment method — platform owner only */}
            {isPlatformOwner && (
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={event.payment_method} onValueChange={(v) => updateEvent("payment_method", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Test (Simulated)</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="external">External Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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

          {/* External link — platform owner only (since only they can set external) */}
          {isPlatformOwner && event.payment_method === "external" && (
            <div className="space-y-2">
              <Label>Ticket Link URL</Label>
              <Input
                type="url"
                value={event.external_link || ""}
                onChange={(e) => updateEvent("external_link", e.target.value || null)}
                placeholder="https://example.com/tickets"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Visitors will be redirected to this URL when they click &quot;Buy
                Tickets&quot;. No ticket types, cart, or checkout will be shown
                on the event page.
              </p>
            </div>
          )}

          {/* Stripe account selector — platform owner only */}
          {isPlatformOwner && event.payment_method === "stripe" && (
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
            </div>
          )}

          {/* Payment connection hint — regular tenants only */}
          {!isPlatformOwner && event.payment_method === "stripe" && stripeConnected === false && (
            <div className="rounded-md border border-warning/20 bg-warning/[0.04] p-3">
              <p className="text-xs text-muted-foreground">
                You need to{" "}
                <Link
                  href="/admin/payments/"
                  className="font-medium text-primary hover:underline"
                >
                  connect your payment account
                </Link>{" "}
                before this event can go live.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Tax</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="space-y-2">
            <Label>VAT Configuration</Label>
            <Select
              value={vatMode}
              onValueChange={(v) => {
                if (v === "default") {
                  updateEvent("vat_registered", null);
                  updateEvent("vat_rate", null);
                  updateEvent("vat_prices_include", null);
                  updateEvent("vat_number", null);
                } else if (v === "enabled") {
                  updateEvent("vat_registered", true);
                  updateEvent("vat_rate", event.vat_rate ?? 20);
                  updateEvent("vat_prices_include", event.vat_prices_include ?? true);
                } else {
                  updateEvent("vat_registered", false);
                  updateEvent("vat_rate", null);
                  updateEvent("vat_prices_include", null);
                  updateEvent("vat_number", null);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Use Org Default</SelectItem>
                <SelectItem value="enabled">VAT Enabled</SelectItem>
                <SelectItem value="disabled">No VAT</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground/60">{orgVatHint}</p>
          </div>

          {vatMode === "enabled" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>VAT Rate (%)</Label>
                  <Input
                    type="number"
                    value={event.vat_rate ?? 20}
                    onChange={(e) =>
                      updateEvent(
                        "vat_rate",
                        e.target.value ? Number(e.target.value) : 20
                      )
                    }
                    min="0"
                    max="100"
                    step="0.5"
                    className="max-w-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prices include VAT</Label>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={event.vat_prices_include ?? true}
                      onCheckedChange={(checked) =>
                        updateEvent("vat_prices_include", checked)
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {(event.vat_prices_include ?? true) ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>VAT Number (optional)</Label>
                <Input
                  type="text"
                  value={event.vat_number || ""}
                  onChange={(e) =>
                    updateEvent("vat_number", e.target.value || null)
                  }
                  placeholder="e.g. GB123456789"
                  className="max-w-[240px]"
                />
                {vatNumberError && (
                  <p className="text-[10px] text-destructive">{vatNumberError}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
