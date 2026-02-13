"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Users,
  DollarSign,
  ShoppingBag,
  Repeat,
  Search,
  ChevronRight,
  User,
  Mail,
} from "lucide-react";
import type { Customer } from "@/types/orders";

/* ── Stat card ── */
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
  accent?: boolean;
}) {
  return (
    <Card className="group relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
              {label}
            </p>
            <p
              className={`mt-2 font-mono text-2xl font-bold tracking-wide ${
                accent ? "text-primary" : "text-foreground"
              }`}
            >
              {value}
            </p>
            {detail && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
            <Icon size={18} strokeWidth={1.75} className="text-primary" />
          </div>
        </div>
      </CardContent>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </Card>
  );
}

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

function getInitials(first?: string, last?: string): string {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
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
          Customer profiles and purchase history
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Customers"
          value={total.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          accent
        />
        <StatCard
          label="Avg Spend"
          value={formatCurrency(avgSpend)}
          icon={ShoppingBag}
          detail="Per customer"
        />
        <StatCard
          label="Repeat Customers"
          value={repeatCustomers.toLocaleString()}
          icon={Repeat}
          detail={`${customers.length > 0 ? ((repeatCustomers / customers.length) * 100).toFixed(0) : 0}% return rate`}
        />
      </div>

      {/* Search */}
      <div className="mt-6">
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or phone..."
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customers List */}
      <div className="mt-4">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading customers...</p>
              </div>
            </CardContent>
          </Card>
        ) : customers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users size={40} className="text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {search ? "No customers match your search" : "No customers yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {/* Table header (desktop) */}
            <div className="hidden border-b border-border px-5 py-3 lg:grid lg:grid-cols-[2.5fr_2fr_1fr_1fr_1fr_1fr_auto]">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                <User size={10} /> Customer
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                <Mail size={10} /> Email
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Orders
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Spent
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                First Order
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Last Order
              </span>
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {customers.map((cust) => (
                <Link
                  key={cust.id}
                  href={`/admin/customers/${cust.id}/`}
                  className="group block transition-colors duration-100 hover:bg-accent/30"
                >
                  {/* Desktop row */}
                  <div className="hidden items-center px-5 py-3.5 lg:grid lg:grid-cols-[2.5fr_2fr_1fr_1fr_1fr_1fr_auto]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                        <span className="font-mono text-[10px] font-bold text-primary">
                          {getInitials(cust.first_name, cust.last_name)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {cust.first_name} {cust.last_name}
                        </p>
                        {cust.phone && (
                          <p className="text-xs text-muted-foreground">{cust.phone}</p>
                        )}
                      </div>
                    </div>
                    <span className="truncate text-sm text-muted-foreground">
                      {cust.email}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm text-foreground">
                        {cust.total_orders}
                      </span>
                      {cust.total_orders > 1 && (
                        <Badge variant="success" className="text-[9px]">
                          Repeat
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {formatCurrency(Number(cust.total_spent))}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {cust.first_order_at ? formatDate(cust.first_order_at) : "—"}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {cust.last_order_at ? formatDate(cust.last_order_at) : "—"}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground/20 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                    />
                  </div>

                  {/* Mobile row */}
                  <div className="flex items-center justify-between px-5 py-4 lg:hidden">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                        <span className="font-mono text-xs font-bold text-primary">
                          {getInitials(cust.first_name, cust.last_name)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {cust.first_name} {cust.last_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {cust.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatCurrency(Number(cust.total_spent))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {cust.total_orders} order{cust.total_orders !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
