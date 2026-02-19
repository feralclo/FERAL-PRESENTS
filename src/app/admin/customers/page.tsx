"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Users,
  DollarSign,
  Repeat,
  Search,
  TrendingUp,
  Target,
  Crown,
  Music,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";
import { generateNickname } from "@/lib/nicknames";
import type { Customer } from "@/types/orders";

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getCustomerTier(totalSpent: number, totalOrders: number): {
  label: string;
  variant: "warning" | "success" | "secondary" | "info";
  color: string;
  icon: typeof Crown;
} {
  if (totalSpent >= 200 || totalOrders >= 5) {
    return { label: "Superfan", variant: "warning", color: "#fbbf24", icon: Crown };
  }
  if (totalOrders > 1) {
    return { label: "Fan", variant: "success", color: "#34d399", icon: Music };
  }
  if (totalOrders === 0) {
    return { label: "Discoverer", variant: "info", color: "#a855f7", icon: Target };
  }
  return { label: "New Fan", variant: "secondary", color: "#60a5fa", icon: Sparkles };
}

type SortOption = "newest" | "most_spent" | "most_orders" | "oldest";
type PeriodOption = "all" | "7d" | "30d" | "90d";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "most_spent", label: "Most Spent" },
  { value: "most_orders", label: "Most Orders" },
  { value: "oldest", label: "Oldest First" },
];

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "7d", label: "This Week" },
  { value: "30d", label: "This Month" },
  { value: "90d", label: "Last 3 Months" },
];

function getPeriodDate(period: PeriodOption): string | null {
  if (period === "all") return null;
  const now = new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

/* ════════════════════════════════════════════════════════
   CUSTOMERS PAGE
   ════════════════════════════════════════════════════════ */
export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<SortOption>("newest");
  const [period, setPeriod] = useState<PeriodOption>("all");

  // Derived stats
  const totalRevenue = customers.reduce((s, c) => s + Number(c.total_spent), 0);
  const avgSpend = customers.length > 0 ? totalRevenue / customers.length : 0;
  const repeatCustomers = customers.filter((c) => c.total_orders > 1).length;

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "100", sort });
    if (search) params.set("search", search);
    const since = getPeriodDate(period);
    if (since) params.set("since", since);

    try {
      const res = await fetch(`/api/customers?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(`API error (${res.status}): ${json.error || "Unknown error"}`);
        setLoading(false);
        return;
      }

      if (json.data) {
        setCustomers(json.data);
        setTotal(json.total || json.data.length);
      }
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : "Failed to fetch customers"}`);
    }
    setLoading(false);
  }, [search, sort, period]);

  useEffect(() => {
    const debounce = setTimeout(loadCustomers, 300);
    return () => clearTimeout(debounce);
  }, [loadCustomers]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
          Customers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer profiles and spending patterns
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Customers"
          value={total.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
        />
        <StatCard
          label="Avg Spend"
          value={formatCurrency(avgSpend)}
          icon={TrendingUp}
          detail="Per customer lifetime"
        />
        <StatCard
          label="Repeat Rate"
          value={`${customers.length > 0 ? ((repeatCustomers / customers.length) * 100).toFixed(0) : 0}%`}
          icon={Repeat}
          detail={`${repeatCustomers} of ${customers.length} customers`}
        />
      </div>

      {/* Search + Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="pl-9"
          />
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <ArrowUpDown
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="h-9 appearance-none rounded-md border border-border bg-card pl-9 pr-8 font-mono text-xs text-foreground outline-none focus:border-primary/50 transition-colors cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Period Pills */}
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded-md px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                period === p.value
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customers Table */}
      <div className="mt-4">
        {error ? (
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-lg bg-destructive/10 p-3">
                <Users size={24} className="text-destructive" />
              </div>
              <p className="mt-3 text-sm font-medium text-destructive">Failed to load customers</p>
              <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">{error}</p>
              <button
                onClick={() => loadCustomers()}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading customers...</p>
              </div>
            </CardContent>
          </Card>
        ) : customers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Users size={28} className="text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {search ? "No matches found" : "No customers yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden py-0 gap-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead>Last Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((cust) => {
                  const { label, variant, color, icon: TierIcon } = getCustomerTier(
                    Number(cust.total_spent),
                    cust.total_orders
                  );
                  const hasName = cust.first_name || cust.last_name;
                  const displayName = hasName
                    ? `${cust.first_name || ""} ${cust.last_name || ""}`.trim()
                    : (cust.nickname || generateNickname(cust.email));

                  return (
                    <TableRow
                      key={cust.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => router.push(`/admin/customers/${cust.id}/`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${color}15` }}
                          >
                            <TierIcon size={10} style={{ color }} />
                          </span>
                          <Link
                            href={`/admin/customers/${cust.id}/`}
                            className="text-sm font-medium transition-opacity hover:opacity-80"
                            style={{ color }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {displayName}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {cust.email}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {cust.phone || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={variant}
                          className="text-[10px] font-semibold uppercase"
                        >
                          {label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm tabular-nums text-foreground">
                        {cust.total_orders}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(Number(cust.total_spent))}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {cust.last_order_at ? formatDate(cust.last_order_at) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
