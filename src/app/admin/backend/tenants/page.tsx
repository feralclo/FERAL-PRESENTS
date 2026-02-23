"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Users,
  Zap,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CreditCard,
  Globe,
  UserCircle,
  BarChart3,
  Check,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TenantOwner {
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

interface Tenant {
  org_id: string;
  owner: TenantOwner | null;
  team_size: number;
  plan: {
    plan_id: string;
    plan_name: string;
    subscription_status: string | null;
    billing_waived: boolean;
  };
  domain: { hostname: string; type: string } | null;
  branding: { org_name: string | null; logo: string | null } | null;
  stripe_connected: boolean;
  stats: {
    events_count: number;
    orders_count: number;
    total_revenue: number;
  };
  display_name: string;
  signup_date: string | null;
  status: "active" | "setup" | "inactive";
}

type SortKey =
  | "name"
  | "email"
  | "signup"
  | "plan"
  | "payments"
  | "events"
  | "revenue"
  | "status";

type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function statusColor(status: Tenant["status"]) {
  switch (status) {
    case "active":
      return "bg-success/10 text-success border-success/20";
    case "setup":
      return "bg-warning/10 text-warning border-warning/20";
    case "inactive":
      return "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20";
  }
}

function planBadgeColor(planId: string) {
  return planId === "pro"
    ? "bg-primary/10 text-primary border-primary/20"
    : "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20";
}

/* ------------------------------------------------------------------ */
/*  Sorting                                                            */
/* ------------------------------------------------------------------ */

function sortTenants(tenants: Tenant[], key: SortKey, dir: SortDir): Tenant[] {
  const sorted = [...tenants];
  const m = dir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (key) {
      case "name":
        return m * a.display_name.localeCompare(b.display_name);
      case "email":
        return m * (a.owner?.email || "").localeCompare(b.owner?.email || "");
      case "signup":
        return m * ((a.signup_date || "").localeCompare(b.signup_date || ""));
      case "plan":
        return m * a.plan.plan_id.localeCompare(b.plan.plan_id);
      case "payments":
        return m * (Number(a.stripe_connected) - Number(b.stripe_connected));
      case "events":
        return m * (a.stats.events_count - b.stats.events_count);
      case "revenue":
        return m * (a.stats.total_revenue - b.stats.total_revenue);
      case "status": {
        const order: Record<string, number> = { active: 0, setup: 1, inactive: 2 };
        return m * ((order[a.status] ?? 3) - (order[b.status] ?? 3));
      }
      default:
        return 0;
    }
  });

  return sorted;
}

/* ------------------------------------------------------------------ */
/*  Component: SortHeader                                              */
/* ------------------------------------------------------------------ */

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  const Icon = active
    ? currentDir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-left font-medium hover:text-foreground transition-colors"
    >
      {label}
      <Icon
        size={12}
        className={active ? "text-warning" : "text-muted-foreground/40"}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Component: Detail Panel (expandable row)                           */
/* ------------------------------------------------------------------ */

function TenantDetail({ tenant }: { tenant: Tenant }) {
  return (
    <tr>
      <td colSpan={8} className="px-4 pb-4 pt-0">
        <div className="grid gap-4 rounded-lg border border-border/30 bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Identity */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <UserCircle size={12} />
              Identity
            </div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Org ID: </span>
                <span className="font-mono text-foreground">{tenant.org_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Name: </span>
                <span className="text-foreground">{tenant.display_name}</span>
              </div>
              {tenant.domain && (
                <div>
                  <span className="text-muted-foreground">Domain: </span>
                  <span className="text-foreground">{tenant.domain.hostname}</span>
                  <span className="ml-1 text-xs text-muted-foreground">({tenant.domain.type})</span>
                </div>
              )}
              {tenant.branding?.logo && (
                <div className="mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tenant.branding.logo}
                    alt={`${tenant.display_name} logo`}
                    className="h-8 w-auto rounded"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Plan & Payments */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CreditCard size={12} />
              Plan & Payments
            </div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Plan: </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${planBadgeColor(tenant.plan.plan_id)}`}
                >
                  {tenant.plan.plan_name}
                </Badge>
              </div>
              {tenant.plan.subscription_status && (
                <div>
                  <span className="text-muted-foreground">Subscription: </span>
                  <span className="text-foreground capitalize">{tenant.plan.subscription_status}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Billing waived: </span>
                <span className="text-foreground">{tenant.plan.billing_waived ? "Yes" : "No"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Stripe: </span>
                {tenant.stripe_connected ? (
                  <span className="text-success">Connected</span>
                ) : (
                  <span className="text-muted-foreground">Not connected</span>
                )}
              </div>
            </div>
          </div>

          {/* Team & Activity */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <BarChart3 size={12} />
              Team & Activity
            </div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Team members: </span>
                <span className="text-foreground">{tenant.team_size}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Owner: </span>
                <span className="text-foreground">{tenant.owner?.email || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Events: </span>
                <span className="text-foreground">{tenant.stats.events_count}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Orders: </span>
                <span className="text-foreground">{tenant.stats.orders_count}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Revenue: </span>
                <span className="text-foreground">{formatCurrency(tenant.stats.total_revenue)}</span>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("signup");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/platform/tenants")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch tenants");
        return res.json();
      })
      .then((json) => {
        if (json.data) setTenants(json.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleExpand = (orgId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = q
      ? tenants.filter(
          (t) =>
            t.display_name.toLowerCase().includes(q) ||
            t.org_id.toLowerCase().includes(q) ||
            (t.owner?.email?.toLowerCase().includes(q) ?? false)
        )
      : tenants;
    return sortTenants(list, sortKey, sortDir);
  }, [tenants, search, sortKey, sortDir]);

  // Summary counts
  const counts = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter((t) => t.status === "active").length;
    const setup = tenants.filter((t) => t.status === "setup").length;
    const inactive = tenants.filter((t) => t.status === "inactive").length;
    return { total, active, setup, inactive };
  }, [tenants]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-warning/60" />
        <span className="ml-3 text-sm text-muted-foreground">Loading tenants...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All organizations on the platform. Monitor signups, setup progress, and
          activity.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Tenants"
          value={counts.total}
          icon={Users}
          color="text-foreground"
        />
        <SummaryCard
          label="Active"
          value={counts.active}
          icon={Zap}
          color="text-success"
        />
        <SummaryCard
          label="In Setup"
          value={counts.setup}
          icon={Clock}
          color="text-warning"
        />
        <SummaryCard
          label="Inactive"
          value={counts.inactive}
          icon={AlertTriangle}
          color="text-muted-foreground"
        />
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <Input
          placeholder="Filter by name, email, or org ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {/* Table */}
      <Card className="py-0 gap-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left w-8" />
                  <th className="px-4 py-3 text-left">
                    <SortHeader label="Org" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader label="Owner" sortKey="email" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader label="Signed Up" sortKey="signup" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader label="Plan" sortKey="plan" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-center">
                    <SortHeader label="Payments" sortKey="payments" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortHeader label="Events" sortKey="events" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortHeader label="Revenue" sortKey="revenue" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((tenant) => {
                  const isExpanded = expanded.has(tenant.org_id);
                  return (
                    <TenantRow
                      key={tenant.org_id}
                      tenant={tenant}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(tenant.org_id)}
                    />
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      {search ? "No tenants match your search" : "No tenants found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component: SummaryCard                                             */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
}) {
  return (
    <Card className="py-0 gap-0">
      <CardContent className="flex items-center gap-4 px-5 py-4">
        <div className={`rounded-lg bg-card p-2.5 border border-border/50 ${color}`}>
          <Icon size={16} />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Component: TenantRow                                               */
/* ------------------------------------------------------------------ */

function TenantRow({
  tenant,
  isExpanded,
  onToggle,
}: {
  tenant: Tenant;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-card/50"
      >
        {/* Expand icon */}
        <td className="px-4 py-3">
          <Chevron size={14} className="text-muted-foreground" />
        </td>

        {/* Org */}
        <td className="px-4 py-3">
          <div className="font-medium text-foreground">{tenant.display_name}</div>
          {tenant.domain && (
            <div className="text-xs text-muted-foreground">{tenant.domain.hostname}</div>
          )}
        </td>

        {/* Owner */}
        <td className="px-4 py-3">
          <div className="text-foreground">{tenant.owner?.email || "—"}</div>
          {(tenant.owner?.first_name || tenant.owner?.last_name) && (
            <div className="text-xs text-muted-foreground">
              {[tenant.owner?.first_name, tenant.owner?.last_name]
                .filter(Boolean)
                .join(" ")}
            </div>
          )}
        </td>

        {/* Signed Up */}
        <td className="px-4 py-3 text-muted-foreground">
          {tenant.signup_date ? relativeDate(tenant.signup_date) : "—"}
        </td>

        {/* Plan */}
        <td className="px-4 py-3">
          <Badge
            variant="outline"
            className={`text-[10px] ${planBadgeColor(tenant.plan.plan_id)}`}
          >
            {tenant.plan.plan_name}
          </Badge>
        </td>

        {/* Payments (Stripe connected) */}
        <td className="px-4 py-3 text-center">
          {tenant.stripe_connected ? (
            <Check size={14} className="inline text-success" />
          ) : (
            <X size={14} className="inline text-muted-foreground/40" />
          )}
        </td>

        {/* Events */}
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {tenant.stats.events_count}
        </td>

        {/* Revenue */}
        <td className="px-4 py-3 text-right font-mono text-foreground">
          {formatCurrency(tenant.stats.total_revenue)}
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <Badge
            variant="outline"
            className={`text-[10px] capitalize ${statusColor(tenant.status)}`}
          >
            {tenant.status}
          </Badge>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && <TenantDetail tenant={tenant} />}
    </>
  );
}
