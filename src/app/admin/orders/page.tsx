"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  ShoppingBag, DollarSign, Ticket, Shirt, Download, Package, ArrowLeft, Tag, Search, X,
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
  customer: { id: string; first_name: string; last_name: string; email: string } | null;
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

/* ── Unified search bar ── */
interface SuggestionItem {
  type: "order" | "customer" | "event";
  id: string;
  label: string;
  detail?: string;
  secondary?: string;
}

function OrdersSearch({
  orders,
  events,
  onSelectEvent,
  onSelectCustomer,
  onSelectOrder,
  onTextSearch,
  searchQuery,
}: {
  orders: OrderRow[];
  events: { id: string; name: string }[];
  onSelectEvent: (id: string) => void;
  onSelectCustomer: (id: string, name: string) => void;
  onSelectOrder: (id: string) => void;
  onTextSearch: (query: string) => void;
  searchQuery: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!inputValue.trim()) {
      setDebouncedQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  // Build suggestions from existing data
  const suggestions = (() => {
    if (!debouncedQuery) return [];
    const q = debouncedQuery.toLowerCase();
    const results: SuggestionItem[] = [];

    // Orders — match by order_number
    const matchedOrders = orders
      .filter((o) => o.order_number.toLowerCase().includes(q))
      .slice(0, 3);
    for (const o of matchedOrders) {
      const custName = o.customer
        ? `${o.customer.first_name} ${o.customer.last_name}`
        : "Unknown";
      results.push({
        type: "order",
        id: o.id,
        label: o.order_number,
        detail: custName,
        secondary: formatCurrency(Number(o.total)),
      });
    }

    // Customers — deduplicate by email, match name or email
    const seenEmails = new Set<string>();
    const matchedCustomers: { id: string; name: string; email: string }[] = [];
    for (const o of orders) {
      if (!o.customer) continue;
      const cust = o.customer;
      const email = cust.email.toLowerCase();
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      const fullName = `${cust.first_name} ${cust.last_name}`.toLowerCase();
      if (fullName.includes(q) || email.includes(q)) {
        matchedCustomers.push({
          id: cust.id,
          name: `${cust.first_name} ${cust.last_name}`,
          email: cust.email,
        });
      }
      if (matchedCustomers.length >= 4) break;
    }
    for (const c of matchedCustomers) {
      results.push({
        type: "customer",
        id: c.id,
        label: c.name,
        detail: c.email,
      });
    }

    // Events — match by name
    const matchedEvents = events
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 3);
    for (const e of matchedEvents) {
      results.push({
        type: "event",
        id: e.id,
        label: e.name,
      });
    }

    return results;
  })();

  const flatSuggestions = suggestions;

  // Close on click outside
  useEffect(() => {
    if (!showSuggestions) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSuggestions]);

  const selectSuggestion = useCallback((item: SuggestionItem) => {
    setShowSuggestions(false);
    setInputValue("");
    setDebouncedQuery("");
    setHighlightIndex(-1);
    if (item.type === "event") {
      onSelectEvent(item.id);
    } else if (item.type === "customer") {
      onSelectCustomer(item.id, item.label);
    } else if (item.type === "order") {
      onSelectOrder(item.id);
    }
  }, [onSelectEvent, onSelectCustomer, onSelectOrder]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSuggestions(false);
        setHighlightIndex(-1);
        inputRef.current?.blur();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < flatSuggestions.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : flatSuggestions.length - 1
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < flatSuggestions.length) {
          selectSuggestion(flatSuggestions[highlightIndex]);
        } else if (inputValue.trim()) {
          // Text search — filter client-side
          onTextSearch(inputValue.trim());
          setShowSuggestions(false);
        }
        return;
      }
    },
    [flatSuggestions, highlightIndex, inputValue, onTextSearch, selectSuggestion]
  );

  const handleClear = useCallback(() => {
    setInputValue("");
    setDebouncedQuery("");
    setShowSuggestions(false);
    setHighlightIndex(-1);
    onTextSearch("");
    onSelectEvent("__all__");
    inputRef.current?.focus();
  }, [onTextSearch, onSelectEvent]);

  // Group suggestions by type for rendering
  const groupedSections: { type: string; label: string; items: SuggestionItem[] }[] = [];
  const orderItems = flatSuggestions.filter((s) => s.type === "order");
  const customerItems = flatSuggestions.filter((s) => s.type === "customer");
  const eventItems = flatSuggestions.filter((s) => s.type === "event");
  if (orderItems.length > 0) groupedSections.push({ type: "order", label: "Orders", items: orderItems });
  if (customerItems.length > 0) groupedSections.push({ type: "customer", label: "Customers", items: customerItems });
  if (eventItems.length > 0) groupedSections.push({ type: "event", label: "Events", items: eventItems });

  const hasActiveFilter = searchQuery || inputValue;

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex h-10 items-center gap-2.5 rounded-lg border bg-background px-3.5 transition-all duration-150 ${
          showSuggestions
            ? "border-primary/50 ring-1 ring-primary/20"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <Search size={15} className="shrink-0 text-muted-foreground/40" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder="Search orders, customers, events..."
          onChange={(e) => {
            setInputValue(e.target.value);
            setHighlightIndex(-1);
            if (e.target.value.trim()) {
              setShowSuggestions(true);
            } else {
              setShowSuggestions(false);
            }
          }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
        />
        {hasActiveFilter && (
          <button
            onClick={handleClear}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground/40 transition-all duration-150 hover:bg-muted/50 hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && debouncedQuery && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-background shadow-xl shadow-black/10">
          {flatSuggestions.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground/50">
              No results for &lsquo;{debouncedQuery}&rsquo;
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto py-1">
              {groupedSections.map((section) => (
                <div key={section.type}>
                  <div className="px-3 pb-1 pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    {section.label}
                  </div>
                  {section.items.map((item) => {
                    const globalIdx = flatSuggestions.indexOf(item);
                    const isHighlighted = globalIdx === highlightIndex;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-all duration-150 ${
                          isHighlighted
                            ? "bg-muted/60 text-foreground"
                            : "text-foreground/80 hover:bg-muted/40"
                        }`}
                        onMouseEnter={() => setHighlightIndex(globalIdx)}
                        onClick={() => selectSuggestion(item)}
                      >
                        <div className="min-w-0 flex-1">
                          <span className={`text-sm ${item.type === "order" ? "font-mono text-[13px] font-semibold" : "font-medium"}`}>
                            {item.label}
                          </span>
                          {item.detail && (
                            <span className="ml-2 text-xs text-muted-foreground/60">
                              {item.detail}
                            </span>
                          )}
                        </div>
                        {item.secondary && (
                          <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted-foreground">
                            {item.secondary}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="border-t border-border/50 px-3 py-2">
                <button
                  className="w-full text-left text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                  onClick={() => {
                    onTextSearch(inputValue.trim());
                    setShowSuggestions(false);
                  }}
                >
                  Press <kbd className="mx-0.5 rounded border border-border/60 bg-muted/40 px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to search all orders for &lsquo;{debouncedQuery}&rsquo;
                </button>
              </div>
            </div>
          )}
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
  const router = useRouter();
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
  const [searchQuery, setSearchQuery] = useState("");

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

  // Client-side text search filtering
  const filteredOrders = searchQuery
    ? orders.filter((o) => {
        const q = searchQuery.toLowerCase();
        if (o.order_number.toLowerCase().includes(q)) return true;
        if (o.customer) {
          const fullName = `${o.customer.first_name} ${o.customer.last_name}`.toLowerCase();
          if (fullName.includes(q)) return true;
          if (o.customer.email.toLowerCase().includes(q)) return true;
        }
        if (o.event?.name.toLowerCase().includes(q)) return true;
        return false;
      })
    : orders;

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

      {/* Search Bar */}
      <div className="mt-6">
        <OrdersSearch
          orders={orders}
          events={events}
          onSelectEvent={(id) => {
            setFilterEvent(id);
            setSearchQuery("");
          }}
          onSelectCustomer={(id, name) => {
            router.push(`/admin/orders?customer_id=${id}&customer_name=${encodeURIComponent(name)}`);
          }}
          onSelectOrder={(id) => {
            router.push(`/admin/orders/${id}/`);
          }}
          onTextSearch={setSearchQuery}
          searchQuery={searchQuery}
        />
      </div>

      {/* Active search / event filter badges */}
      {(searchQuery || filterEvent !== "__all__") && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {searchQuery && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground/80">
              <Search size={11} className="text-muted-foreground/50" />
              <span className="font-medium">&ldquo;{searchQuery}&rdquo;</span>
              <button
                onClick={() => setSearchQuery("")}
                className="ml-0.5 rounded-sm text-muted-foreground/50 transition-colors hover:text-foreground"
              >
                <X size={11} />
              </button>
            </span>
          )}
          {filterEvent !== "__all__" && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground/80">
              <span className="text-muted-foreground/50">Event:</span>
              <span className="font-medium">{events.find((e) => e.id === filterEvent)?.name || "Unknown"}</span>
              <button
                onClick={() => setFilterEvent("__all__")}
                className="ml-0.5 rounded-sm text-muted-foreground/50 transition-colors hover:text-foreground"
              >
                <X size={11} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
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
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Package size={28} className="text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {searchQuery ? `No orders matching "${searchQuery}"` : "No orders found"}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-xs text-primary transition-colors hover:text-primary/80"
                >
                  Clear search
                </button>
              )}
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
                {filteredOrders.map((order) => (
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
