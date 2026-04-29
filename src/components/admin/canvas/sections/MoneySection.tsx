"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { validateVatNumber } from "@/lib/vat";
import { vatKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import type { VatSettings } from "@/types/settings";
import type { TabWithSettingsProps } from "@/components/admin/event-editor/types";

/**
 * Money — currency, VAT, payments. Stripe is locked in as the only
 * supported payment method on the canvas (the picker came out
 * 2026-04-29 — Entry's product thesis is "this is the destination,"
 * which contradicts External; Test was admin-only and reachable via
 * SQL when needed). Existing Test/External events keep their stored
 * value but the UI doesn't expose the switch.
 *
 * Stripe Connect account routing also retired from the canvas — the
 * org's connected account is automatic. Multi-account routing for
 * platform-owners lives at /admin/connect/ where it belongs.
 */
export function MoneySection({
  event,
  updateEvent,
  settings,
  updateSetting,
}: TabWithSettingsProps) {
  const orgId = useOrgId();
  const { currency: orgBaseCurrency } = useOrgCurrency();

  const [orgVat, setOrgVat] = useState<VatSettings | null>(null);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [stripeAccountLabel, setStripeAccountLabel] = useState<string | null>(null);

  // Connection probe — drives the "connect Stripe before going live"
  // hint and shows the connected account name as a status pill.
  useEffect(() => {
    fetch("/api/stripe/connect/my-account")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json) {
          setStripeConnected(false);
          return;
        }
        setStripeConnected(!!json.connected && !!json.charges_enabled);
        setStripeAccountLabel(
          json.business_name || json.email || (json.connected ? "Connected account" : null)
        );
      })
      .catch(() => setStripeConnected(false));
  }, []);

  useEffect(() => {
    fetch(`/api/settings?key=${vatKey(orgId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setOrgVat(json.data as VatSettings);
      })
      .catch(() => {});
  }, [orgId]);

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
    : "Loading org settings…";

  const vatNumberError =
    event.vat_number && !validateVatNumber(event.vat_number)
      ? "Invalid VAT number format"
      : null;

  const isLegacyExternal = event.payment_method === "external";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Currency</Label>
        <Select
          value={event.currency}
          onValueChange={(v) => updateEvent("currency", v)}
        >
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GBP">GBP (£)</SelectItem>
            <SelectItem value="EUR">EUR (€)</SelectItem>
            <SelectItem value="USD">USD ($)</SelectItem>
            <SelectItem value="JPY">JPY (¥)</SelectItem>
          </SelectContent>
        </Select>
        {orgBaseCurrency &&
        (event.currency || "GBP").toUpperCase() === orgBaseCurrency.toUpperCase() ? (
          <p className="text-[10px] text-muted-foreground/70">
            Your org&apos;s default currency.
          </p>
        ) : orgBaseCurrency ? (
          <p className="text-[10px] text-warning">
            Different from your base currency ({orgBaseCurrency}) — 1.5%
            cross-currency surcharge applies.
          </p>
        ) : null}
      </div>

      <div className="border-t border-border/40 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label className="text-sm font-medium text-foreground">
              Multi-currency checkout
            </Label>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Sell internationally — buyers see prices in their local currency
              with a selector on the event page.
            </p>
          </div>
          <Switch
            checked={!!settings.multi_currency_enabled}
            onCheckedChange={(checked) =>
              updateSetting("multi_currency_enabled", checked)
            }
          />
        </div>
      </div>

      {/* Payments status — replaces the dropdown. We just tell the host
          where money flows and link out for changes. */}
      <div className="border-t border-border/40 pt-5">
        <Label className="text-sm font-medium text-foreground">Payments</Label>
        {stripeConnected === true && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-success/25 bg-success/[0.04] px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              <span className="truncate text-[12px] text-foreground">
                Payouts via{" "}
                <span className="font-medium">
                  {stripeAccountLabel || "your Stripe account"}
                </span>
              </span>
            </div>
            <Link
              href="/admin/payments/"
              className="shrink-0 text-[11px] font-medium text-primary hover:underline"
            >
              Manage →
            </Link>
          </div>
        )}
        {stripeConnected === false && (
          <div className="mt-2 rounded-md border border-warning/30 bg-warning/[0.04] p-3">
            <p className="text-xs text-foreground">
              You need to{" "}
              <Link
                href="/admin/payments/"
                className="font-medium text-primary hover:underline"
              >
                connect your Stripe account
              </Link>{" "}
              before this event can go live.
            </p>
          </div>
        )}
      </div>

      {/* Legacy External event still in the system — give the host a
          place to maintain its outbound URL. New events can't reach this
          state via the canvas. */}
      {isLegacyExternal && (
        <div className="space-y-2 border-t border-border/40 pt-5">
          <Label>Ticket link URL</Label>
          <Input
            type="url"
            value={event.external_link || ""}
            onChange={(e) => updateEvent("external_link", e.target.value || null)}
            placeholder="https://example.com/tickets"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Legacy event — buyers redirect here. New events use Stripe checkout.
          </p>
        </div>
      )}

      {/* VAT */}
      <div className="border-t border-border/40 pt-5 space-y-4">
        <div className="space-y-2">
          <Label>VAT configuration</Label>
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
                updateEvent(
                  "vat_prices_include",
                  event.vat_prices_include ?? true
                );
              } else {
                updateEvent("vat_registered", false);
                updateEvent("vat_rate", null);
                updateEvent("vat_prices_include", null);
                updateEvent("vat_number", null);
              }
            }}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Use org default</SelectItem>
              <SelectItem value="enabled">VAT enabled</SelectItem>
              <SelectItem value="disabled">No VAT</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground/70">{orgVatHint}</p>
        </div>

        {vatMode === "enabled" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>VAT rate (%)</Label>
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
              <Label>VAT number (optional)</Label>
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
      </div>
    </div>
  );
}
