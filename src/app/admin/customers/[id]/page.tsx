"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import type { Customer } from "@/types/orders";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  ShoppingBag,
  DollarSign,
  CalendarDays,
  Ticket as TicketIcon,
  ChevronRight,
  Package,
  Clock,
  TrendingUp,
  ScanLine,
  Shirt,
  Repeat,
  CreditCard,
  Send,
  AlertCircle,
  UserPlus,
} from "lucide-react";

/* ── Types ── */
interface CustomerOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  currency: string;
  payment_method: string;
  created_at: string;
  metadata?: Record<string, unknown>;
  event: { name: string; slug: string; date_start: string } | null;
  items?: { qty: number; merch_size?: string; unit_price: number }[];
}

interface CustomerTicket {
  id: string;
  ticket_code: string;
  status: string;
  merch_size?: string;
  merch_collected?: boolean;
  scanned_at?: string;
  scanned_by?: string;
  created_at: string;
  ticket_type: { name: string } | null;
  event: { name: string; slug: string; venue_name?: string; date_start: string } | null;
}

/* ── Status styling ── */
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  completed: "success",
  pending: "warning",
  refunded: "destructive",
  cancelled: "secondary",
  failed: "destructive",
};

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

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(first?: string, last?: string): string {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
}

function memberSince(dateStr?: string): string {
  if (!dateStr) return "—";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}+ years ago`;
}

/* ── Stat card (compact) ── */
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
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon size={13} strokeWidth={1.5} className="shrink-0" />
          {label}
        </p>
        <p className="mt-2 font-mono text-xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        {detail && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Timeline ── */
interface TimelineEntry {
  label: string;
  detail?: string;
  time: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  sortDate: Date;
}

function buildCustomerTimeline(
  customer: Customer,
  orders: CustomerOrder[],
  tickets: CustomerTicket[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const fmt = (d: string) => formatDateTime(d);

  // Customer created
  entries.push({
    label: "Customer created",
    detail: `${customer.first_name} ${customer.last_name} added to the platform`,
    time: fmt(customer.created_at),
    icon: UserPlus,
    sortDate: new Date(customer.created_at),
  });

  // Each order
  for (const order of orders) {
    entries.push({
      label: `Order ${order.order_number} placed`,
      detail: `${formatCurrency(Number(order.total))}${order.event?.name ? ` — ${order.event.name}` : ""}`,
      time: fmt(order.created_at),
      icon: ShoppingBag,
      sortDate: new Date(order.created_at),
    });

    // Payment processed
    if (order.status === "completed") {
      entries.push({
        label: `Payment confirmed`,
        detail: `${order.order_number} via ${order.payment_method}`,
        time: fmt(order.created_at),
        icon: CreditCard,
        sortDate: new Date(new Date(order.created_at).getTime() + 1000),
      });
    }

    // Email sent
    const meta = (order.metadata || {}) as Record<string, unknown>;
    if (meta.email_sent === true && typeof meta.email_sent_at === "string") {
      entries.push({
        label: "Confirmation email sent",
        detail: `for ${order.order_number}`,
        time: fmt(meta.email_sent_at as string),
        icon: Send,
        sortDate: new Date(meta.email_sent_at as string),
      });
    } else if (meta.email_sent === false && typeof meta.email_attempted_at === "string") {
      entries.push({
        label: "Email delivery failed",
        detail: (meta.email_error as string) || `for ${order.order_number}`,
        time: fmt(meta.email_attempted_at as string),
        icon: AlertCircle,
        sortDate: new Date(meta.email_attempted_at as string),
      });
    }

    // Refund
    if (order.status === "refunded") {
      entries.push({
        label: `Order ${order.order_number} refunded`,
        detail: formatCurrency(Number(order.total)),
        time: fmt(order.created_at),
        icon: DollarSign,
        sortDate: new Date(new Date(order.created_at).getTime() + 2000),
      });
    }
  }

  // Ticket scans
  for (const ticket of tickets) {
    if (ticket.scanned_at) {
      entries.push({
        label: "Ticket scanned at door",
        detail: `${ticket.ticket_code}${ticket.event?.name ? ` — ${ticket.event.name}` : ""}${ticket.scanned_by ? ` by ${ticket.scanned_by}` : ""}`,
        time: fmt(ticket.scanned_at),
        icon: ScanLine,
        sortDate: new Date(ticket.scanned_at),
      });
    }
  }

  entries.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
  return entries;
}

/* ════════════════════════════════════════════════════════
   CUSTOMER PROFILE PAGE
   ════════════════════════════════════════════════════════ */
export default function CustomerProfilePage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCustomer = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const [customerResult, ordersResult, ticketsResult] = await Promise.all([
      supabase
        .from(TABLES.CUSTOMERS)
        .select("*")
        .eq("id", customerId)
        .eq("org_id", ORG_ID)
        .single(),
      supabase
        .from(TABLES.ORDERS)
        .select("id, order_number, status, total, currency, payment_method, created_at, metadata, event:events(name, slug, date_start), items:order_items(qty, merch_size, unit_price)")
        .eq("customer_id", customerId)
        .eq("org_id", ORG_ID)
        .order("created_at", { ascending: false }),
      supabase
        .from(TABLES.TICKETS)
        .select("id, ticket_code, status, merch_size, merch_collected, scanned_at, scanned_by, created_at, ticket_type:ticket_types(name), event:events(name, slug, venue_name, date_start)")
        .eq("customer_id", customerId)
        .eq("org_id", ORG_ID)
        .order("created_at", { ascending: false }),
    ]);

    if (customerResult.data) setCustomer(customerResult.data);
    if (ordersResult.data) setOrders(ordersResult.data as unknown as CustomerOrder[]);
    if (ticketsResult.data) setTickets(ticketsResult.data as unknown as CustomerTicket[]);

    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading customer...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <User size={40} className="text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Customer not found</p>
        <Link href="/admin/customers/" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft size={14} /> Back to Customers
          </Button>
        </Link>
      </div>
    );
  }

  // Derived data
  const completedOrders = orders.filter((o) => o.status === "completed");
  const totalSpent = completedOrders.reduce((s, o) => s + Number(o.total), 0);
  const avgOrderValue = completedOrders.length > 0 ? totalSpent / completedOrders.length : 0;
  const scannedTickets = tickets.filter((t) => t.scanned_at);
  const eventsAttended = new Set(scannedTickets.map((t) => t.event?.name)).size;

  // Merch spend
  const merchSpend = completedOrders.reduce((total, order) => {
    const merchItems = (order.items || []).filter((i) => i.merch_size);
    return total + merchItems.reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
  }, 0);

  // Latest order
  const latestOrder = orders[0] || null;
  const latestOrderTicketQty = latestOrder
    ? (latestOrder.items || []).reduce((s, i) => s + i.qty, 0)
    : 0;

  // Timeline
  const timeline = buildCustomerTimeline(customer, orders, tickets);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/admin/customers/"
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={12} /> Back to Customers
      </Link>

      {/* Customer Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                <span className="font-mono text-lg font-bold text-muted-foreground">
                  {getInitials(customer.first_name, customer.last_name)}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-mono text-xl font-bold tracking-wider text-foreground">
                    {customer.first_name} {customer.last_name}
                  </h1>
                  {customer.total_orders > 2 && (
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      <Repeat size={10} /> Loyal
                    </Badge>
                  )}
                  {totalSpent >= 200 && (
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      VIP
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail size={13} className="text-muted-foreground/50" />
                    {customer.email}
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone size={13} className="text-muted-foreground/50" />
                      {customer.phone}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays size={13} className="text-muted-foreground/50" />
                    Member since {memberSince(customer.first_order_at)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Orders"
          value={customer.total_orders.toString()}
          icon={ShoppingBag}
        />
        <StatCard
          label="Lifetime Value"
          value={formatCurrency(totalSpent)}
          icon={DollarSign}
        />
        <StatCard
          label="Avg Order"
          value={formatCurrency(avgOrderValue)}
          icon={TrendingUp}
        />
        <StatCard
          label="Tickets"
          value={tickets.length.toString()}
          icon={TicketIcon}
          detail={`${scannedTickets.length} scanned`}
        />
        <StatCard
          label="Events Attended"
          value={eventsAttended.toString()}
          icon={CalendarDays}
        />
        <StatCard
          label="Merch Spend"
          value={formatCurrency(merchSpend)}
          icon={Shirt}
        />
      </div>

      {/* Latest Order */}
      <div className="mt-6">
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package size={15} className="text-muted-foreground" />
                Latest Order
              </CardTitle>
              {orders.length > 1 && (
                <Link href={`/admin/orders/?customer_id=${customerId}&customer_name=${encodeURIComponent(`${customer.first_name} ${customer.last_name}`)}`}>
                  <Button variant="outline" size="sm">
                    View All Orders ({orders.length})
                    <ChevronRight size={14} />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {latestOrder ? (
              <div>
                {/* Order header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/orders/${latestOrder.id}/`}
                      className="font-mono text-[13px] font-semibold text-foreground hover:underline"
                    >
                      {latestOrder.order_number}
                    </Link>
                    <Badge
                      variant={STATUS_VARIANT[latestOrder.status] || "secondary"}
                      className="text-[10px]"
                    >
                      {latestOrder.status}
                    </Badge>
                  </div>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {formatCurrency(Number(latestOrder.total))}
                  </span>
                </div>

                {/* Order details grid */}
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date</p>
                    <p className="mt-1 text-sm text-foreground">{formatDate(latestOrder.created_at)}</p>
                  </div>
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Event</p>
                    <p className="mt-1 text-sm text-foreground">{latestOrder.event?.name || "—"}</p>
                  </div>
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tickets</p>
                    <p className="mt-1 text-sm text-foreground">{latestOrderTicketQty} ticket{latestOrderTicketQty !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="bg-card px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Payment</p>
                    <p className="mt-1 text-sm text-foreground">{latestOrder.payment_method}</p>
                  </div>
                </div>

                {/* Order items breakdown */}
                {latestOrder.items && latestOrder.items.length > 0 && (
                  <div className="border-t border-border">
                    {latestOrder.items.map((item, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-5 py-3 ${
                          i < latestOrder.items!.length - 1 ? "border-b border-border/50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.merch_size ? (
                            <Shirt size={14} className="text-muted-foreground/50" />
                          ) : (
                            <TicketIcon size={14} className="text-muted-foreground/50" />
                          )}
                          <div>
                            <span className="text-sm text-foreground">
                              {item.qty}x @ {formatCurrency(Number(item.unit_price))}
                            </span>
                            {item.merch_size && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Size {item.merch_size}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-sm text-foreground">
                          {formatCurrency(Number(item.unit_price) * item.qty)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* View full order link */}
                <Link
                  href={`/admin/orders/${latestOrder.id}/`}
                  className="group flex items-center justify-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                >
                  View Full Order Details
                  <ChevronRight
                    size={12}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10">
                <Package size={24} className="text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">No orders yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {customer.notes && (
        <Card className="mt-4">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-muted-foreground" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <p className="whitespace-pre-wrap text-sm text-foreground/80">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-muted-foreground" />
              Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="relative pl-6">
              {/* Vertical line */}
              <div className="absolute bottom-0 left-[11px] top-0 w-px bg-border" />

              {timeline.map((entry, i) => {
                const Icon = entry.icon;
                return (
                  <div
                    key={i}
                    className={`relative flex items-start gap-4 ${
                      i < timeline.length - 1 ? "pb-6" : ""
                    }`}
                  >
                    <div className="absolute -left-6 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-background ring-2 ring-border text-muted-foreground">
                      <Icon size={11} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{entry.label}</p>
                      {entry.detail && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                      )}
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                        {entry.time}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
