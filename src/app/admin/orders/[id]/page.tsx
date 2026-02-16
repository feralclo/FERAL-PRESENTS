"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
  QrCode,
  XCircle,
  RefreshCw,
  MailCheck,
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
  canResend?: boolean;
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
    color: "text-muted-foreground",
    sortDate: new Date(order.created_at),
  });

  if (order.payment_ref && order.status !== "failed") {
    entries.push({
      label: "Payment processed",
      detail: `via ${order.payment_method}${order.payment_ref ? ` (${order.payment_ref.slice(0, 20)}...)` : ""}`,
      time: fmt(order.created_at),
      icon: CreditCard,
      color: "text-muted-foreground",
      sortDate: new Date(new Date(order.created_at).getTime() + 1000),
    });
  }

  const meta = (order.metadata || {}) as Record<string, unknown>;
  if (meta.email_sent === true && typeof meta.email_sent_at === "string") {
    entries.push({
      label: "Order Confirmation Sent",
      detail: `to ${meta.email_to || order.customer?.email || "customer"}`,
      time: fmt(meta.email_sent_at as string),
      icon: Send,
      color: "text-muted-foreground",
      sortDate: new Date(meta.email_sent_at as string),
      canResend: true,
    });
  } else if (meta.email_sent === false && typeof meta.email_attempted_at === "string") {
    entries.push({
      label: "Order Confirmation Failed",
      detail: (meta.email_error as string) || "Unknown error",
      time: fmt(meta.email_attempted_at as string),
      icon: AlertCircle,
      color: "text-destructive",
      sortDate: new Date(meta.email_attempted_at as string),
      canResend: true,
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
      color: "text-muted-foreground",
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

function getInitials(first?: string, last?: string): string {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
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
  const [resendingEmail, setResendingEmail] = useState(false);

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

  const handleResendEmail = async () => {
    setResendingEmail(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/resend-email`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message || "Order confirmation resent successfully");
        loadOrder(); // Refresh to update timeline
      } else {
        alert(json.error || "Failed to resend email");
      }
    } catch {
      alert("Network error — could not resend email");
    }
    setResendingEmail(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
          <Package size={28} className="text-muted-foreground/40" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">Order not found</p>
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

  // Separate ticket items from merch items
  const ticketItems = (order.items || []).filter((item) => !item.merch_size);
  const merchItems = (order.items || []).filter((item) => item.merch_size);

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

        {/* Order header card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={12} />
                    {formatDateTime(order.created_at)}
                  </span>
                  {event?.name && (
                    <>
                      <span className="text-border">·</span>
                      <span>{event.name}</span>
                    </>
                  )}
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
          </CardContent>
        </Card>
      </div>

      {/* Refund Form */}
      {showRefund && (
        <Card className="mb-6 border-destructive/30">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
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

      {/* Financial Summary + Customer — 2 column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Financial Summary */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <DollarSign size={15} className="text-muted-foreground" />
              Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="font-mono text-sm text-foreground">
                  {formatCurrency(Number(order.subtotal))}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-muted-foreground">Fees</span>
                <span className="font-mono text-sm text-foreground">
                  {formatCurrency(Number(order.fees))}
                </span>
              </div>
              <div className="flex items-center justify-between bg-muted/30 px-5 py-4">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="font-mono text-xl font-bold text-foreground">
                  {formatCurrency(Number(order.total))}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-muted-foreground">Payment Method</span>
                <div className="flex items-center gap-2">
                  <CreditCard size={12} className="text-muted-foreground/50" />
                  <span className="font-mono text-xs text-muted-foreground">
                    {order.payment_method}
                  </span>
                </div>
              </div>
              {order.payment_ref && (
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-muted-foreground">Reference</span>
                  <span className="max-w-[200px] truncate font-mono text-[11px] text-muted-foreground/50">
                    {order.payment_ref}
                  </span>
                </div>
              )}
              {order.refund_reason && (
                <div className="flex items-center justify-between px-5 py-3.5">
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
              <User size={15} className="text-muted-foreground" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {customer ? (
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <Avatar
                    size="lg"
                    tier="primary"
                    initials={getInitials(customer.first_name, customer.last_name)}
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{customer.email}</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  {customer.phone && (
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50">
                        <Phone size={12} className="text-muted-foreground" />
                      </div>
                      <span className="text-sm text-foreground/80">{customer.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50">
                      <ShoppingBag size={12} className="text-muted-foreground" />
                    </div>
                    <span className="text-sm text-foreground/80">
                      {customer.total_orders || 0} order{(customer.total_orders || 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50">
                      <DollarSign size={12} className="text-muted-foreground" />
                    </div>
                    <span className="text-sm text-foreground/80">
                      {formatCurrency(Number(customer.total_spent || 0))} lifetime
                    </span>
                  </div>
                </div>

                <Link
                  href={`/admin/customers/${customer.id}/`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  View Profile <ExternalLink size={11} />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/30">
                  <User size={20} className="text-muted-foreground/30" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">No customer data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* What Was Ordered — Tickets */}
      {ticketItems.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ticket size={15} className="text-muted-foreground" />
              Ticket Types ({ticketItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {ticketItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Ticket size={14} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.ticket_type?.name || "Ticket"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.qty} x {formatCurrency(Number(item.unit_price))}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {formatCurrency(Number(item.unit_price) * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* What Was Ordered — Merchandise */}
      {merchItems.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shirt size={15} className="text-muted-foreground" />
              Merchandise ({merchItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {merchItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Shirt size={14} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.ticket_type?.name || "Merchandise"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.qty} x {formatCurrency(Number(item.unit_price))}
                        <span className="ml-2">
                          Size {item.merch_size}
                        </span>
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {formatCurrency(Number(item.unit_price) * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual Tickets */}
      {order.tickets && order.tickets.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <QrCode size={15} className="text-muted-foreground" />
              Individual Tickets ({order.tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {order.tickets.map((ticket) => {
                return (
                  <div
                    key={ticket.id}
                    className="rounded-lg border border-border bg-muted/10 px-4 py-3.5"
                  >
                      {/* Top row: code + status */}
                      <div className="flex items-center justify-between">
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
                        {ticket.merch_size && (
                          <Badge
                            variant={ticket.merch_collected ? "success" : "warning"}
                            className="gap-1 text-[9px]"
                          >
                            <Shirt size={9} />
                            {ticket.merch_size}
                            {ticket.merch_collected ? " Collected" : " Pending"}
                          </Badge>
                        )}
                      </div>

                      {/* Holder name */}
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {ticket.holder_first_name} {ticket.holder_last_name}
                      </p>

                      {/* Scan status */}
                      <div className="mt-2">
                        {ticket.scanned_at ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={11} className="text-success" />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Scanned {formatDateTime(ticket.scanned_at)}
                            </span>
                          </div>
                        ) : ticket.status === "cancelled" ? (
                          <div className="flex items-center gap-1.5">
                            <XCircle size={11} className="text-destructive/50" />
                            <span className="font-mono text-[10px] text-muted-foreground/40">
                              Cancelled
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <QrCode size={11} className="text-muted-foreground/30" />
                            <span className="font-mono text-[10px] text-muted-foreground/40">
                              Awaiting scan
                            </span>
                          </div>
                        )}
                      </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-muted-foreground" />
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
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.label}</p>
                          {entry.detail && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                          )}
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                            {entry.time}
                          </p>
                        </div>
                        {entry.canResend && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 gap-1.5 text-xs"
                            onClick={handleResendEmail}
                            disabled={resendingEmail}
                          >
                            {resendingEmail ? (
                              <>
                                <RefreshCw size={12} className="animate-spin" />
                                Sending…
                              </>
                            ) : (
                              <>
                                <MailCheck size={12} />
                                Resend
                              </>
                            )}
                          </Button>
                        )}
                      </div>
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
