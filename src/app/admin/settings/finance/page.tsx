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
import {
  CreditCard,
  Receipt,
  CheckCircle2,
  ArrowRight,
  Info,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Landmark,
  Zap,
} from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { DEFAULT_VAT_SETTINGS, validateVatNumber } from "@/lib/vat";
import type { VatSettings } from "@/types/settings";

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
   PAYMENTS TAB — Live finance dashboard
   ================================================================
   Reads from /api/stripe/connect/my-account so the status here always
   matches /admin/payments — no two-source-of-truth bugs. Surfaces:
     - Status badge (5 states: incomplete / action-needed / under-review
       / needs-bank / live)
     - Held balance (available + pending) per currency
     - Last 5 payouts with arrival date
     - Last 10 charges with customer + status
   Empty states for each section when day-one zero.
   ================================================================ */

interface AccountStatus {
  connected: boolean;
  account_id: string | null;
  business_name: string | null;
  default_currency: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: {
    currently_due: string[];
    disabled_reason: string | null;
  };
}

interface BalanceEntry {
  amount: number;
  currency: string;
}

interface ChargeRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  created: number;
  customer_email: string | null;
  description: string | null;
}

interface PayoutRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
  created: number;
}

type DashboardState =
  | "not-connected"
  | "incomplete"
  | "action-needed"
  | "under-review"
  | "needs-bank"
  | "live";

function getDashboardState(status: AccountStatus | null): DashboardState {
  if (!status || !status.connected) return "not-connected";
  if (status.charges_enabled && status.payouts_enabled) return "live";
  if (status.charges_enabled && !status.payouts_enabled) return "needs-bank";
  const blockingCount = status.requirements.currently_due.filter(
    (f) => f !== "external_account" && !f.startsWith("external_account."),
  ).length;
  if (status.details_submitted && blockingCount === 0) return "under-review";
  if (status.details_submitted && blockingCount > 0) return "action-needed";
  return "incomplete";
}

function PaymentsTab() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [balance, setBalance] = useState<{
    available: BalanceEntry[];
    pending: BalanceEntry[];
  } | null>(null);

  const [charges, setCharges] = useState<ChargeRow[] | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[] | null>(null);

  // Status — always fetch
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/connect/my-account")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setStatus({
          connected: !!json.connected,
          account_id: json.account_id || null,
          business_name: json.business_name || null,
          default_currency: json.default_currency || null,
          charges_enabled: !!json.charges_enabled,
          payouts_enabled: !!json.payouts_enabled,
          details_submitted: !!json.details_submitted,
          requirements: {
            currently_due: Array.isArray(json.requirements?.currently_due)
              ? json.requirements.currently_due
              : [],
            disabled_reason: json.requirements?.disabled_reason || null,
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false } as AccountStatus);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Balance + activity — only fetch once we know an account exists
  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;

    fetch("/api/stripe/connect/my-account/balance")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setBalance({
          available: json.available || [],
          pending: json.pending || [],
        });
      })
      .catch(() => {
        if (!cancelled) setBalance({ available: [], pending: [] });
      });

    fetch("/api/stripe/connect/my-account/activity")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setCharges(Array.isArray(json.charges) ? json.charges : []);
        setPayouts(Array.isArray(json.payouts) ? json.payouts : []);
      })
      .catch(() => {
        if (!cancelled) {
          setCharges([]);
          setPayouts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status?.connected]);

  if (statusLoading) {
    return (
      <Card className="py-0 gap-0">
        <CardContent className="px-6 py-12 text-center">
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const state = getDashboardState(status);
  const fallbackCurrency = status?.default_currency || "gbp";

  return (
    <div className="space-y-4">
      <StatusCard status={status} state={state} />

      {state !== "not-connected" && state !== "incomplete" && (
        <BalanceCard balance={balance} fallbackCurrency={fallbackCurrency} />
      )}

      {status?.connected && (
        <>
          <PayoutsCard
            payouts={payouts}
            payoutsEnabled={!!status.payouts_enabled}
            fallbackCurrency={fallbackCurrency}
          />
          <ChargesCard charges={charges} />
        </>
      )}

      {status?.account_id && (
        <Card className="py-0 gap-0">
          <CardContent className="px-6 py-3">
            <a
              href="https://dashboard.stripe.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <ExternalLink size={13} />
                Open full transaction history in Stripe
              </span>
              <ArrowRight size={13} />
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Status card ────────────────────────────────────────────────────────

function StatusCard({
  status,
  state,
}: {
  status: AccountStatus | null;
  state: DashboardState;
}) {
  const config = STATE_CONFIG[state];
  const Icon = config.Icon;

  return (
    <Card
      className={`py-0 gap-0 ${
        state === "live"
          ? "border-success/20"
          : state === "needs-bank" || state === "under-review"
            ? "border-info/20"
            : state === "not-connected"
              ? ""
              : "border-warning/20"
      }`}
    >
      <CardContent className="px-6 py-5">
        <div className="flex items-center gap-4">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}
          >
            <Icon size={20} className={config.iconColor} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">
                {config.title}
              </h3>
              <Badge variant={config.badgeVariant}>{config.badgeLabel}</Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {state === "live" && status?.business_name
                ? `Connected as ${status.business_name}`
                : config.subtitle}
            </p>
          </div>
          <Link
            href="/admin/payments/"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
          >
            {config.cta}
            <ArrowRight size={13} />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

const STATE_CONFIG: Record<
  DashboardState,
  {
    Icon: typeof CheckCircle2;
    iconBg: string;
    iconColor: string;
    title: string;
    subtitle: string;
    badgeLabel: string;
    badgeVariant: "success" | "warning" | "info" | "secondary";
    cta: string;
  }
> = {
  "not-connected": {
    Icon: CreditCard,
    iconBg: "bg-muted/50",
    iconColor: "text-muted-foreground",
    title: "Not Set Up",
    subtitle:
      "Set up Stripe to start accepting card payments, Apple Pay, and Google Pay.",
    badgeLabel: "Inactive",
    badgeVariant: "secondary",
    cta: "Set Up",
  },
  incomplete: {
    Icon: Zap,
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    title: "Verify Identity",
    subtitle:
      "Stripe needs a few details before you can take payments. Takes about 5 minutes.",
    badgeLabel: "Action Needed",
    badgeVariant: "warning",
    cta: "Continue",
  },
  "action-needed": {
    Icon: Zap,
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    title: "One More Detail",
    subtitle:
      "Stripe came back asking for one more thing before payments can go live.",
    badgeLabel: "Action Needed",
    badgeVariant: "warning",
    cta: "Continue",
  },
  "under-review": {
    Icon: Loader2,
    iconBg: "bg-info/10",
    iconColor: "text-info",
    title: "Stripe Reviewing",
    subtitle:
      "You've submitted everything Stripe needs. Reviews usually take 1-2 business days.",
    badgeLabel: "Reviewing",
    badgeVariant: "info",
    cta: "View",
  },
  "needs-bank": {
    Icon: Landmark,
    iconBg: "bg-info/10",
    iconColor: "text-info",
    title: "Add Bank for Payouts",
    subtitle:
      "Selling is live. Add a bank account so Stripe can pay your held balance into it.",
    badgeLabel: "Selling — Bank Pending",
    badgeVariant: "info",
    cta: "Add Bank",
  },
  live: {
    Icon: CheckCircle2,
    iconBg: "bg-success/10",
    iconColor: "text-success",
    title: "Payments Active",
    subtitle:
      "Customers can buy tickets. Funds land in your bank automatically.",
    badgeLabel: "Live",
    badgeVariant: "success",
    cta: "Manage",
  },
};

// ─── Balance card ───────────────────────────────────────────────────────

function BalanceCard({
  balance,
  fallbackCurrency,
}: {
  balance: { available: BalanceEntry[]; pending: BalanceEntry[] } | null;
  fallbackCurrency: string;
}) {
  const totals = totalisePerCurrency(balance);
  const hasAny = totals.length > 0;
  const isLoading = balance === null;

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-6 pt-5 pb-3">
        <CardTitle className="text-sm">Balance</CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : !hasAny ? (
          <div>
            <p className="text-2xl font-bold text-foreground">
              {fmtMoney(0, fallbackCurrency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your balance updates as customers buy tickets.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {totals.map((t) => (
              <div key={t.currency}>
                <p className="text-2xl font-bold text-foreground">
                  {fmtMoney(t.total / 100, t.currency)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    {fmtMoney(t.available / 100, t.currency)} available
                  </span>
                  {t.pending > 0 && (
                    <span>
                      · {fmtMoney(t.pending / 100, t.currency)} pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CurrencyTotal {
  currency: string;
  available: number;
  pending: number;
  total: number;
}

function totalisePerCurrency(
  balance: { available: BalanceEntry[]; pending: BalanceEntry[] } | null,
): CurrencyTotal[] {
  if (!balance) return [];
  const map = new Map<string, CurrencyTotal>();
  const ensure = (c: string) => {
    if (!map.has(c)) {
      map.set(c, { currency: c, available: 0, pending: 0, total: 0 });
    }
    return map.get(c)!;
  };
  for (const e of balance.available) {
    const r = ensure(e.currency);
    r.available += e.amount;
    r.total += e.amount;
  }
  for (const e of balance.pending) {
    const r = ensure(e.currency);
    r.pending += e.amount;
    r.total += e.amount;
  }
  return Array.from(map.values()).filter((r) => r.total !== 0);
}

// ─── Payouts card ───────────────────────────────────────────────────────

function PayoutsCard({
  payouts,
  payoutsEnabled,
  fallbackCurrency,
}: {
  payouts: PayoutRow[] | null;
  payoutsEnabled: boolean;
  fallbackCurrency: string;
}) {
  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-6 pt-5 pb-3">
        <CardTitle className="text-sm">Recent Payouts</CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {payouts === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : payouts.length === 0 ? (
          <div className="rounded-md border border-border/40 bg-muted/10 px-4 py-5 text-center">
            <ArrowDownLeft className="mx-auto mb-2 size-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              {payoutsEnabled
                ? "Your payouts will appear here when payments arrive in your bank."
                : "Add a bank account on the Payments page to start receiving payouts."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {payouts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
                    <ArrowDownLeft size={14} className="text-foreground/80" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground">
                      {fmtMoney(p.amount / 100, p.currency || fallbackCurrency)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.status === "paid"
                        ? `Arrived ${formatStripeDate(p.arrival_date)}`
                        : p.status === "in_transit"
                          ? `Arriving ${formatStripeDate(p.arrival_date)}`
                          : p.status === "pending"
                            ? `Scheduled ${formatStripeDate(p.arrival_date)}`
                            : p.status === "failed"
                              ? "Failed — Stripe will retry"
                              : capitalize(p.status)}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    p.status === "paid"
                      ? "success"
                      : p.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {capitalize(p.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Charges card ───────────────────────────────────────────────────────

function ChargesCard({ charges }: { charges: ChargeRow[] | null }) {
  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-6 pt-5 pb-3">
        <CardTitle className="text-sm">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {charges === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : charges.length === 0 ? (
          <div className="rounded-md border border-border/40 bg-muted/10 px-4 py-5 text-center">
            <ArrowUpRight className="mx-auto mb-2 size-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              Your transactions will appear here as customers buy tickets.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {charges.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      c.refunded
                        ? "bg-muted/40"
                        : c.paid
                          ? "bg-success/10"
                          : "bg-warning/10"
                    }`}
                  >
                    <ArrowUpRight
                      size={14}
                      className={
                        c.refunded
                          ? "text-muted-foreground"
                          : c.paid
                            ? "text-success"
                            : "text-warning"
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {fmtMoney(c.amount / 100, c.currency)}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.customer_email || c.description || "Card payment"}
                      {" · "}
                      {formatStripeDate(c.created)}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    c.refunded
                      ? "secondary"
                      : c.paid && c.status === "succeeded"
                        ? "success"
                        : c.status === "failed"
                          ? "destructive"
                          : "warning"
                  }
                >
                  {c.refunded ? "Refunded" : capitalize(c.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatStripeDate(unixSeconds: number): string {
  if (!unixSeconds) return "";
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

/* ================================================================
   TAX TAB — VAT registration & configuration
   ================================================================ */

function TaxTab() {
  const orgId = useOrgId();
  const { currency: orgCurrency } = useOrgCurrency();
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
                    <span>{fmtMoney(26.50, orgCurrency)}</span>
                  </div>
                  {vat.prices_include_vat ? (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>
                        Includes VAT ({vat.vat_rate}%)
                      </span>
                      <span>
                        {fmtMoney(
                          26.5 -
                          26.5 / (1 + vat.vat_rate / 100),
                          orgCurrency
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-foreground/80">
                      <span>
                        VAT ({vat.vat_rate}%)
                      </span>
                      <span>
                        {fmtMoney((26.5 * vat.vat_rate) / 100, orgCurrency)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-border/50 pt-1.5 flex justify-between font-medium text-foreground">
                    <span>Total</span>
                    <span>
                      {fmtMoney(
                        vat.prices_include_vat
                          ? 26.50
                          : 26.5 + (26.5 * vat.vat_rate) / 100,
                        orgCurrency
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
