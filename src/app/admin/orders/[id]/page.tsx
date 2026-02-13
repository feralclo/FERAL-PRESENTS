"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Order } from "@/types/orders";

const STATUS_COLORS: Record<string, string> = {
  completed: "#4ecb71",
  pending: "#ffc107",
  refunded: "#ff0033",
  cancelled: "#888",
  failed: "#ff0033",
  valid: "#4ecb71",
  used: "#888",
};

interface TimelineEntry {
  label: string;
  detail?: string;
  time: string;
  color: string;
  sortDate: Date;
}

function buildTimeline(order: Order): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const fmt = (d: string) => new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Order created
  entries.push({
    label: "Order placed",
    detail: `${order.order_number} — £${Number(order.total).toFixed(2)}`,
    time: fmt(order.created_at),
    color: "#4ecb71",
    sortDate: new Date(order.created_at),
  });

  // Payment processed
  if (order.payment_ref && order.status !== "failed") {
    entries.push({
      label: "Payment processed",
      detail: `via ${order.payment_method}${order.payment_ref ? ` (${order.payment_ref.slice(0, 20)}...)` : ""}`,
      time: fmt(order.created_at),
      color: "#4ecb71",
      sortDate: new Date(new Date(order.created_at).getTime() + 1000),
    });
  }

  // Email sent / failed (from order metadata)
  const meta = (order.metadata || {}) as Record<string, unknown>;
  if (meta.email_sent === true && typeof meta.email_sent_at === "string") {
    entries.push({
      label: "Confirmation email sent",
      detail: `to ${meta.email_to || order.customer?.email || "customer"}`,
      time: fmt(meta.email_sent_at as string),
      color: "#4ecb71",
      sortDate: new Date(meta.email_sent_at as string),
    });
  } else if (meta.email_sent === false && typeof meta.email_attempted_at === "string") {
    entries.push({
      label: "Email delivery failed",
      detail: (meta.email_error as string) || "Unknown error",
      time: fmt(meta.email_attempted_at as string),
      color: "#ff0033",
      sortDate: new Date(meta.email_attempted_at as string),
    });
  }

  // Tickets scanned
  if (order.tickets) {
    for (const ticket of order.tickets) {
      if (ticket.scanned_at) {
        entries.push({
          label: `Ticket scanned: ${ticket.ticket_code}`,
          detail: ticket.scanned_by ? `by ${ticket.scanned_by}` : undefined,
          time: fmt(ticket.scanned_at),
          color: "#888",
          sortDate: new Date(ticket.scanned_at),
        });
      }
    }
  }

  // Refunded
  if (order.status === "refunded" && order.refunded_at) {
    entries.push({
      label: "Order refunded",
      detail: order.refund_reason || undefined,
      time: fmt(order.refunded_at),
      color: "#ff0033",
      sortDate: new Date(order.refunded_at),
    });
  }

  // Sort chronologically
  entries.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
  return entries;
}

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
    if (!confirm("Are you sure you want to refund this order? All tickets will be cancelled.")) return;

    setRefunding(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: refundReason }),
      });

      if (res.ok) {
        setShowRefund(false);
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
    return <div className="admin-loading">Loading order...</div>;
  }

  if (!order) {
    return <div className="admin-empty">Order not found.</div>;
  }

  const customer = order.customer;
  const event = order.event;

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <Link href="/admin/orders/" className="admin-back-link">
            &larr; Back to Orders
          </Link>
          <h1 className="admin-title">{order.order_number}</h1>
        </div>
        <div className="admin-page-header__actions">
          <button className="admin-btn admin-btn--secondary" onClick={handleDownloadPDF}>
            Download PDF
          </button>
          {order.status === "completed" && (
            <button
              className="admin-btn admin-btn--danger"
              onClick={() => setShowRefund(!showRefund)}
            >
              Refund Order
            </button>
          )}
        </div>
      </div>

      {/* Refund Form */}
      {showRefund && (
        <div className="admin-section admin-refund-form">
          <h3 className="admin-section__title">Process Refund</h3>
          <div className="admin-form__field">
            <label className="admin-form__label">Reason (optional)</label>
            <input
              type="text"
              className="admin-form__input"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Customer requested refund..."
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="admin-btn admin-btn--danger"
              onClick={handleRefund}
              disabled={refunding}
            >
              {refunding ? "Processing..." : "Confirm Refund"}
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setShowRefund(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Order Info + Customer */}
      <div className="admin-grid admin-grid--2">
        <div className="admin-section">
          <h2 className="admin-section__title">Order Details</h2>
          <div className="admin-detail-list">
            <div className="admin-detail-row">
              <span className="admin-detail-label">Status</span>
              <span
                className="admin-badge"
                style={{
                  background: `${STATUS_COLORS[order.status] || "#888"}22`,
                  color: STATUS_COLORS[order.status] || "#888",
                }}
              >
                {order.status}
              </span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Date</span>
              <span>
                {new Date(order.created_at).toLocaleString("en-GB")}
              </span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Event</span>
              <span>{event?.name || "—"}</span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Payment</span>
              <span>{order.payment_method} / {order.payment_ref || "—"}</span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Total</span>
              <span className="admin-detail-price">
                £{Number(order.total).toFixed(2)}
              </span>
            </div>
            {order.refund_reason && (
              <div className="admin-detail-row">
                <span className="admin-detail-label">Refund Reason</span>
                <span>{order.refund_reason}</span>
              </div>
            )}
          </div>
        </div>

        <div className="admin-section">
          <h2 className="admin-section__title">Customer</h2>
          <div className="admin-detail-list">
            <div className="admin-detail-row">
              <span className="admin-detail-label">Name</span>
              <span>
                {customer
                  ? `${customer.first_name} ${customer.last_name}`
                  : "—"}
              </span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Email</span>
              <span>{customer?.email || "—"}</span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Phone</span>
              <span>{customer?.phone || "—"}</span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Total Orders</span>
              <span>{customer?.total_orders || 0}</span>
            </div>
            <div className="admin-detail-row">
              <span className="admin-detail-label">Total Spent</span>
              <span>
                £{Number(customer?.total_spent || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Order Items */}
      {order.items && order.items.length > 0 && (
        <div className="admin-section">
          <h2 className="admin-section__title">Items</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ticket Type</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Size</th>
                <th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.ticket_type?.name || "—"}
                    {item.merch_size && (
                      <span
                        className="admin-badge"
                        style={{ marginLeft: 8, background: "#ff003322", color: "#ff0033" }}
                      >
                        MERCH
                      </span>
                    )}
                  </td>
                  <td className="admin-table__mono">{item.qty}</td>
                  <td className="admin-table__mono">
                    £{Number(item.unit_price).toFixed(2)}
                  </td>
                  <td>{item.merch_size || "—"}</td>
                  <td className="admin-table__mono admin-table__price">
                    £{(Number(item.unit_price) * item.qty).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tickets */}
      {order.tickets && order.tickets.length > 0 && (
        <div className="admin-section">
          <h2 className="admin-section__title">Tickets</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Status</th>
                <th>Holder</th>
                <th>Merch</th>
                <th>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {order.tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="admin-table__mono" style={{ color: "#ff0033", fontWeight: 700 }}>
                    {ticket.ticket_code}
                  </td>
                  <td>
                    <span
                      className="admin-badge"
                      style={{
                        background: `${STATUS_COLORS[ticket.status] || "#888"}22`,
                        color: STATUS_COLORS[ticket.status] || "#888",
                      }}
                    >
                      {ticket.status}
                    </span>
                  </td>
                  <td>
                    {ticket.holder_first_name} {ticket.holder_last_name}
                  </td>
                  <td>
                    {ticket.merch_size ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>{ticket.merch_size}</span>
                        {ticket.merch_collected ? (
                          <span
                            className="admin-badge"
                            style={{ background: "#4ecb7122", color: "#4ecb71" }}
                          >
                            Collected
                          </span>
                        ) : (
                          <span
                            className="admin-badge"
                            style={{ background: "#ffc10722", color: "#ffc107" }}
                          >
                            Pending
                          </span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="admin-table__mono">
                    {ticket.scanned_at
                      ? new Date(ticket.scanned_at).toLocaleString("en-GB")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline */}
      <div className="admin-section">
        <h2 className="admin-section__title">Timeline</h2>
        <div style={{ position: "relative", paddingLeft: 24 }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute",
            left: 7,
            top: 4,
            bottom: 4,
            width: 2,
            background: "#2a2a2a",
          }} />

          {buildTimeline(order).map((entry, i) => (
            <div key={i} style={{
              position: "relative",
              paddingBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}>
              {/* Dot */}
              <div style={{
                position: "absolute",
                left: -20,
                top: 3,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: entry.color,
                border: "2px solid #0e0e0e",
                boxShadow: `0 0 0 2px ${entry.color}33`,
                flexShrink: 0,
              }} />
              <div>
                <div style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "0.75rem",
                  color: "#fff",
                  marginBottom: 2,
                }}>
                  {entry.label}
                </div>
                {entry.detail && (
                  <div style={{
                    fontSize: "0.7rem",
                    color: "#888",
                    marginBottom: 2,
                  }}>
                    {entry.detail}
                  </div>
                )}
                <div style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "0.6rem",
                  color: "#555",
                  letterSpacing: "0.5px",
                }}>
                  {entry.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
