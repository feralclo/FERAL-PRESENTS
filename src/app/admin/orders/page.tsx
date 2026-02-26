"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  ShoppingBag, DollarSign, Ticket, Shirt, Download, Package, ArrowLeft, Tag, Search, X, ChevronDown,
} from "lucide-react";

/* ── Types ── */
type Period = "today" | "7d" | "30d";
type OrderTypeFilter = "" | "tickets" | "merch_preorder";

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
  metadata?: Record<string, unknown>;
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

const ORDER_TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: "", label: "All Types" },
  { key: "tickets", label: "Tickets" },
  { key: "merch_preorder", label: "Merch" },
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

/* ── Searchable event combobox ── */
function EventSearch({
  events,
  value,
  onChange,
}: {
  events: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedName = value === "__all__" ? "" : events.find((e) => e.id === value)?.name || "";
  const filtered = search
    ? events.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : events;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex h-9 items-center gap-2 rounded-md border bg-background px-3 transition-colors ${
          open ? "border-primary/50 ring-1 ring-primary/20" : "border-border hover:border-muted-foreground/30"
        }`}
        style={{ width: "220px" }}
      >
        <Search size={13} className="shrink-0 text-muted-foreground/50" />
        <input
          ref={inputRef}
          type="text"
          value={open ? search : selectedName}
          placeholder="All events"
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setSearch("");
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
        />
        {value !== "__all__" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange("__all__");
              setSearch("");
              setOpen(false);
            }}
            className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <X size={13} />
          </button>
        ) : (
          <ChevronDown size={13} className={`shrink-0 text-muted-foreground/30 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[220px] overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <div className="max-h-[240px] overflow-y-auto py-1">
            <button
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                value === "__all__" ? "bg-muted/30 text-foreground font-medium" : "text-muted-foreground"
              }`}
              onClick={() => { onChange("__all__"); setSearch(""); setOpen(false); }}
            >
              All events
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground/50">No events match</div>
            ) : (
              filtered.map((evt) => (
                <button
                  key={evt.id}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                    value === evt.id ? "bg-muted/30 text-foreground font-medium" : "text-foreground/80"
                  }`}
                  onClick={() => { onChange(evt.id); setSearch(""); setOpen(false); }}
                >
                  <span className="truncate">{evt.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
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
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const customerIdParam = searchParams.get("customer_id");
  const customerNameParam = searchParams.get("customer_name");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [filterEvent, setFilterEvent] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("");
  const [filterOrderType, setFilterOrderType] = useState<OrderTypeFilter>("");
  const [period, setPeriod] = useState<Period>("today");
  const [statsLoading, setStatsLoading] = useState(true);

  // Period-filtered stats
  const [orderCount, setOrderCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [ticketsSold, setTicketsSold] = useState(0);
  const [merchRevenue, setMerchRevenue] = useState(0);
  const [merchItems, setMerchItems] = useState(0);

  const activeEventFilter = filterEvent === "__all__" ? "" : filterEvent;

  const loadOrders = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (activeEventFilter) params.set("event_id", activeEventFilter);
    if (filterStatus) params.set("status", filterStatus);
    if (filterOrderType) params.set("order_type", filterOrderType);
    if (customerIdParam) params.set("customer_id", customerIdParam);
    params.set("limit", "100");

    try {
      const res = await fetch(`/api/orders?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(`API error (${res.status}): ${json.error || "Unknown error"}`);
        setLoading(false);
        return;
      }

      if (json.data) setOrders(json.data);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : "Failed to fetch orders"}`);
    }
    setLoading(false);
  }, [activeEventFilter, filterStatus, filterOrderType, customerIdParam]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      const json = await res.json();
      if (json.data) {
        setEvents(json.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
      }
    } catch {
      // Fail silently
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const dateStart = getDateStart(period);
      const res = await fetch(`/api/admin/orders-stats?from=${encodeURIComponent(dateStart)}`);
      const json = await res.json();

      setOrderCount(json.orderCount || 0);
      setRevenue(json.revenue || 0);
      setTicketsSold(json.ticketsSold || 0);
      setMerchRevenue(json.merchRevenue || 0);
      setMerchItems(json.merchItems || 0);
    } catch {
      // Fail silently
    }
    setStatsLoading(false);
  }, [period]);

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (activeEventFilter) params.set("event_id", activeEventFilter);
      if (filterStatus) params.set("status", filterStatus);
      if (filterOrderType) params.set("order_type", filterOrderType);

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
      const suffix = filterOrderType === "merch_preorder" ? "merch" : "orders";
      a.download = `${suffix}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }, [activeEventFilter, filterStatus, filterOrderType]);

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
          {customerNameParam ? (
            <>
              <Link
                href="/admin/customers/"
                className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft size={12} /> Back to Customers
              </Link>
              <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
                {customerNameParam}&apos;s Orders
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Viewing all orders for this customer
              </p>
            </>
          ) : (
            <>
              <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
                Orders
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage and track all orders
              </p>
            </>
          )}
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
        {/* Status + Order type tabs */}
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-secondary p-1">
            {ORDER_TYPE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterOrderType(tab.key)}
                className={`shrink-0 rounded-md px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-all duration-150 ${
                  filterOrderType === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Event search */}
        <EventSearch events={events} value={filterEvent} onChange={setFilterEvent} />
      </div>

      {/* Orders Table */}
      <div className="mt-4">
        {error ? (
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-lg bg-destructive/10 p-3">
                <Package size={24} className="text-destructive" />
              </div>
              <p className="mt-3 text-sm font-medium text-destructive">Failed to load orders</p>
              <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">{error}</p>
              <button
                onClick={() => { setLoading(true); loadOrders(); }}
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
          <Card className="overflow-hidden py-0 gap-0">
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
                        className="font-mono text-[13px] font-semibold text-foreground transition-colors hover:text-primary"
                      >
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {formatDate(order.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {order.customer
                        ? `${order.customer.first_name} ${order.customer.last_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
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
                    <TableCell className="text-center font-mono text-sm tabular-nums text-foreground">
                      {order.metadata?.order_type === "merch_preorder" ? (
                        <Badge variant="secondary" className="gap-1 text-[9px]">
                          <Shirt size={9} />
                          Merch
                        </Badge>
                      ) : (
                        order.ticket_count || 0
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {order.payment_method}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {typeof order.metadata?.discount_code === "string" && (
                          <Badge variant="secondary" className="gap-1 text-[9px] font-mono">
                            <Tag size={9} />
                            {order.metadata.discount_code}
                          </Badge>
                        )}
                        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(Number(order.total))}
                        </span>
                      </div>
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
