"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import {
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Ticket,
  Download,
  ChevronRight,
  Hash,
  Calendar,
  User,
  CreditCard,
  Filter,
} from "lucide-react";

/* ── Types ── */
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

/* ── Stat card ── */
function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
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

/* ── Date formatting ── */
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number) {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // Stats
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [ticketsSold, setTicketsSold] = useState(0);

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterEvent) params.set("event_id", filterEvent);
    if (filterStatus) params.set("status", filterStatus);
    params.set("limit", "100");

    const res = await fetch(`/api/orders?${params}`);
    const json = await res.json();

    if (json.data) {
      setOrders(json.data);
      setTotalOrders(json.total || json.data.length);
    }
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
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const [{ data: allOrders }, { count: ticketCount }] = await Promise.all([
      supabase
        .from(TABLES.ORDERS)
        .select("total, status, created_at")
        .eq("org_id", ORG_ID),
      supabase
        .from(TABLES.TICKETS)
        .select("*", { count: "exact", head: true })
        .eq("org_id", ORG_ID),
    ]);

    if (allOrders) {
      const completed = allOrders.filter((o) => o.status === "completed");
      setTotalRevenue(completed.reduce((s, o) => s + Number(o.total), 0));

      const today = new Date().toISOString().slice(0, 10);
      setTodayOrders(
        allOrders.filter((o) => o.created_at.slice(0, 10) === today).length
      );
    }
    setTicketsSold(ticketCount || 0);
  }, []);

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
    loadStats();
  }, [loadEvents, loadStats]);

  useEffect(() => {
    setLoading(true);
    loadOrders();
  }, [loadOrders]);

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
        {orders.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting}
          >
            <Download size={14} />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Orders"
          value={totalOrders.toLocaleString()}
          icon={ShoppingBag}
        />
        <StatCard
          label="Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          accent
        />
        <StatCard
          label="Today"
          value={todayOrders.toLocaleString()}
          icon={TrendingUp}
        />
        <StatCard
          label="Tickets Sold"
          value={ticketsSold.toLocaleString()}
          icon={Ticket}
        />
      </div>

      {/* Filters */}
      <div className="mt-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <div className="mt-4">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading orders...</p>
              </div>
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ShoppingBag size={40} className="text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No orders found</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Try adjusting your filters
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {/* Table header */}
            <div className="hidden border-b border-border px-5 py-3 lg:grid lg:grid-cols-[1fr_1fr_1.5fr_2fr_1fr_1fr_0.8fr_auto]">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                <Hash size={10} /> Order
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                <Calendar size={10} /> Date
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Event
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                <User size={10} /> Customer
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Status
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                <CreditCard size={10} /> Total
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                <Ticket size={10} /> Qty
              </span>
              <span />
            </div>

            {/* Table rows */}
            <div className="divide-y divide-border">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}/`}
                  className="group block transition-colors duration-100 hover:bg-accent/30"
                >
                  {/* Desktop row */}
                  <div className="hidden items-center px-5 py-3.5 lg:grid lg:grid-cols-[1fr_1fr_1.5fr_2fr_1fr_1fr_0.8fr_auto]">
                    <span className="font-mono text-[13px] font-semibold text-primary">
                      {order.order_number}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDate(order.created_at)}
                    </span>
                    <span className="truncate text-sm text-foreground/80">
                      {order.event?.name || "—"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {order.customer
                          ? `${order.customer.first_name} ${order.customer.last_name}`
                          : "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.customer?.email || ""}
                      </p>
                    </div>
                    <div>
                      <Badge variant={STATUS_VARIANT[order.status] || "secondary"} className="text-[10px]">
                        {order.status}
                      </Badge>
                    </div>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {formatCurrency(Number(order.total))}
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">
                      {order.ticket_count || "—"}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground/20 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                    />
                  </div>

                  {/* Mobile row */}
                  <div className="flex items-center justify-between px-5 py-4 lg:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[13px] font-semibold text-primary">
                          {order.order_number}
                        </span>
                        <Badge variant={STATUS_VARIANT[order.status] || "secondary"} className="text-[10px]">
                          {order.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-foreground/80">
                        {order.customer
                          ? `${order.customer.first_name} ${order.customer.last_name}`
                          : "—"}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatDate(order.created_at)}</span>
                        <span className="text-border">|</span>
                        <span>{order.event?.name || "—"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatCurrency(Number(order.total))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {order.ticket_count || 0} ticket{(order.ticket_count || 0) !== 1 ? "s" : ""}
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
