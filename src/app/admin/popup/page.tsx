"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";

interface PopupStats {
  impressions: number;
  engaged: number;
  dismissed: number;
  conversions: number;
}

export default function PopupPerformance() {
  const [stats, setStats] = useState<PopupStats>({
    impressions: 0,
    engaged: 0,
    dismissed: 0,
    conversions: 0,
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const loadStats = async () => {
      const types = ["impressions", "engaged", "dismissed", "conversions"] as const;
      const results: PopupStats = {
        impressions: 0,
        engaged: 0,
        dismissed: 0,
        conversions: 0,
      };

      for (const type of types) {
        const { count } = await supabase
          .from(TABLES.POPUP_EVENTS)
          .select("*", { count: "exact", head: true })
          .eq("event_type", type);
        results[type] = count || 0;
      }

      setStats(results);
    };

    loadStats();

    // Realtime subscription
    const channel = supabase
      .channel("popup-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.POPUP_EVENTS },
        (payload) => {
          const type = payload.new.event_type as keyof PopupStats;
          if (type in stats) {
            setStats((prev) => ({ ...prev, [type]: prev[type] + 1 }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const engagementRate =
    stats.impressions > 0
      ? ((stats.engaged / stats.impressions) * 100).toFixed(1)
      : "0";
  const conversionRate =
    stats.impressions > 0
      ? ((stats.conversions / stats.impressions) * 100).toFixed(1)
      : "0";

  return (
    <div>
      <h1 className="admin-section__title" style={{ marginBottom: "24px" }}>
        POPUP PERFORMANCE
      </h1>

      <div className="admin-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">IMPRESSIONS</span>
          <span className="admin-stat-card__value">{stats.impressions}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">ENGAGED</span>
          <span className="admin-stat-card__value">{stats.engaged}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">CONVERSIONS</span>
          <span className="admin-stat-card__value admin-stat-card__value--red">
            {stats.conversions}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">DISMISSED</span>
          <span className="admin-stat-card__value">{stats.dismissed}</span>
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section__title">FUNNEL</h2>
        <div className="admin-funnel">
          <FunnelBar
            label="IMPRESSIONS"
            count={stats.impressions}
            maxCount={stats.impressions}
          />
          <FunnelBar
            label="ENGAGED"
            count={stats.engaged}
            maxCount={stats.impressions}
          />
          <FunnelBar
            label="CONVERTED"
            count={stats.conversions}
            maxCount={stats.impressions}
          />
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section__title">RATES</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>METRIC</th>
              <th>VALUE</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Engagement Rate</td>
              <td>{engagementRate}%</td>
            </tr>
            <tr>
              <td>Conversion Rate</td>
              <td>{conversionRate}%</td>
            </tr>
            <tr>
              <td>Dismiss Rate</td>
              <td>
                {stats.impressions > 0
                  ? ((stats.dismissed / stats.impressions) * 100).toFixed(1)
                  : "0"}
                %
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelBar({
  label,
  count,
  maxCount,
}: {
  label: string;
  count: number;
  maxCount: number;
}) {
  const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="admin-funnel__bar">
      <div className="admin-funnel__count">{count}</div>
      <div
        className="admin-funnel__fill"
        style={{ height: `${Math.max(height, 2)}%` }}
      />
      <div className="admin-funnel__label">{label}</div>
    </div>
  );
}
