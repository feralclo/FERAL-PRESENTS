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
import { vatKey, brandingKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Slider } from "@/components/ui/slider";
import { AlertCircle, Users } from "lucide-react";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { SeoCard } from "./SeoCard";
import type { BrandingSettings } from "@/types/settings";
import type { VatSettings } from "@/types/settings";
import type { TabWithSettingsProps } from "./types";

interface StripeAccount {
  account_id: string;
  email: string | null;
  business_name: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
}

interface SettingsTabProps extends TabWithSettingsProps {
  artistNames?: string[];
}

export function SettingsTab({ event, updateEvent, settings, updateSetting, artistNames = [] }: SettingsTabProps) {
  const orgId = useOrgId();
  const { timezone } = useOrgTimezone();
  const [stripeAccounts, setStripeAccounts] = useState<StripeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [orgVat, setOrgVat] = useState<VatSettings | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [liveBlockedMsg, setLiveBlockedMsg] = useState("");
  const [signupCount, setSignupCount] = useState<number | null>(null);
  const [orgName, setOrgName] = useState("Entry");

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

  // Fetch org-level VAT settings and branding for hint display
  useEffect(() => {
    fetch(`/api/settings?key=${vatKey(orgId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setOrgVat(json.data as VatSettings);
      })
      .catch(() => {});
    fetch(`/api/settings?key=${brandingKey(orgId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          const branding = json.data as BrandingSettings;
          if (branding.org_name) setOrgName(branding.org_name);
        }
      })
      .catch(() => {});
  }, [orgId]);

  // Fetch interest signup count when announcement mode is on
  useEffect(() => {
    if (!event.tickets_live_at || !event.id) {
      setSignupCount(null);
      return;
    }
    fetch(`/api/announcement/signups?event_id=${event.id}&count_only=true`)
      .then((res) => res.json())
      .then((json) => {
        if (typeof json.count === "number") setSignupCount(json.count);
      })
      .catch(() => {});
  }, [event.tickets_live_at, event.id]);

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
          <CardTitle className="text-sm">Ticket Sales Timing</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Schedule ticket release</Label>
              <p className="text-[10px] text-muted-foreground/60 max-w-sm">
                Set a future date when tickets become available for purchase. Until then, visitors see a sign-up page instead.
              </p>
            </div>
            <Switch
              checked={!!event.tickets_live_at}
              onCheckedChange={(checked) => {
                if (checked) {
                  // Default to tomorrow at noon
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  tomorrow.setHours(12, 0, 0, 0);
                  const y = tomorrow.getFullYear();
                  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
                  const d = String(tomorrow.getDate()).padStart(2, "0");
                  updateEvent("tickets_live_at", `${y}-${m}-${d}T12:00`);
                } else {
                  updateEvent("tickets_live_at", null);
                  updateEvent("announcement_title", null);
                  updateEvent("announcement_subtitle", null);
                }
              }}
            />
          </div>

          {event.tickets_live_at && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Tickets on sale</Label>
                <DateTimePicker
                  value={event.tickets_live_at || ""}
                  onChange={(v) => updateEvent("tickets_live_at", v)}
                  placeholder="Select date and time"
                  timezone={timezone}
                  showTimezone
                />
              </div>
              <div className="space-y-2">
                <Label>Announcement title</Label>
                <Input
                  value={event.announcement_title || ""}
                  onChange={(e) =>
                    updateEvent("announcement_title", e.target.value || null)
                  }
                  placeholder="Coming Soon"
                />
              </div>
              <div className="space-y-2">
                <Label>Announcement subtitle</Label>
                <Textarea
                  value={event.announcement_subtitle || ""}
                  onChange={(e) =>
                    updateEvent("announcement_subtitle", e.target.value || null)
                  }
                  placeholder="Sign up to be the first to know when tickets drop."
                  rows={2}
                />
              </div>
              {signupCount !== null && signupCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2">
                  <Users className="size-3.5 text-primary" />
                  <span className="text-xs text-foreground">
                    {signupCount} {signupCount === 1 ? "person" : "people"} signed up
                  </span>
                </div>
              )}

              {/* Hype Queue */}
              <div className="h-px bg-border/50 mt-2" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable hype queue</Label>
                  <p className="text-[10px] text-muted-foreground/60 max-w-sm">
                    Show a fake queue experience when tickets go live. Builds excitement and urgency before revealing the ticket page.
                  </p>
                </div>
                <Switch
                  checked={!!event.queue_enabled}
                  onCheckedChange={(checked) => {
                    updateEvent("queue_enabled", checked);
                    if (checked && !event.queue_duration_seconds) {
                      updateEvent("queue_duration_seconds", 45);
                    }
                    if (checked && !event.queue_window_minutes) {
                      updateEvent("queue_window_minutes", 60);
                    }
                  }}
                />
              </div>

              {event.queue_enabled && (
                <div className="space-y-4 pl-0">
                  <div className="space-y-2">
                    <Label>
                      Queue duration:{" "}
                      <span className="font-normal text-muted-foreground">
                        {event.queue_duration_seconds ?? 45}s
                      </span>
                    </Label>
                    <Slider
                      value={[event.queue_duration_seconds ?? 45]}
                      onValueChange={([v]) => updateEvent("queue_duration_seconds", v)}
                      min={15}
                      max={120}
                      step={5}
                    />
                    <p className="text-[10px] text-muted-foreground/60">
                      How long visitors wait in the queue (15–120 seconds)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Queue title</Label>
                    <Input
                      value={event.queue_title || ""}
                      onChange={(e) =>
                        updateEvent("queue_title", e.target.value || null)
                      }
                      placeholder="You're in the queue"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Queue subtitle</Label>
                    <Input
                      value={event.queue_subtitle || ""}
                      onChange={(e) =>
                        updateEvent("queue_subtitle", e.target.value || null)
                      }
                      placeholder="Securing your spot — don't close this tab"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Queue active window (minutes)</Label>
                    <Input
                      type="number"
                      value={event.queue_window_minutes ?? 60}
                      onChange={(e) =>
                        updateEvent(
                          "queue_window_minutes",
                          Math.max(15, Math.min(120, Number(e.target.value) || 60))
                        )
                      }
                      min={15}
                      max={120}
                      className="max-w-[120px]"
                    />
                    <p className="text-[10px] text-muted-foreground/60">
                      Queue stays active for this many minutes after ticket release (15–120 min). After this window, visitors skip straight to tickets.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
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

          {/* Multi-currency checkout */}
          <div className="h-px bg-border/50" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Multi-currency checkout</Label>
                <p className="text-[10px] text-muted-foreground/60 max-w-sm">
                  {event.payment_method === "external"
                    ? "Enable multi-currency for merch pre-orders linked to this event. Visitors see converted prices in the merch store based on their location."
                    : "Sell to international audiences in their local currency. Visitors see converted prices automatically based on their location, with a currency selector on the event page."}
                </p>
              </div>
              <Switch
                checked={!!settings.multi_currency_enabled}
                onCheckedChange={(checked) => {
                  updateSetting("multi_currency_enabled", checked);
                }}
              />
            </div>

            {settings.multi_currency_enabled && (
              <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span className="text-[11px] font-medium text-foreground">Active — prices auto-convert for international visitors</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { code: "GBP", symbol: "£", flag: "\u{1F1EC}\u{1F1E7}" },
                    { code: "EUR", symbol: "\u20ac", flag: "\u{1F1EA}\u{1F1FA}" },
                    { code: "USD", symbol: "$", flag: "\u{1F1FA}\u{1F1F8}" },
                    { code: "CAD", symbol: "CA$", flag: "\u{1F1E8}\u{1F1E6}" },
                    { code: "AUD", symbol: "A$", flag: "\u{1F1E6}\u{1F1FA}" },
                    { code: "CHF", symbol: "CHF", flag: "\u{1F1E8}\u{1F1ED}" },
                    { code: "SEK", symbol: "kr", flag: "\u{1F1F8}\u{1F1EA}" },
                    { code: "NOK", symbol: "kr", flag: "\u{1F1F3}\u{1F1F4}" },
                    { code: "DKK", symbol: "kr", flag: "\u{1F1E9}\u{1F1F0}" },
                  ].map((c) => (
                    <span
                      key={c.code}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border ${
                        c.code === (event.currency || "GBP").toUpperCase()
                          ? "border-primary/30 bg-primary/10 text-primary font-medium"
                          : "border-border/50 bg-background/50 text-muted-foreground/70"
                      }`}
                    >
                      <span className="text-xs leading-none">{c.flag}</span>
                      {c.code}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                  Exchange rates update every 6 hours. Payments settle in your account&apos;s default currency — Stripe handles the conversion automatically. Your base currency ({(event.currency || "GBP").toUpperCase()}) is highlighted above.
                </p>
              </div>
            )}
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

      <SeoCard
        event={event}
        updateEvent={updateEvent}
        orgName={orgName}
        artistNames={artistNames}
      />
    </div>
  );
}
