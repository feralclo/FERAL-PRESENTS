"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { saveSettings } from "@/lib/settings";
import { vatKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import { DEFAULT_VAT_SETTINGS, validateVatNumber } from "@/lib/vat";
import type { VatSettings } from "@/types/settings";
import {
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Info,
} from "lucide-react";
import { fmtMoney } from "@/lib/format";

export default function FinancePage() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 className="admin-page-title">Finance</h1>
      <p className="admin-page-subtitle">
        Manage your payment settings and tax configuration.
      </p>

      <Tabs defaultValue="payments" className="mt-6">
        <TabsList variant="line">
          <TabsTrigger value="payments">
            <CreditCard size={14} className="mr-2" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="tax">
            <Receipt size={14} className="mr-2" />
            Tax
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-6">
          <PaymentsTab />
        </TabsContent>

        <TabsContent value="tax" className="mt-6">
          <TaxTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================================================================
   PAYMENTS TAB — Summary + link to full setup
   ================================================================ */

function PaymentsTab() {
  const [status, setStatus] = useState<{
    connected: boolean;
    charges_enabled: boolean;
    business_name: string | null;
    account_id: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stripe/connect");
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          const acc = json.data[0];
          setStatus({
            connected: true,
            charges_enabled: acc.charges_enabled,
            business_name: acc.business_name,
            account_id: acc.account_id,
          });
        } else {
          setStatus({
            connected: false,
            charges_enabled: false,
            business_name: null,
            account_id: null,
          });
        }
      } catch {
        setStatus(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardContent className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">Loading payment status...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="py-0 gap-0">
        <CardContent className="px-6 py-5">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                status?.charges_enabled
                  ? "bg-emerald-500/10"
                  : "bg-amber-500/10"
              }`}
            >
              {status?.charges_enabled ? (
                <CheckCircle2 size={20} className="text-emerald-400" />
              ) : (
                <AlertCircle size={20} className="text-amber-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {status?.charges_enabled
                    ? "Payments Active"
                    : status?.connected
                      ? "Setup Incomplete"
                      : "Not Set Up"}
                </h3>
                <Badge
                  variant={status?.charges_enabled ? "success" : "warning"}
                >
                  {status?.charges_enabled ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {status?.charges_enabled
                  ? `Connected as ${status.business_name || status.account_id}`
                  : "Set up Stripe to start accepting card payments, Apple Pay, and Google Pay."}
              </p>
            </div>
            <Link
              href="/admin/payments/"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
            >
              {status?.charges_enabled ? "Manage" : "Set Up"}
              <ArrowRight size={13} />
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-sm">Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5 space-y-2">
          <Link
            href="/admin/payments/"
            className="flex items-center justify-between rounded-md border border-border/50 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
          >
            <div className="flex items-center gap-3">
              <CreditCard size={16} className="text-muted-foreground" />
              <span>Payment Settings</span>
            </div>
            <ArrowRight size={14} className="text-muted-foreground" />
          </Link>
          <Link
            href="/admin/connect/"
            className="flex items-center justify-between rounded-md border border-border/50 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
          >
            <div className="flex items-center gap-3">
              <Receipt size={16} className="text-muted-foreground" />
              <span>Stripe Connect</span>
            </div>
            <ArrowRight size={14} className="text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

/* ================================================================
   TAX TAB — VAT registration & configuration
   ================================================================ */

function TaxTab() {
  const orgId = useOrgId();
  const [vat, setVat] = useState<VatSettings>(DEFAULT_VAT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [vatNumberError, setVatNumberError] = useState("");

  // Load VAT settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/settings?key=${vatKey(orgId)}`
        );
        const json = await res.json();
        if (json?.data) {
          setVat({ ...DEFAULT_VAT_SETTINGS, ...json.data });
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(
    async (updated: VatSettings) => {
      setSaving(true);
      setSaved(false);

      // Validate VAT number if registered
      if (updated.vat_registered && updated.vat_number) {
        const valid = validateVatNumber(updated.vat_number);
        if (!valid) {
          setVatNumberError("Invalid VAT number format");
          setSaving(false);
          return;
        }
        updated = { ...updated, vat_number: valid };
      }

      setVatNumberError("");

      const { error } = await saveSettings(
        vatKey(orgId),
        updated as unknown as Record<string, unknown>
      );
      setSaving(false);

      if (!error) {
        setSaved(true);
        setVat(updated);
        setTimeout(() => setSaved(false), 2000);
      }
    },
    []
  );

  const update = useCallback(
    (field: keyof VatSettings, value: unknown) => {
      const updated = { ...vat, [field]: value };
      setVat(updated);
      handleSave(updated);
    },
    [vat, handleSave]
  );

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardContent className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Loading tax settings...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Save status */}
      {(saving || saved) && (
        <div
          className={`rounded-md border px-4 py-2 text-xs font-medium ${
            saved
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
              : "border-border bg-muted/30 text-muted-foreground"
          }`}
        >
          {saving ? "Saving..." : "Settings saved"}
        </div>
      )}

      {/* VAT Registration Toggle */}
      <Card className="py-0 gap-0">
        <CardContent className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                VAT Registered
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Enable this if your business is registered for VAT. When
                enabled, VAT will be calculated and displayed on all tickets
                and merch at checkout.
              </p>
            </div>
            <Switch
              checked={vat.vat_registered}
              onCheckedChange={(checked) => update("vat_registered", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* VAT Configuration — only shown when registered */}
      {vat.vat_registered && (
        <>
          {/* VAT Number */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">VAT Details</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div className="space-y-2">
                <Label>VAT Registration Number</Label>
                <Input
                  value={vat.vat_number}
                  onChange={(e) => {
                    setVat((prev) => ({
                      ...prev,
                      vat_number: e.target.value,
                    }));
                    setVatNumberError("");
                  }}
                  onBlur={() => {
                    if (vat.vat_number) {
                      handleSave(vat);
                    }
                  }}
                  placeholder="e.g. GB123456789"
                  className="max-w-[280px]"
                />
                {vatNumberError && (
                  <p className="text-xs text-destructive">{vatNumberError}</p>
                )}
                <p className="text-[10px] text-muted-foreground/60">
                  Your VAT registration number will be shown on order
                  confirmations and invoices.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>VAT Rate (%)</Label>
                <Input
                  type="number"
                  value={vat.vat_rate}
                  onChange={(e) =>
                    update(
                      "vat_rate",
                      e.target.value ? Number(e.target.value) : 0
                    )
                  }
                  min="0"
                  max="100"
                  step="0.5"
                  className="max-w-[120px]"
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Standard UK VAT rate is 20%. Reduced rate is 5%.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Model */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Pricing Model</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    Prices include VAT
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    When enabled, your listed ticket and merch prices already
                    include VAT. The checkout will show &ldquo;Includes
                    VAT&rdquo; — the total stays the same.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    When disabled, VAT is added on top of listed prices at
                    checkout. The customer pays more than the listed price.
                  </p>
                </div>
                <Switch
                  checked={vat.prices_include_vat}
                  onCheckedChange={(checked) =>
                    update("prices_include_vat", checked)
                  }
                />
              </div>

              {/* Preview */}
              <Separator />
              <div className="rounded-md border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={14} className="text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Checkout preview
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-foreground/80">
                    <span>Subtotal</span>
                    <span>{fmtMoney(26.50)}</span>
                  </div>
                  {vat.prices_include_vat ? (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>
                        Includes VAT ({vat.vat_rate}%)
                      </span>
                      <span>
                        {fmtMoney(
                          26.5 -
                          26.5 / (1 + vat.vat_rate / 100)
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-foreground/80">
                      <span>
                        VAT ({vat.vat_rate}%)
                      </span>
                      <span>
                        {fmtMoney((26.5 * vat.vat_rate) / 100)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-border/50 pt-1.5 flex justify-between font-medium text-foreground">
                    <span>Total</span>
                    <span>
                      {fmtMoney(
                        vat.prices_include_vat
                          ? 26.50
                          : 26.5 + (26.5 * vat.vat_rate) / 100
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
