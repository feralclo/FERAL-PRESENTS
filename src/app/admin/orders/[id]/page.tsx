"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Order } from "@/types/orders";
import {
  ArrowLeft,
  Download,
  RotateCcw,
  Package,
  User,
  CreditCard,
  Phone,
  ShoppingBag,
  DollarSign,
  Ticket,
  Shirt,
  ScanLine,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  ExternalLink,
} from "lucide-react";

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

/* ── Timeline ── */
interface TimelineEntry {
  label: string;
  detail?: string;
  time: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  sortDate: Date;
}

function buildTimeline(order: Order): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const fmt = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  entries.push({
    label: "Order placed",
    detail: `${order.order_number} — £${Number(order.total).toFixed(2)}`,
    time: fmt(order.created_at),
    icon: ShoppingBag,
    color: "text-success",
    sortDate: new Date(order.created_at),
  });

  if (order.payment_ref && order.status !== "failed") {
    entries.push({
      label: "Payment processed",
      detail: `via ${order.payment_method}${order.payment_ref ? ` (${order.payment_ref.slice(0, 20)}...)` : ""}`,
      time: fmt(order.created_at),
      icon: CreditCard,
      color: "text-success",
      sortDate: new Date(new Date(order.created_at).getTime() + 1000),
    });
  }

  const meta = (order.metadata || {}) as Record<string, unknown>;
  if (meta.email_sent === true && typeof meta.email_sent_at === "string") {
    entries.push({
      label: "Confirmation email sent",
      detail: `to ${meta.email_to || order.customer?.email || "customer"}`,
      time: fmt(meta.email_sent_at as string),
      icon: Send,
      color: "text-success",
      sortDate: new Date(meta.email_sent_at as string),
    });
  } else if (meta.email_sent === false && typeof meta.email_attempted_at === "string") {
    entries.push({
      label: "Email delivery failed",
      detail: (meta.email_error as string) || "Unknown error",
      time: fmt(meta.email_attempted_at as string),
      icon: AlertCircle,
      color: "text-destructive",
      sortDate: new Date(meta.email_attempted_at as string),
    });
  }

  if (order.tickets) {
    for (const ticket of order.tickets) {
      if (ticket.scanned_at) {
        entries.push({
          label: `Ticket scanned`,
          detail: `${ticket.ticket_code}${ticket.scanned_by ? ` by ${ticket.scanned_by}` : ""}`,
          time: fmt(ticket.scanned_at),
          icon: ScanLine,
          color: "text-muted-foreground",
          sortDate: new Date(ticket.scanned_at),
        });
      }
    }
  }

  if (order.status === "refunded" && order.refunded_at) {
    entries.push({
      label: "Order refunded",
      detail: order.refund_reason || undefined,
      time: fmt(order.refunded_at),
      icon: RotateCcw,
      color: "text-destructive",
      sortDate: new Date(order.refunded_at),
    });
  }

  entries.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
  return entries;
}

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

/* ════════════════════════════════════════════════════════
   ORDER DETAIL PAGE
   ════════════════════════════════════════════════════════ */
export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  const loadOrder = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}`);
    const json = await res.json();
    if (json.data) setOrder(json.data);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleRefund = async () => {
    if (!confirm("Are you sure you want to refund this order? All tickets will be cancelled."))
      return;

    setRefunding(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: refundReason }),
      });

      if (res.ok) {
        setShowRefund(false);
        setRefundReason("");
        loadOrder();
      } else {
        const json = await res.json();
        alert(json.error || "Failed to process refund");
      }
    } catch {
      alert("Network error");
    }
    setRefunding(false);
  };

  const handleDownloadPDF = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order?.order_number || "tickets"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download PDF");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Package size={40} className="text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Order not found</p>
        <Link href="/admin/orders/" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft size={14} /> Back to Orders
          </Button>
        </Link>
      </div>
    );
  }

  const customer = order.customer;
  const event = order.event;
  const timeline = buildTimeline(order);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/orders/"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={12} /> Back to Orders
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-xl font-bold tracking-wider text-foreground">
                  {order.order_number}
                </h1>
                <Badge
                  variant={STATUS_VARIANT[order.status] || "secondary"}
                  className="text-[10px] font-semibold uppercase"
                >
                  {order.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateTime(order.created_at)}
                {event?.name ? ` · ${event.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download size={14} /> PDF
            </Button>
            {order.status === "completed" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowRefund(!showRefund)}
              >
                <RotateCcw size={14} /> Refund
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Refund Form */}
      {showRefund && (
        <Card className="mb-6 border-destructive/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={16} className="text-destructive" />
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-destructive">
                Process Refund
              </h3>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason (optional)..."
                className="flex-1"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRefund}
                  disabled={refunding}
                >
                  {refunding ? "Processing..." : "Confirm Refund"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRefund(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Summary + Customer - 2 column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Order Summary */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package size={15} className="text-primary" />
              Order Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="font-mono text-sm text-foreground">
                  {formatCurrency(Number(order.subtotal))}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-muted-foreground">Fees</span>
                <span className="font-mono text-sm text-foreground">
                  {formatCurrency(Number(order.fees))}
                </span>
              </div>
              <div className="flex items-center justify-between bg-accent/20 px-5 py-3">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="font-mono text-lg font-bold text-primary">
                  {formatCurrency(Number(order.total))}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-muted-foreground">Payment</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {order.payment_method}
                  {order.payment_ref && (
                    <span className="ml-1.5 text-muted-foreground/50">
                      {order.payment_ref.slice(0, 24)}...
                    </span>
                  )}
                </span>
              </div>
              {order.refund_reason && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-muted-foreground">Refund Reason</span>
                  <span className="text-sm text-destructive">{order.refund_reason}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customer */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <User size={15} className="text-primary" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {customer ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  {/* Avatar */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                    <span className="font-mono text-sm font-bold text-primary">
                      {(customer.first_name?.[0] || "").toUpperCase()}
                      {(customer.last_name?.[0] || "").toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{customer.email}</p>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  {customer.phone && (
                    <div className="flex items-center gap-2.5">
                      <Phone size={13} className="text-muted-foreground/50" />
                      <span className="text-sm text-foreground/80">{customer.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <ShoppingBag size={13} className="text-muted-foreground/50" />
                    <span className="text-sm text-foreground/80">
                      {customer.total_orders || 0} order{(customer.total_orders || 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <DollarSign size={13} className="text-muted-foreground/50" />
                    <span className="text-sm text-foreground/80">
                      {formatCurrency(Number(customer.total_spent || 0))} lifetime
                    </span>
                  </div>
                </div>

                <Link
                  href={`/admin/customers/${customer.id}/`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  View Profile <ExternalLink size={11} />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No customer data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      {order.items && order.items.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ticket size={15} className="text-primary" />
              Items ({order.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Header */}
            <div className="hidden border-b border-border px-5 py-2.5 sm:grid sm:grid-cols-[2fr_0.5fr_1fr_0.8fr_1fr]">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Ticket Type
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Qty
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Price
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Size
              </span>
              <span className="text-right font-mono text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                Total
              </span>
            </div>
            <div className="divide-y divide-border">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3.5 sm:grid sm:grid-cols-[2fr_0.5fr_1fr_0.8fr_1fr] sm:items-center"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground">
                      {item.ticket_type?.name || "—"}
                    </span>
                    {item.merch_size && (
                      <Badge variant="default" className="text-[10px]">
                        <Shirt size={10} /> Merch
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">
                    {item.qty}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatCurrency(Number(item.unit_price))}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.merch_size || "—"}
                  </span>
                  <span className="text-right font-mono text-sm font-semibold text-foreground">
                    {formatCurrency(Number(item.unit_price) * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tickets */}
      {order.tickets && order.tickets.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ScanLine size={15} className="text-primary" />
              Tickets ({order.tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {order.tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
                      <Ticket size={14} className="text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-bold text-primary">
                          {ticket.ticket_code}
                        </span>
                        <Badge
                          variant={STATUS_VARIANT[ticket.status] || "secondary"}
                          className="text-[10px]"
                        >
                          {ticket.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ticket.holder_first_name} {ticket.holder_last_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {ticket.merch_size && (
                      <div className="flex items-center gap-1.5">
                        <Shirt size={12} className="text-muted-foreground" />
                        <span className="font-mono text-xs font-semibold">{ticket.merch_size}</span>
                        <Badge
                          variant={ticket.merch_collected ? "success" : "warning"}
                          className="text-[10px]"
                        >
                          {ticket.merch_collected ? "Collected" : "Pending"}
                        </Badge>
                      </div>
                    )}
                    {ticket.scanned_at ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-success" />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          Scanned {formatDateTime(ticket.scanned_at)}
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground/40">
                        Not scanned
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-primary" />
              Timeline
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
                    {/* Dot */}
                    <div
                      className={`absolute -left-6 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-background ring-2 ring-border ${entry.color}`}
                    >
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
