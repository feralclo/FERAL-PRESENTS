"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOrgId } from "@/components/OrgProvider";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings, Save, Loader2, MapPin, Globe, Lock } from "lucide-react";
import { TIMEZONES as TZ_LIST, detectBrowserTimezone, formatTimezoneLabel } from "@/lib/timezone";
import { generalKey } from "@/lib/constants";
import { COUNTRIES, getDefaultCurrency, getCurrencySymbolFromMap } from "@/lib/country-currency-map";

/** Supported base currencies (subset of Stripe-supported currencies for event payments) */
const SUPPORTED_BASE_CURRENCIES = [
  { code: "GBP", label: "GBP (£)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "USD", label: "USD ($)" },
  { code: "CAD", label: "CAD (CA$)" },
  { code: "AUD", label: "AUD (A$)" },
  { code: "CHF", label: "CHF" },
  { code: "SEK", label: "SEK (kr)" },
  { code: "NOK", label: "NOK (kr)" },
  { code: "DKK", label: "DKK (kr)" },
  { code: "JPY", label: "JPY (¥)" },
];

interface OrgSettings {
  org_name: string;
  timezone: string;
  support_email: string;
  country: string;
  base_currency: string;
}

const DEFAULT_SETTINGS: OrgSettings = {
  org_name: "",
  timezone: "Europe/London",
  support_email: "",
  country: "GB",
  base_currency: "GBP",
};

const TIMEZONES = TZ_LIST;

export default function GeneralSettings() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [stripeConnected, setStripeConnected] = useState(false);

  // Load settings + Stripe status on mount
  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, stripeRes] = await Promise.all([
          fetch(`/api/settings?key=${generalKey(orgId)}`),
          fetch("/api/stripe/connect/my-account"),
        ]);
        if (settingsRes.ok) {
          const { data } = await settingsRes.json();
          if (data) {
            setSettings({ ...DEFAULT_SETTINGS, ...data });
          }
        }
        if (stripeRes.ok) {
          const stripeData = await stripeRes.json();
          setStripeConnected(!!stripeData.connected);
        }
      } catch {
        // Settings may not exist yet — use defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, [orgId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: generalKey(orgId),
          data: settings,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setStatus("Settings saved");
    } catch {
      setStatus("Error saving settings");
    } finally {
      setSaving(false);
    }
  }, [settings, orgId]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-primary" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
            General Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organisation settings and preferences
          </p>
        </div>
      </div>

      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Organisation
        </h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organisation Name</Label>
            <Input
              id="org-name"
              value={settings.org_name}
              onChange={(e) =>
                setSettings((s) => ({ ...s, org_name: e.target.value }))
              }
              placeholder="e.g. My Events Co"
            />
            <p className="text-xs text-muted-foreground">
              Displayed in emails, receipts, and the admin sidebar
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-email">Support Email</Label>
            <Input
              id="support-email"
              type="email"
              value={settings.support_email}
              onChange={(e) =>
                setSettings((s) => ({ ...s, support_email: e.target.value }))
              }
              placeholder="e.g. hello@yourdomain.com"
            />
            <p className="text-xs text-muted-foreground">
              Shown in confirmation emails and on event pages
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <div className="flex gap-2">
              <select
                id="timezone"
                value={settings.timezone}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, timezone: e.target.value }))
                }
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                {/* Include current value if not in curated list */}
                {settings.timezone && !TIMEZONES.includes(settings.timezone as typeof TIMEZONES[number]) && (
                  <option value={settings.timezone}>
                    {formatTimezoneLabel(settings.timezone)}
                  </option>
                )}
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimezoneLabel(tz)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-9 gap-1.5"
                onClick={() => {
                  const detected = detectBrowserTimezone();
                  setSettings((s) => ({ ...s, timezone: detected }));
                }}
              >
                <MapPin size={12} />
                Detect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used for event times and scheduled automations
            </p>
          </div>
        </div>
      </Card>

      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Country & Currency
        </h2>
        {stripeConnected ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Lock size={12} className="text-muted-foreground" />
                Country
              </Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/50 px-3 text-sm text-foreground">
                {COUNTRIES.find((c) => c.code === settings.country)?.name || settings.country}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Lock size={12} className="text-muted-foreground" />
                Base Currency
              </Label>
              <div className="flex h-9 w-fit items-center rounded-md border border-border bg-muted/50 px-3 text-sm text-foreground">
                {settings.base_currency} ({getCurrencySymbolFromMap(settings.base_currency)})
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Linked to your payment account.{" "}
              <Link href="/admin/payments/" className="text-primary hover:underline">
                Manage payments
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <select
                    id="country"
                    value={settings.country}
                    onChange={(e) => {
                      const newCountry = e.target.value;
                      const derived = getDefaultCurrency(newCountry);
                      setSettings((s) => ({ ...s, country: newCountry, base_currency: derived }));
                    }}
                    className="flex h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Where your business is based
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base-currency">Base Currency</Label>
              <select
                id="base-currency"
                value={settings.base_currency}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, base_currency: e.target.value }))
                }
                className="flex h-9 w-full max-w-[200px] rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                {SUPPORTED_BASE_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                New events will default to this currency. Existing events keep their current currency.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Separator />

      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Platform Info
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Platform</span>
            <span className="text-foreground">Entry</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Org ID</span>
            <span className="font-mono text-foreground">{orgId}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Framework</span>
            <span className="text-foreground">Next.js (App Router)</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Database</span>
            <span className="text-foreground">Supabase (PostgreSQL)</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Payments</span>
            <span className="text-foreground">Stripe (Connect)</span>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save Settings
        </Button>
        {status && (
          <span
            className={`text-sm ${
              status.includes("Error") ? "text-destructive" : "text-success"
            }`}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
