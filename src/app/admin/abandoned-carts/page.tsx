"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  ShoppingCart,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import type { AbandonedCart } from "@/types/orders";

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

function getStatusConfig(status: string): {
  label: string;
  variant: "warning" | "success" | "destructive";
  icon: typeof Clock;
} {
  switch (status) {
    case "recovered":
      return { label: "Recovered", variant: "success", icon: CheckCircle2 };
    case "expired":
      return { label: "Expired", variant: "destructive", icon: AlertCircle };
    default:
      return { label: "Abandoned", variant: "warning", icon: Clock };
  }
}

interface AbandonedCartStats {
  total: number;
  abandoned: number;
  recovered: number;
  total_value: number;
  recovered_value: number;
}

/* ════════════════════════════════════════════════════════
   ABANDONED CARTS PAGE
   ════════════════════════════════════════════════════════ */
export default function AbandonedCartsPage() {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AbandonedCartStats>({
    total: 0,
    abandoned: 0,
    recovered: 0,
    total_value: 0,
    recovered_value: 0,
  });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const loadCarts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);

    const res = await fetch(`/api/abandoned-carts?${params}`);
    const json = await res.json();

    if (json.data) {
      setCarts(json.data);
      setTotal(json.total || json.data.length);
    }
    if (json.stats) {
      setStats(json.stats);
    }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(loadCarts, 300);
    return () => clearTimeout(debounce);
  }, [loadCarts]);

  const recoveryRate = stats.total > 0
    ? ((stats.recovered / stats.total) * 100).toFixed(1)
    : "0";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
          Abandoned Carts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recover lost revenue from incomplete checkouts
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Abandoned"
          value={stats.abandoned.toString()}
          icon={ShoppingCart}
          detail={`${formatCurrency(stats.total_value)} potential`}
        />
        <StatCard
          label="Recovered"
          value={stats.recovered.toString()}
          icon={RefreshCw}
          detail={`${formatCurrency(stats.recovered_value)} recovered`}
        />
        <StatCard
          label="Recovery Rate"
          value={`${recoveryRate}%`}
          icon={TrendingUp}
          detail={`${stats.recovered} of ${stats.total} carts`}
        />
        <StatCard
          label="Lost Revenue"
          value={formatCurrency(stats.total_value)}
          icon={DollarSign}
          detail="From abandoned carts"
        />
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5">
          {[
            { value: "", label: "All" },
            { value: "abandoned", label: "Abandoned" },
            { value: "recovered", label: "Recovered" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                statusFilter === opt.value
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-border hover:bg-card"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Carts Table */}
      <div className="mt-4">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading abandoned carts...</p>
              </div>
            </CardContent>
          </Card>
        ) : carts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <ShoppingCart size={28} className="text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {search || statusFilter ? "No matches found" : "No abandoned carts yet"}
              </p>
              {!search && !statusFilter && (
                <p className="mt-1 text-xs text-muted-foreground/50">
                  Carts are captured when customers enter their email at checkout
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden py-0 gap-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead>Customer</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carts.map((cart) => {
                  const { label, variant, icon: StatusIcon } = getStatusConfig(cart.status);
                  const isExpanded = expandedRow === cart.id;
                  const itemCount = cart.items?.reduce((sum, i) => sum + i.qty, 0) || 0;
                  const name = [cart.first_name, cart.last_name].filter(Boolean).join(" ");

                  return (
                    <>
                      <TableRow
                        key={cart.id}
                        className="cursor-pointer group"
                        onClick={() => setExpandedRow(isExpanded ? null : cart.id)}
                      >
                        <TableCell className="w-10 pr-0">
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {name || "Unknown"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {cart.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {cart.event?.name || "—"}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                            <Package size={12} className="text-muted-foreground/60" />
                            {itemCount} {itemCount === 1 ? "ticket" : "tickets"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(cart.subtotal)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={variant}
                            className="gap-1 text-[10px] font-semibold uppercase"
                          >
                            <StatusIcon size={10} />
                            {label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs text-foreground">
                              {timeAgo(cart.created_at)}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60">
                              {formatDate(cart.created_at)} {formatTime(cart.created_at)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded row — cart details */}
                      {isExpanded && (
                        <TableRow key={`${cart.id}-details`} className="hover:bg-transparent">
                          <TableCell colSpan={7} className="p-0">
                            <div className="border-t border-border/30 bg-card/50 px-6 py-4">
                              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                                {/* Cart items */}
                                <div className="lg:col-span-2">
                                  <h4 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                                    Cart Contents
                                  </h4>
                                  <div className="space-y-2">
                                    {cart.items?.map((item, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between rounded-lg border border-border/30 bg-background/50 px-4 py-3"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/8 text-primary">
                                            <Package size={14} />
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-foreground">
                                              {item.name}
                                            </p>
                                            {item.merch_size && (
                                              <p className="text-[11px] text-muted-foreground">
                                                Size: {item.merch_size}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                                            {formatCurrency(item.price * item.qty)}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground">
                                            {item.qty} x {formatCurrency(item.price)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Customer + recovery info */}
                                <div>
                                  <h4 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
                                    Customer
                                  </h4>
                                  <div className="space-y-3 rounded-lg border border-border/30 bg-background/50 p-4">
                                    <div>
                                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                        Email
                                      </p>
                                      <p className="mt-0.5 text-sm text-foreground">
                                        {cart.email}
                                      </p>
                                    </div>
                                    {name && (
                                      <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                          Name
                                        </p>
                                        <p className="mt-0.5 text-sm text-foreground">
                                          {name}
                                        </p>
                                      </div>
                                    )}
                                    {cart.customer && (
                                      <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                          Profile
                                        </p>
                                        <Link
                                          href={`/admin/customers/${cart.customer.id}/`}
                                          className="mt-0.5 inline-flex items-center gap-1 text-sm text-primary transition-colors hover:text-primary/80"
                                        >
                                          View customer profile &rarr;
                                        </Link>
                                      </div>
                                    )}
                                    {cart.event && (
                                      <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                          Event
                                        </p>
                                        <Link
                                          href={`/admin/events/${cart.event.slug}/`}
                                          className="mt-0.5 inline-flex items-center gap-1 text-sm text-primary transition-colors hover:text-primary/80"
                                        >
                                          {cart.event.name} &rarr;
                                        </Link>
                                      </div>
                                    )}
                                    {cart.recovered_at && (
                                      <div>
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                          Recovered
                                        </p>
                                        <p className="mt-0.5 text-sm text-success">
                                          {formatDate(cart.recovered_at)} at {formatTime(cart.recovered_at)}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Total count */}
      {!loading && carts.length > 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground/50">
          Showing {carts.length} of {total} abandoned carts
        </p>
      )}
    </div>
  );
}
