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
} {
  if (totalSpent >= 200 || totalOrders >= 5) {
    return { label: "Superfan", variant: "warning" };
  }
  if (totalOrders > 1) {
    return { label: "Fan", variant: "success" };
  }
  if (totalOrders === 0) {
    return { label: "Discoverer", variant: "info" };
  }
  return { label: "New Fan", variant: "secondary" };
}

/* ════════════════════════════════════════════════════════
   CUSTOMERS PAGE
   ════════════════════════════════════════════════════════ */
export default function CustomersPage() {
  const router = useRouter();
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

      {/* Customers Table */}
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
                  const { label, variant } = getCustomerTier(
                    Number(cust.total_spent),
                    cust.total_orders
                  );
                  const isLead = cust.total_orders === 0;
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
                          {isLead && (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/10">
                              <Target size={10} className="text-purple-400" />
                            </span>
                          )}
                          <Link
                            href={`/admin/customers/${cust.id}/`}
                            className={`text-sm font-medium transition-colors hover:text-primary ${
                              isLead ? "text-purple-400" : "text-foreground"
                            }`}
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
