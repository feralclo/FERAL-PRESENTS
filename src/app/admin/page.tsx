"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";

interface DashboardStats {
  totalTraffic: number;
  totalPopups: number;
  todayTraffic: number;
  conversionRate: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalTraffic: 0,
    totalPopups: 0,
    todayTraffic: 0,
    conversionRate: "0%",
  });

  useEffect(() => {
    async function loadStats() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      // Get total traffic events
      const { count: trafficCount } = await supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true });

      // Get total popup events
      const { count: popupCount } = await supabase
        .from(TABLES.POPUP_EVENTS)
        .select("*", { count: "exact", head: true });

      // Get today's traffic
      const today = new Date().toISOString().split("T")[0];
      const { count: todayCount } = await supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("*", { count: "exact", head: true })
        .gte("timestamp", today);

      // Get conversion counts
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

      setStats({
        totalTraffic: trafficCount || 0,
        totalPopups: popupCount || 0,
        todayTraffic: todayCount || 0,
        conversionRate: rate,
      });
    }

    loadStats();
  }, []);

  return (
    <div>
      <h1 className="admin-section__title" style={{ marginBottom: "24px" }}>
        DASHBOARD
      </h1>

      <div className="admin-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">TOTAL TRAFFIC EVENTS</span>
          <span className="admin-stat-card__value">
            {stats.totalTraffic.toLocaleString()}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">TODAY&apos;S TRAFFIC</span>
          <span className="admin-stat-card__value admin-stat-card__value--red">
            {stats.todayTraffic.toLocaleString()}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">POPUP INTERACTIONS</span>
          <span className="admin-stat-card__value">
            {stats.totalPopups.toLocaleString()}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">CONVERSION RATE</span>
          <span className="admin-stat-card__value admin-stat-card__value--red">
            {stats.conversionRate}
          </span>
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section__title">QUICK LINKS</h2>
        <p style={{ color: "#888", fontSize: "0.85rem", lineHeight: 1.6 }}>
          Use the sidebar to navigate to specific sections. The Traffic Analytics
          page shows the full funnel breakdown. The Event Editor lets you
          configure ticket IDs, names, themes, and more.
        </p>
      </div>
    </div>
  );
}
