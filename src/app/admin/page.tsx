"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";

interface DashboardStats {
  totalTraffic: number;
  totalPopups: number;
  todayTraffic: number;
  conversionRate: string;
  totalOrders: number;
  totalRevenue: number;
  todayOrders: number;
  ticketsSold: number;
  activeEvents: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalTraffic: 0,
    totalPopups: 0,
    todayTraffic: 0,
    conversionRate: "0%",
    totalOrders: 0,
    totalRevenue: 0,
    todayOrders: 0,
    ticketsSold: 0,
    activeEvents: 0,
  });

  useEffect(() => {
    async function loadStats() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const today = new Date().toISOString().split("T")[0];

      // Traffic stats
      const { count: trafficCount } = await supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true });

      const { count: popupCount } = await supabase
        .from(TABLES.POPUP_EVENTS)
        .select("*", { count: "exact", head: true });

      const { count: todayCount } = await supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .gte("timestamp", today);

      const { count: checkoutCount } = await supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "checkout");

      const { count: landingCount } = await supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("event_type", "landing");

      const rate =
        landingCount && checkoutCount
          ? ((checkoutCount / landingCount) * 100).toFixed(1) + "%"
          : "0%";

      // Order stats
      const { data: allOrders } = await supabase
        .from(TABLES.ORDERS)
        .select("total, status, created_at")
        .eq("org_id", ORG_ID);

      const completedOrders = (allOrders || []).filter(
        (o) => o.status === "completed"
      );
      const todayOrders = (allOrders || []).filter(
        (o) => o.created_at.slice(0, 10) === today
      ).length;
      const totalRevenue = completedOrders.reduce(
        (s, o) => s + Number(o.total),
        0
      );

      // Tickets sold
      const { count: ticketCount } = await supabase
        .from(TABLES.TICKETS)
        .select("*", { count: "exact", head: true })
        .eq("org_id", ORG_ID);

      // Active events
      const { count: eventCount } = await supabase
        .from(TABLES.EVENTS)
        .select("*", { count: "exact", head: true })
        .eq("org_id", ORG_ID)
        .in("status", ["draft", "live"]);

      setStats({
        totalTraffic: trafficCount || 0,
        totalPopups: popupCount || 0,
        todayTraffic: todayCount || 0,
        conversionRate: rate,
        totalOrders: (allOrders || []).length,
        totalRevenue,
        todayOrders,
        ticketsSold: ticketCount || 0,
        activeEvents: eventCount || 0,
      });
    }

    loadStats();
  }, []);

  return (
    <div>
      <h1 className="admin-title">Dashboard</h1>

      {/* Ticketing Stats */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Total Orders</span>
          <span className="admin-stat-card__value">{stats.totalOrders}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Revenue</span>
          <span className="admin-stat-card__value admin-stat-card__value--price">
            £{stats.totalRevenue.toFixed(2)}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Tickets Sold</span>
          <span className="admin-stat-card__value">{stats.ticketsSold}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Today&apos;s Orders</span>
          <span className="admin-stat-card__value admin-stat-card__value--red">
            {stats.todayOrders}
          </span>
        </div>
      </div>

      {/* Traffic Stats */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Total Traffic</span>
          <span className="admin-stat-card__value">
            {stats.totalTraffic.toLocaleString()}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Today&apos;s Traffic</span>
          <span className="admin-stat-card__value admin-stat-card__value--red">
            {stats.todayTraffic.toLocaleString()}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Popup Interactions</span>
          <span className="admin-stat-card__value">
            {stats.totalPopups.toLocaleString()}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Conversion Rate</span>
          <span className="admin-stat-card__value admin-stat-card__value--red">
            {stats.conversionRate}
          </span>
        </div>
      </div>

      {/* Quick Links */}
      <div className="admin-section">
        <h2 className="admin-section__title">Quick Links</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/admin/events/" className="admin-btn admin-btn--secondary">
            Manage Events
          </Link>
          <Link href="/admin/orders/" className="admin-btn admin-btn--secondary">
            View Orders
          </Link>
          <Link href="/admin/customers/" className="admin-btn admin-btn--secondary">
            Customers
          </Link>
          <Link href="/admin/guest-list/" className="admin-btn admin-btn--secondary">
            Guest List
          </Link>
        </div>
      </div>
    </div>
  );
}
