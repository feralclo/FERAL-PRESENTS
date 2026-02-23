"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  ArrowLeft,
  Check,
  X,
  CreditCard,
  BarChart3,
  Users,
  Globe,
  Calendar,
  ShoppingCart,
  PoundSterling,
  Zap,
  Save,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TenantDetail {
  org_id: string;
  display_name: string;
  logo: string | null;
  signup_date: string | null;
  primary_domain: { hostname: string; type: string } | null;
  onboarding: {
    account_created: boolean;
    stripe_connected: boolean;
    stripe_kyc_complete: boolean;
    first_event: boolean;
    first_sale: boolean;
  };
  plan: {
    plan_id: string;
    plan_name: string;
    fee_percent: number;
    min_fee: number;
    card_rate_label: string;
    subscription_status: string | null;
    billing_waived: boolean;
  };
  stripe: {
    account_id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  } | null;
  stats: {
    events_count: number;
    orders_count: number;
    total_revenue: number;
    estimated_fees: number;
    last_order_date: string | null;
  };
  team: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    status: string;
    perm_events: boolean;
    perm_orders: boolean;
    perm_marketing: boolean;
    perm_finance: boolean;
  }[];
  domains: {
    id: string;
    hostname: string;
    type: string;
    status: string;
    is_primary: boolean;
  }[];
  recent_events: {
    id: string;
    name: string;
    slug: string;
    status: string;
    venue_name: string | null;
    date_start: string | null;
  }[];
  recent_orders: {
    id: string;
    order_number: string;
    total: number;
    status: string;
    created_at: string;
    event_id: string | null;
  }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return "bg-success/10 text-success border-success/20";
    case "setup":
      return "bg-warning/10 text-warning border-warning/20";
    case "inactive":
      return "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20";
    case "invited":
      return "bg-info/10 text-info border-info/20";
    case "suspended":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "pending":
      return "bg-warning/10 text-warning border-warning/20";
    case "failed":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20";
  }
}

/* ------------------------------------------------------------------ */
/*  Onboarding Checklist                                               */
/* ------------------------------------------------------------------ */

function OnboardingChecklist({
  onboarding,
}: {
  onboarding: TenantDetail["onboarding"];
}) {
  const steps = [
    { label: "Account", done: onboarding.account_created },
    { label: "Stripe", done: onboarding.stripe_connected },
    { label: "KYC", done: onboarding.stripe_kyc_complete },
    { label: "Event", done: onboarding.first_event },
    { label: "Sale", done: onboarding.first_sale },
  ];
  const completed = steps.filter((s) => s.done).length;
  const percent = (completed / steps.length) * 100;

  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Onboarding
          </h3>
          <span className="text-xs text-muted-foreground">
            {completed} of {steps.length} complete
          </span>
        </div>
        <div className="flex items-center gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  step.done
                    ? "bg-success/10 text-success"
                    : "bg-muted-foreground/10 text-muted-foreground"
                }`}
              >
                {step.done ? <Check size={10} /> : <X size={10} />}
                {step.label}
              </div>
              {i < steps.length - 1 && (
                <div className="h-px w-3 bg-border/50" />
              )}
            </div>
          ))}
        </div>
        <Progress value={percent} className="h-1.5" />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Plan & Billing Card                                                */
/* ------------------------------------------------------------------ */

function PlanBillingCard({
  tenant,
  onSave,
}: {
  tenant: TenantDetail;
  onSave: (planId: string, billingWaived: boolean) => Promise<void>;
}) {
  const [planId, setPlanId] = useState(tenant.plan.plan_id);
  const [billingWaived, setBillingWaived] = useState(tenant.plan.billing_waived);
  const [saving, setSaving] = useState(false);
  const dirty =
    planId !== tenant.plan.plan_id ||
    billingWaived !== tenant.plan.billing_waived;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(planId, billingWaived);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CreditCard size={12} />
          Plan & Billing
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Plan</Label>
            <NativeSelect
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="h-8 text-sm"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
            </NativeSelect>
          </div>
          <div className="text-xs text-muted-foreground">
            Fees: {tenant.plan.card_rate_label}
          </div>
          {tenant.plan.subscription_status && (
            <div className="text-xs">
              <span className="text-muted-foreground">Subscription: </span>
              <span className="text-foreground capitalize">
                {tenant.plan.subscription_status}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={billingWaived}
              onCheckedChange={setBillingWaived}
              id="billing-waived"
            />
            <Label htmlFor="billing-waived" className="text-xs text-muted-foreground">
              Billing waived
            </Label>
          </div>
          {dirty && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-7 text-xs"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin mr-1" />
              ) : (
                <Save size={12} className="mr-1" />
              )}
              Save
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe Card                                                        */
/* ------------------------------------------------------------------ */

function StripeCard({ stripe }: { stripe: TenantDetail["stripe"] }) {
  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap size={12} />
          Stripe Payments
        </div>
        {stripe ? (
          <div className="space-y-1.5 text-sm">
            <div>
              <span className="text-muted-foreground">Status: </span>
              <span className="text-success">Connected</span>
            </div>
            <div>
              <span className="text-muted-foreground">Account: </span>
              <span className="font-mono text-xs text-foreground">
                {stripe.account_id}
              </span>
            </div>
            <StatusRow label="Charges" enabled={stripe.charges_enabled} />
            <StatusRow label="Payouts" enabled={stripe.payouts_enabled} />
            <StatusRow
              label="KYC"
              enabled={stripe.details_submitted}
              trueText="Complete"
              falseText="Incomplete"
            />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Not connected</div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusRow({
  label,
  enabled,
  trueText,
  falseText,
}: {
  label: string;
  enabled: boolean;
  trueText?: string;
  falseText?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}: </span>
      {enabled ? (
        <span className="flex items-center gap-1 text-success">
          <Check size={12} />
          {trueText || "Yes"}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-muted-foreground">
          <X size={12} />
          {falseText || "No"}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity Card                                                      */
/* ------------------------------------------------------------------ */

function ActivityCard({ stats }: { stats: TenantDetail["stats"] }) {
  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <BarChart3 size={12} />
          Activity
        </div>
        <div className="space-y-1.5 text-sm">
          <div>
            <span className="text-muted-foreground">Events: </span>
            <span className="text-foreground">{stats.events_count}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Orders: </span>
            <span className="text-foreground">{stats.orders_count}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Revenue: </span>
            <span className="font-medium text-foreground">
              {formatCurrency(stats.total_revenue)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Last order: </span>
            <span className="text-foreground">
              {stats.last_order_date
                ? relativeDate(stats.last_order_date)
                : "—"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Platform Revenue Card                                              */
/* ------------------------------------------------------------------ */

function PlatformRevenueCard({ stats }: { stats: TenantDetail["stats"] }) {
  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <PoundSterling size={12} />
          Platform Revenue
        </div>
        <div className="space-y-1.5 text-sm">
          <div>
            <span className="text-muted-foreground">Est. fees: </span>
            <span className="font-medium text-foreground">
              {formatCurrency(stats.estimated_fees)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">GMV: </span>
            <span className="text-foreground">
              {formatCurrency(stats.total_revenue)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Based on current plan rates
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Tables                                                             */
/* ------------------------------------------------------------------ */

function TeamTable({ team }: { team: TenantDetail["team"] }) {
  if (team.length === 0) return null;
  return (
    <SectionCard title="Team Members" icon={Users}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Permissions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {team.map((m) => (
              <tr key={m.email}>
                <td className="px-4 py-2 text-foreground">{m.email}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {[m.first_name, m.last_name].filter(Boolean).join(" ") ||
                    "—"}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${
                      m.role === "owner"
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20"
                    }`}
                  >
                    {m.role}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${statusBadge(m.status)}`}
                  >
                    {m.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {m.role === "owner"
                    ? "All"
                    : [
                        m.perm_events && "Events",
                        m.perm_orders && "Orders",
                        m.perm_marketing && "Marketing",
                        m.perm_finance && "Finance",
                      ]
                        .filter(Boolean)
                        .join(", ") || "None"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function DomainsTable({
  domains,
}: {
  domains: TenantDetail["domains"];
}) {
  if (domains.length === 0) return null;
  return (
    <SectionCard title="Domains" icon={Globe}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left">Hostname</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-center">Primary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {domains.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-mono text-xs text-foreground">
                  {d.hostname}
                </td>
                <td className="px-4 py-2 capitalize text-muted-foreground">
                  {d.type}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${statusBadge(d.status)}`}
                  >
                    {d.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-center">
                  {d.is_primary ? (
                    <Check size={14} className="inline text-success" />
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function RecentEventsTable({
  events,
}: {
  events: TenantDetail["recent_events"];
}) {
  if (events.length === 0) return null;
  return (
    <SectionCard title="Recent Events" icon={Calendar} subtitle="Last 5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Venue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 text-foreground">{e.name}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatDate(e.date_start)}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${statusBadge(e.status)}`}
                  >
                    {e.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {e.venue_name || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function RecentOrdersTable({
  orders,
}: {
  orders: TenantDetail["recent_orders"];
}) {
  if (orders.length === 0) return null;
  return (
    <SectionCard title="Recent Orders" icon={ShoppingCart} subtitle="Last 5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left">Order #</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-2 font-mono text-xs text-foreground">
                  {o.order_number}
                </td>
                <td className="px-4 py-2 text-right font-mono text-foreground">
                  {formatCurrency(o.total)}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${statusBadge(o.status)}`}
                  >
                    {o.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {relativeDate(o.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Card Wrapper                                               */
/* ------------------------------------------------------------------ */

function SectionCard({
  title,
  icon: Icon,
  subtitle,
  children,
}: {
  title: string;
  icon: typeof Users;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          <Icon size={12} className="text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[10px] text-muted-foreground/60">
              ({subtitle})
            </span>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TenantDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/platform/tenants/${encodeURIComponent(orgId)}`)
      .then((res) => {
        if (res.status === 404) throw new Error("Tenant not found");
        if (!res.ok) throw new Error("Failed to fetch tenant");
        return res.json();
      })
      .then((json) => setTenant(json.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  const handlePlanSave = useCallback(
    async (planId: string, billingWaived: boolean) => {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          plan_id: planId,
          billing_waived: billingWaived,
        }),
      });
      if (!res.ok) throw new Error("Failed to save plan");
      // Refresh data
      const refreshRes = await fetch(
        `/api/platform/tenants/${encodeURIComponent(orgId)}`
      );
      if (refreshRes.ok) {
        const json = await refreshRes.json();
        setTenant(json.data);
      }
    },
    [orgId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-warning/60" />
        <span className="ml-3 text-sm text-muted-foreground">
          Loading tenant...
        </span>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="space-y-4 p-6 lg:p-8">
        <button
          onClick={() => router.push("/admin/backend/tenants")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Tenants
        </button>
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-destructive">
            {error || "Tenant not found"}
          </p>
        </div>
      </div>
    );
  }

  // Derive status for badge
  let derivedStatus: "active" | "setup" | "inactive" = "inactive";
  if (tenant.stats.orders_count > 0) {
    derivedStatus = "active";
  } else if (tenant.signup_date) {
    const age = Date.now() - new Date(tenant.signup_date).getTime();
    derivedStatus = age < 30 * 24 * 60 * 60 * 1000 ? "setup" : "inactive";
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Back link */}
      <Link
        href="/admin/backend/tenants"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft size={14} />
        Back to Tenants
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {tenant.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo}
            alt={`${tenant.display_name} logo`}
            className="h-12 w-12 rounded-lg object-cover border border-border/50"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {tenant.display_name}
            </h1>
            <Badge
              variant="outline"
              className={`text-[10px] capitalize ${statusBadge(derivedStatus)}`}
            >
              {derivedStatus}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{tenant.org_id}</span>
            {tenant.primary_domain && (
              <>
                <span>·</span>
                <span>{tenant.primary_domain.hostname}</span>
              </>
            )}
            {tenant.signup_date && (
              <>
                <span>·</span>
                <span>Signed up {relativeDate(tenant.signup_date)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Onboarding */}
      <OnboardingChecklist onboarding={tenant.onboarding} />

      {/* 2x2 grid: Plan, Stripe, Activity, Revenue */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PlanBillingCard tenant={tenant} onSave={handlePlanSave} />
        <StripeCard stripe={tenant.stripe} />
        <ActivityCard stats={tenant.stats} />
        <PlatformRevenueCard stats={tenant.stats} />
      </div>

      {/* Tables */}
      <div className="space-y-4">
        <TeamTable team={tenant.team} />
        <DomainsTable domains={tenant.domains} />
        <RecentEventsTable events={tenant.recent_events} />
        <RecentOrdersTable orders={tenant.recent_orders} />
      </div>
    </div>
  );
}
