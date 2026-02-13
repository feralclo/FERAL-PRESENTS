"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  ShoppingBag,
  DollarSign,
  Ticket,
  Shirt,
  Download,
  Filter,
  Package,
} from "lucide-react";

/* ── Types ── */
type Period = "today" | "7d" | "30d";

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total: number;
  currency: string;
  payment_method: string;
  created_at: string;
  customer: { first_name: string; last_name: string; email: string } | null;
  event: { name: string; slug: string } | null;
  ticket_count: number;
}

type StatusFilter = "" | "completed" | "pending" | "refunded" | "cancelled";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  completed: "success",
  pending: "warning",
  refunded: "destructive",
  cancelled: "secondary",
  failed: "destructive",
};

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
  { key: "refunded", label: "Refunded" },
  { key: "cancelled", label: "Cancelled" },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
];

/* ── Period selector ── */
function PeriodSelector({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-all duration-150 ${
            period === p.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ── Stat card ── */
function StatCard({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <Icon size={14} strokeWidth={1.5} className="text-muted-foreground/50" />
        </div>
        <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        {detail && (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Helpers ── */
function getDateStart(period: Period): string {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
}

function formatCurrency(amount: number) {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ════════════════════════════════════════════════════════
   ORDERS PAGE
   ════════════════════════════════════════════════════════ */
export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [filterEvent, setFilterEvent] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("");
  const [period, setPeriod] = useState<Period>("today");
  const [statsLoading, setStatsLoading] = useState(true);

  // Period-filtered stats
  const [orderCount, setOrderCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [ticketsSold, setTicketsSold] = useState(0);
  const [merchRevenue, setMerchRevenue] = useState(0);
  const [merchItems, setMerchItems] = useState(0);

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterEvent) params.set("event_id", filterEvent);
    if (filterStatus) params.set("status", filterStatus);
    params.set("limit", "100");

    const res = await fetch(`/api/orders?${params}`);
    const json = await res.json();

    if (json.data) setOrders(json.data);
    setLoading(false);
  }, [filterEvent, filterStatus]);

  const loadEvents = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name")
      .eq("org_id", ORG_ID)
      .order("date_start", { ascending: false });

    setEvents(data || []);
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const dateStart = getDateStart(period);

    const { data: completedOrders } = await supabase
      .from(TABLES.ORDERS)
      .select("id, total")
      .eq("org_id", ORG_ID)
      .eq("status", "completed")
      .gte("created_at", dateStart);

    const ords = completedOrders || [];
    setOrderCount(ords.length);
    setRevenue(ords.reduce((s, o) => s + Number(o.total), 0));

    const { count: ticketCount } = await supabase
      .from(TABLES.TICKETS)
      .select("*", { count: "exact", head: true })
      .eq("org_id", ORG_ID)
      .gte("created_at", dateStart);

    setTicketsSold(ticketCount || 0);

    const orderIds = ords.map((o) => o.id);
    if (orderIds.length > 0) {
      const { data: merch } = await supabase
        .from(TABLES.ORDER_ITEMS)
        .select("unit_price, qty")
        .eq("org_id", ORG_ID)
        .in("order_id", orderIds)
        .not("merch_size", "is", null);

      const items = merch || [];
      setMerchRevenue(items.reduce((s, i) => s + Number(i.unit_price) * i.qty, 0));
      setMerchItems(items.reduce((s, i) => s + i.qty, 0));
    } else {
      setMerchRevenue(0);
      setMerchItems(0);
    }

    setStatsLoading(false);
  }, [period]);

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filterEvent) params.set("event_id", filterEvent);
      if (filterStatus) params.set("status", filterStatus);

      const res = await fetch(`/api/orders/export?${params}`);
      if (!res.ok) {
        alert("Export failed. No orders found for the current filters.");
        setExporting(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }, [filterEvent, filterStatus]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setLoading(true);
    loadOrders();
  }, [loadOrders]);

  const v = (n: string) => (statsLoading ? "..." : n);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
            Orders
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track all orders
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector period={period} onChange={setPeriod} />
          {orders.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={exporting}
            >
              <Download size={14} />
              {exporting ? "Exporting..." : "CSV"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Orders"
          value={v(orderCount.toLocaleString())}
          icon={ShoppingBag}
        />
        <StatCard
          label="Revenue"
          value={v(formatCurrency(revenue))}
          icon={DollarSign}
        />
        <StatCard
          label="Tickets Sold"
          value={v(ticketsSold.toLocaleString())}
          icon={Ticket}
        />
        <StatCard
          label="Merch Revenue"
          value={v(formatCurrency(merchRevenue))}
          icon={Shirt}
          detail={statsLoading ? undefined : `${merchItems} item${merchItems !== 1 ? "s" : ""}`}
        />
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-secondary p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`shrink-0 rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-all duration-150 ${
                filterStatus === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Event filter */}
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-muted-foreground" />
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[color,box-shadow] focus:border-ring focus:ring-2 focus:ring-ring/50"
          >
            <option value="">All Events</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="mt-4">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading orders...</p>
              </div>
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Package size={28} className="text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No orders found</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Tickets</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/admin/orders/${order.id}/`}
                        className="font-mono text-[13px] font-semibold text-foreground hover:underline"
                      >
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(order.created_at)}
                    </TableCell>
                    <TableCell>
                      {order.customer ? (
                        <div>
                          <p className="text-sm text-foreground">
                            {order.customer.first_name} {order.customer.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground/60">
                            {order.customer.email}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {order.event?.name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[order.status] || "secondary"}
                        className="text-[10px] font-semibold uppercase"
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">
                      {order.ticket_count || 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.payment_method}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-foreground">
                      {formatCurrency(Number(order.total))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
