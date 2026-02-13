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
  CheckCircle2,
  Shirt,
  Repeat,
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
  event: { name: string; slug: string; date_start: string } | null;
  items?: { qty: number; merch_size?: string }[];
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
  valid: "success",
  used: "secondary",
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

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function memberSince(dateStr?: string): string {
  if (!dateStr) return "—";
  const days = daysSince(dateStr);
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

    // Fetch customer, orders, and tickets in parallel
    const [customerResult, ordersResult, ticketsResult] = await Promise.all([
      supabase
        .from(TABLES.CUSTOMERS)
        .select("*")
        .eq("id", customerId)
        .eq("org_id", ORG_ID)
        .single(),
      supabase
        .from(TABLES.ORDERS)
        .select("id, order_number, status, total, currency, payment_method, created_at, event:events(name, slug, date_start), items:order_items(qty, merch_size)")
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
  const merchTickets = tickets.filter((t) => t.merch_size);

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
      <Card className="mb-6 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {/* Large avatar */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
                <span className="font-mono text-xl font-bold text-primary">
                  {getInitials(customer.first_name, customer.last_name)}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-mono text-xl font-bold tracking-wider text-foreground">
                    {customer.first_name} {customer.last_name}
                  </h1>
                  {customer.total_orders > 2 && (
                    <Badge variant="success" className="text-[10px] font-semibold">
                      <Repeat size={10} /> Loyal
                    </Badge>
                  )}
                  {totalSpent >= 200 && (
                    <Badge variant="default" className="text-[10px] font-semibold">
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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
          label="Events"
          value={eventsAttended.toString()}
          icon={CalendarDays}
          detail="Attended"
        />
      </div>

      {/* Orders + Tickets in 2 columns on large screens */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Order History */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package size={15} className="text-muted-foreground" />
              Order History ({orders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Package size={28} className="text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">No orders yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {orders.map((order) => {
                  const ticketQty = (order.items || []).reduce((s, i) => s + i.qty, 0);
                  return (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}/`}
                      className="group flex items-center justify-between px-5 py-3.5 transition-colors duration-100 hover:bg-accent/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-[13px] font-semibold text-foreground">
                            {order.order_number}
                          </span>
                          <Badge
                            variant={STATUS_VARIANT[order.status] || "secondary"}
                            className="text-[10px]"
                          >
                            {order.status}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatDate(order.created_at)}</span>
                          {order.event?.name && (
                            <>
                              <span className="text-border">·</span>
                              <span className="truncate">{order.event.name}</span>
                            </>
                          )}
                          <span className="text-border">·</span>
                          <span>{ticketQty} ticket{ticketQty !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatCurrency(Number(order.total))}
                        </span>
                        <ChevronRight
                          size={14}
                          className="text-muted-foreground/20 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tickets */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ScanLine size={15} className="text-muted-foreground" />
              Tickets ({tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <TicketIcon size={28} className="text-muted-foreground/20" />
                <p className="mt-2 text-xs text-muted-foreground">No tickets yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="px-5 py-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <TicketIcon size={13} className="text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] font-bold text-foreground">
                              {ticket.ticket_code}
                            </span>
                            <Badge
                              variant={STATUS_VARIANT[ticket.status] || "secondary"}
                              className="text-[9px]"
                            >
                              {ticket.status}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {ticket.ticket_type?.name || "Ticket"}
                            {ticket.event?.name ? ` · ${ticket.event.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {ticket.scanned_at ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-success" />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Scanned
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-muted-foreground/40">
                            Not scanned
                          </span>
                        )}
                        {ticket.merch_size && (
                          <div className="flex items-center gap-1">
                            <Shirt size={10} className="text-muted-foreground" />
                            <span className="font-mono text-[10px]">{ticket.merch_size}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Merch Summary (only if they have merch) */}
      {merchTickets.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shirt size={15} className="text-muted-foreground" />
              Merchandise ({merchTickets.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {merchTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {ticket.ticket_code}
                    </span>
                    <span className="text-sm text-foreground">
                      {ticket.ticket_type?.name || "Merch"}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {ticket.merch_size}
                    </Badge>
                  </div>
                  <Badge
                    variant={ticket.merch_collected ? "success" : "warning"}
                    className="text-[10px]"
                  >
                    {ticket.merch_collected ? "Collected" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{customer.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
