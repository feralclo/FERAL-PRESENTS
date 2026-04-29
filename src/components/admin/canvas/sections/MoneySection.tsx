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

interface StripeAccount {
  account_id: string;
  email: string | null;
  business_name: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
}

interface MoneySectionProps extends TabWithSettingsProps {
  hasMerch?: boolean;
}

/**
 * Money — currency, VAT, payment method. Split out of SettingsTab so the
 * canvas can group "how does money flow" into one narrative beat.
 * Visibility / status / announcement / queue / SEO live in PublishSection.
 */
export function MoneySection({
  event,
  updateEvent,
  settings,
  updateSetting,
  hasMerch = false,
}: MoneySectionProps) {
  const orgId = useOrgId();
  const { currency: orgBaseCurrency } = useOrgCurrency();

  const [stripeAccounts, setStripeAccounts] = useState<StripeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [orgVat, setOrgVat] = useState<VatSettings | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);

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
        /* ignore */
      }
    })();
  }, []);

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

  return (
    <div className="space-y-6">
      <div className={isPlatformOwner ? "grid gap-4 sm:grid-cols-2" : ""}>
        {isPlatformOwner && (
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={event.payment_method}
              onValueChange={(v) => updateEvent("payment_method", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test (simulated)</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="external">External link</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select
            value={event.currency}
            onValueChange={(v) => updateEvent("currency", v)}
          >
            <SelectTrigger>
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
              Your org&apos;s default currency
            </p>
          ) : orgBaseCurrency ? (
            <p className="text-[10px] text-warning">
              Different from your base currency ({orgBaseCurrency}) — 1.5%
              cross-currency surcharge applies
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border/40 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label className="text-sm font-medium text-foreground">
              Multi-currency checkout
            </Label>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {event.payment_method === "external"
                ? "Enable for merch pre-orders linked to this event."
                : "Sell internationally — buyers see prices in their local currency, with a selector on the event page."}
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

      {/* External link — platform owner only */}
      {isPlatformOwner && event.payment_method === "external" && (
        <div className="space-y-2 border-t border-border/40 pt-5">
          <Label>Ticket link URL</Label>
          <Input
            type="url"
            value={event.external_link || ""}
            onChange={(e) =>
              updateEvent("external_link", e.target.value || null)
            }
            placeholder="https://example.com/tickets"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Buyers redirect here. No on-page checkout.
          </p>
        </div>
      )}

      {/* Stripe account selector — platform owner only */}
      {isPlatformOwner && event.payment_method === "stripe" && (
        <div className="space-y-2 border-t border-border/40 pt-5">
          <Label>Stripe account</Label>
          {loadingAccounts ? (
            <p className="text-xs text-muted-foreground">Loading accounts…</p>
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
                  <SelectItem value="__platform_default__">
                    Platform default
                  </SelectItem>
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
              <p className="text-[10px] text-muted-foreground/70">
                Which Connect account receives payments. &quot;Platform
                default&quot; uses the global account from{" "}
                <Link href="/admin/payments/" className="text-primary hover:underline">
                  Payment settings
                </Link>
                .
              </p>
            </>
          ) : (
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                No Connect accounts found. Payments will use the global account
                from{" "}
                <Link href="/admin/payments/" className="text-primary hover:underline">
                  Payment settings
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stripe connection hint — regular tenants */}
      {!isPlatformOwner &&
        event.payment_method === "stripe" &&
        stripeConnected === false && (
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

      {/* Merch collection cutoff */}
      {hasMerch && (
        <div className="border-t border-border/40 pt-5 space-y-4">
          <div>
            <Label className="text-sm font-medium">Merch booth closes at</Label>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Cutoff time shown on confirmation emails and PDF tickets.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="time"
              value={(settings.merch_collection_cutoff as string) || ""}
              onChange={(e) =>
                updateSetting(
                  "merch_collection_cutoff",
                  e.target.value || undefined
                )
              }
              placeholder="e.g. 22:00"
            />
            {settings.merch_collection_cutoff && (
              <div className="flex items-center text-xs text-muted-foreground">
                Buyers see: &quot;Collect before{" "}
                {(() => {
                  const [h, m] = (settings.merch_collection_cutoff as string)
                    .split(":")
                    .map(Number);
                  if (isNaN(h)) return settings.merch_collection_cutoff as string;
                  const period = h >= 12 ? "pm" : "am";
                  const hour = h % 12 || 12;
                  return m
                    ? `${hour}:${String(m).padStart(2, "0")}${period}`
                    : `${hour}${period}`;
                })()}
                &quot;
              </div>
            )}
          </div>
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
            <SelectTrigger>
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
