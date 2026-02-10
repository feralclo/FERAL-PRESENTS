"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";

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

const STATUS_COLORS: Record<string, string> = {
  completed: "#4ecb71",
  pending: "#ffc107",
  refunded: "#ff0033",
  cancelled: "#888",
  failed: "#ff0033",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [filterEvent, setFilterEvent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Stats
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);

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

    const { data: allOrders } = await supabase
      .from(TABLES.ORDERS)
      .select("total, status, created_at")
      .eq("org_id", ORG_ID);

    if (allOrders) {
      const completed = allOrders.filter((o) => o.status === "completed");
      setTotalRevenue(
        completed.reduce((s, o) => s + Number(o.total), 0)
      );

      const today = new Date().toISOString().slice(0, 10);
      setTodayOrders(
        allOrders.filter((o) => o.created_at.slice(0, 10) === today).length
      );
    }
  }, []);

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
      <h1 className="admin-title">Orders</h1>

      {/* Stats */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-card__value">{totalOrders}</div>
          <div className="admin-stat-card__label">Total Orders</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__value admin-stat-card__value--price">
            £{totalRevenue.toFixed(2)}
          </div>
          <div className="admin-stat-card__label">Total Revenue</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__value">{todayOrders}</div>
          <div className="admin-stat-card__label">Today</div>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-filters">
        <select
          className="admin-form__input admin-filter__select"
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
        >
          <option value="">All Events</option>
          {events.map((evt) => (
            <option key={evt.id} value={evt.id}>
              {evt.name}
            </option>
          ))}
        </select>
        <select
          className="admin-form__input admin-filter__select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="admin-loading">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="admin-empty">
          <p>No orders found.</p>
        </div>
      ) : (
        <div className="admin-section">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Event</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Tickets</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      href={`/admin/orders/${order.id}/`}
                      className="admin-link"
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="admin-table__mono">
                    {new Date(order.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{order.event?.name || "—"}</td>
                  <td>
                    <div>{order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : "—"}</div>
                    <div className="admin-table__sub">
                      {order.customer?.email || ""}
                    </div>
                  </td>
                  <td>
                    <span
                      className="admin-badge"
                      style={{
                        background: `${STATUS_COLORS[order.status] || "#888"}22`,
                        color: STATUS_COLORS[order.status] || "#888",
                      }}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="admin-table__mono admin-table__price">
                    £{Number(order.total).toFixed(2)}
                  </td>
                  <td className="admin-table__mono">
                    {order.ticket_count || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
