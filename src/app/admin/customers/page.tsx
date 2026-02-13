"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  DollarSign,
  ShoppingBag,
  Repeat,
  Search,
  ChevronRight,
  Crown,
  Star,
  Clock,
  TrendingUp,
} from "lucide-react";
import type { Customer } from "@/types/orders";

/* ── Stat card with accent strip ── */
function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  detail?: string;
  accent?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: accent || "var(--color-border)" }}
      />
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {label}
          </p>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
            <Icon size={14} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
        </div>
        <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        {detail && (
          <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInitials(first?: string, last?: string): string {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
}

function getCustomerTier(totalSpent: number, totalOrders: number): {
  tier: "gold" | "green" | "primary";
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
} {
  if (totalSpent >= 200 || totalOrders >= 5) {
    return { tier: "gold", label: "VIP", icon: Crown };
  }
  if (totalOrders > 1) {
    return { tier: "green", label: "Returning", icon: Repeat };
  }
  return { tier: "primary", label: "New", icon: Star };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ── Segment bar ── */
function SegmentBar({
  segments,
}: {
  segments: { label: string; count: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  if (total === 0) return null;

  return (
    <div className="mt-6">
      <Card>
        <CardContent className="p-5">
          <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
            Customer Segments
          </p>
          {/* Bar */}
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {segments.map((seg) => {
              const pct = (seg.count / total) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={seg.label}
                  className="transition-all duration-500"
                  style={{ width: `${pct}%`, background: seg.color }}
                />
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-3 flex items-center gap-5">
            {segments.map((seg) => (
              <div key={seg.label} className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: seg.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {seg.label}{" "}
                  <span className="font-mono font-medium text-foreground">
                    {seg.count}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   CUSTOMERS PAGE
   ════════════════════════════════════════════════════════ */
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  // Derived stats
  const totalRevenue = customers.reduce((s, c) => s + Number(c.total_spent), 0);
  const avgSpend = customers.length > 0 ? totalRevenue / customers.length : 0;
  const repeatCustomers = customers.filter((c) => c.total_orders > 1).length;
  const maxSpend = Math.max(...customers.map((c) => Number(c.total_spent)), 1);

  // Segments
  const segments = useMemo(() => {
    const vip = customers.filter(
      (c) => Number(c.total_spent) >= 200 || c.total_orders >= 5
    ).length;
    const returning = customers.filter(
      (c) => c.total_orders > 1 && !(Number(c.total_spent) >= 200 || c.total_orders >= 5)
    ).length;
    const newCust = customers.length - vip - returning;
    return [
      { label: "VIP", count: vip, color: "#eab308" },
      { label: "Returning", count: returning, color: "#22c55e" },
      { label: "New", count: newCust, color: "#ff0033" },
    ];
  }, [customers]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);

    const res = await fetch(`/api/customers?${params}`);
    const json = await res.json();

    if (json.data) {
      setCustomers(json.data);
      setTotal(json.total || json.data.length);
    }
    setLoading(false);
  }, [search]);

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
          Customer profiles, spending patterns, and engagement
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Customers"
          value={total.toLocaleString()}
          icon={Users}
          accent="#ff0033"
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          accent="#22c55e"
        />
        <StatCard
          label="Avg Spend"
          value={formatCurrency(avgSpend)}
          icon={TrendingUp}
          detail="Per customer lifetime"
          accent="#8b5cf6"
        />
        <StatCard
          label="Repeat Rate"
          value={`${customers.length > 0 ? ((repeatCustomers / customers.length) * 100).toFixed(0) : 0}%`}
          icon={Repeat}
          detail={`${repeatCustomers} of ${customers.length} customers`}
          accent="#eab308"
        />
      </div>

      {/* Segment Bar */}
      {!loading && customers.length > 0 && <SegmentBar segments={segments} />}

      {/* Search */}
      <div className="mt-6">
        <div className="relative">
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
      </div>

      {/* Customers List */}
      <div className="mt-4">
        {loading ? (
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
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <Users size={28} className="text-muted-foreground/40" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                {search ? "No matches found" : "No customers yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {search
                  ? "Try adjusting your search query"
                  : "Customers will appear here after their first purchase"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {customers.map((cust) => {
              const { tier, label, icon: TierIcon } = getCustomerTier(
                Number(cust.total_spent),
                cust.total_orders
              );
              const spendPct = (Number(cust.total_spent) / maxSpend) * 100;

              return (
                <Link
                  key={cust.id}
                  href={`/admin/customers/${cust.id}/`}
                  className="group block"
                >
                  <Card className="transition-all duration-150 hover:border-muted-foreground/20 hover:bg-card/80">
                    <CardContent className="p-0">
                      {/* Desktop layout */}
                      <div className="hidden items-center gap-5 px-5 py-4 lg:flex">
                        {/* Avatar */}
                        <Avatar
                          size="default"
                          tier={tier}
                          initials={getInitials(cust.first_name, cust.last_name)}
                        />

                        {/* Name + email */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {cust.first_name} {cust.last_name}
                            </p>
                            <Badge
                              variant={
                                tier === "gold"
                                  ? "warning"
                                  : tier === "green"
                                    ? "success"
                                    : "secondary"
                              }
                              className="gap-1 text-[9px]"
                            >
                              <TierIcon size={9} />
                              {label}
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {cust.email}
                            {cust.phone && (
                              <span className="ml-2 text-muted-foreground/50">
                                {cust.phone}
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Orders count */}
                        <div className="w-20 text-center">
                          <p className="font-mono text-sm font-semibold text-foreground">
                            {cust.total_orders}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            order{cust.total_orders !== 1 ? "s" : ""}
                          </p>
                        </div>

                        {/* Spend with progress bar */}
                        <div className="w-36">
                          <div className="flex items-baseline justify-between">
                            <span className="font-mono text-sm font-bold text-foreground">
                              {formatCurrency(Number(cust.total_spent))}
                            </span>
                          </div>
                          <Progress
                            value={spendPct}
                            max={100}
                            className="mt-1.5"
                            indicatorClassName={
                              tier === "gold"
                                ? "bg-amber-500"
                                : tier === "green"
                                  ? "bg-emerald-500"
                                  : "bg-primary"
                            }
                          />
                        </div>

                        {/* Last active */}
                        <div className="w-24 text-right">
                          {cust.last_order_at ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Clock size={10} className="text-muted-foreground/40" />
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {timeAgo(cust.last_order_at)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-[11px] text-muted-foreground/30">
                              No orders
                            </span>
                          )}
                        </div>

                        {/* Arrow */}
                        <ChevronRight
                          size={14}
                          className="text-muted-foreground/15 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground/50"
                        />
                      </div>

                      {/* Mobile layout */}
                      <div className="flex items-center gap-3.5 px-4 py-3.5 lg:hidden">
                        <Avatar
                          size="default"
                          tier={tier}
                          initials={getInitials(cust.first_name, cust.last_name)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {cust.first_name} {cust.last_name}
                            </p>
                            <Badge
                              variant={
                                tier === "gold"
                                  ? "warning"
                                  : tier === "green"
                                    ? "success"
                                    : "secondary"
                              }
                              className="gap-1 text-[9px]"
                            >
                              <TierIcon size={9} />
                              {label}
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {cust.email}
                          </p>
                          <div className="mt-2">
                            <Progress
                              value={spendPct}
                              max={100}
                              indicatorClassName={
                                tier === "gold"
                                  ? "bg-amber-500"
                                  : tier === "green"
                                    ? "bg-emerald-500"
                                    : "bg-primary"
                              }
                            />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono text-sm font-bold text-foreground">
                            {formatCurrency(Number(cust.total_spent))}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {cust.total_orders} order{cust.total_orders !== 1 ? "s" : ""}
                          </span>
                          {cust.last_order_at && (
                            <span className="font-mono text-[10px] text-muted-foreground/50">
                              {timeAgo(cust.last_order_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
