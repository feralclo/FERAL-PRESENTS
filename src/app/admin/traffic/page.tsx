"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";

interface FunnelStats {
  landing: number;
  tickets: number;
  checkout: number;
  purchase: number;
  add_to_cart: number;
}

export default function TrafficAnalytics() {
  const [funnel, setFunnel] = useState<FunnelStats>({
    landing: 0,
    tickets: 0,
    checkout: 0,
    purchase: 0,
    add_to_cart: 0,
  });

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function loadFunnel() {
      const types = [
        "landing",
        "tickets",
        "checkout",
        "purchase",
        "add_to_cart",
      ] as const;
      const results: FunnelStats = {
        landing: 0,
        tickets: 0,
        checkout: 0,
        purchase: 0,
        add_to_cart: 0,
      };

      for (const type of types) {
        const { count } = await supabase
          .from(TABLES.TRAFFIC_EVENTS)
          .select("*", { count: "exact", head: true })
          .eq("event_type", type);
        results[type] = count || 0;
      }

      setFunnel(results);
    }

    loadFunnel();

    // Realtime
    const channel = supabase
      .channel("traffic-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.TRAFFIC_EVENTS },
        (payload) => {
          const type = payload.new.event_type as keyof FunnelStats;
          if (type in funnel) {
            setFunnel((prev) => ({ ...prev, [type]: prev[type] + 1 }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div>
      <h1 className="admin-section__title" style={{ marginBottom: "24px" }}>
        TRAFFIC ANALYTICS
      </h1>

      <div className="admin-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">LANDING VIEWS</span>
          <span className="admin-stat-card__value">{funnel.landing}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">TICKET VIEWS</span>
          <span className="admin-stat-card__value">{funnel.tickets}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">CHECKOUTS</span>
          <span className="admin-stat-card__value admin-stat-card__value--red">
            {funnel.checkout}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">ADD TO CART</span>
          <span className="admin-stat-card__value">{funnel.add_to_cart}</span>
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section__title">CONVERSION FUNNEL</h2>
        <div className="admin-funnel">
          <FunnelBar
            label="LANDING"
            count={funnel.landing}
            max={funnel.landing}
          />
          <FunnelBar
            label="TICKETS"
            count={funnel.tickets}
            max={funnel.landing}
          />
          <FunnelBar
            label="ADD TO CART"
            count={funnel.add_to_cart}
            max={funnel.landing}
          />
          <FunnelBar
            label="CHECKOUT"
            count={funnel.checkout}
            max={funnel.landing}
          />
          <FunnelBar
            label="PURCHASE"
            count={funnel.purchase}
            max={funnel.landing}
          />
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section__title">DROP-OFF RATES</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>STAGE</th>
              <th>COUNT</th>
              <th>DROP-OFF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Landing → Tickets</td>
              <td>{funnel.tickets}</td>
              <td>
                {funnel.landing > 0
                  ? (
                      ((funnel.landing - funnel.tickets) / funnel.landing) *
                      100
                    ).toFixed(1) + "%"
                  : "—"}
              </td>
            </tr>
            <tr>
              <td>Tickets → Checkout</td>
              <td>{funnel.checkout}</td>
              <td>
                {funnel.tickets > 0
                  ? (
                      ((funnel.tickets - funnel.checkout) / funnel.tickets) *
                      100
                    ).toFixed(1) + "%"
                  : "—"}
              </td>
            </tr>
            <tr>
              <td>Checkout → Purchase</td>
              <td>{funnel.purchase}</td>
              <td>
                {funnel.checkout > 0
                  ? (
                      ((funnel.checkout - funnel.purchase) / funnel.checkout) *
                      100
                    ).toFixed(1) + "%"
                  : "—"}
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
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const height = max > 0 ? (count / max) * 100 : 0;
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
