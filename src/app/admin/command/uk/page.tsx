"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Globe, Zap } from "lucide-react";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { useLiveSessions } from "@/hooks/useLiveSessions";
import { useOrgCurrency } from "@/hooks/useOrgCurrency";
import { fmtMoney } from "@/lib/format";
import "@/styles/command.css";

const UKMap = dynamic(
  () => import("@/components/admin/command/UKMap").then((m) => m.UKMap),
  { ssr: false }
);

const STAGES = [
  { key: "landing" as const, label: "Viewing", dot: "#8888a0" },
  { key: "tickets" as const, label: "Tickets", dot: "#38BDF8" },
  { key: "add_to_cart" as const, label: "Cart", dot: "#FBBF24" },
  { key: "checkout" as const, label: "Checkout", dot: "#8B5CF6" },
  { key: "purchase" as const, label: "Sold", dot: "#34D399" },
];

function formatTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function UKCommandPage() {
  const router = useRouter();
  const { funnel, today, yesterday, lastSale, activeVisitors, activeCarts, isLoading, saleStreak } = useDashboardRealtime();
  const sessions = useLiveSessions();
  const { currency } = useOrgCurrency();
  const [clock, setClock] = useState(formatTime);
  const [events, setEvents] = useState<any[]>([]);
  const [showSale, setShowSale] = useState(false);
  const lastSaleKey = React.useRef<string | null>(null);

  useEffect(() => {
    const i = setInterval(() => setClock(formatTime()), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") router.push("/admin/command/"); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router]);

  // Fetch UK events
  useEffect(() => {
    fetch("/api/admin/uk-events")
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []))
      .catch(() => {});
  }, []);

  // Sale celebration
  useEffect(() => {
    if (!lastSale) return;
    const key = `${lastSale.orderNumber}-${lastSale.timestamp.getTime()}`;
    if (lastSaleKey.current === key) return;
    lastSaleKey.current = key;
    setShowSale(true);
    const t = setTimeout(() => setShowSale(false), 4000);
    return () => clearTimeout(t);
  }, [lastSale]);

  const revDelta = today.revenue - yesterday.revenue;
  const revPct = yesterday.revenue > 0 ? ((revDelta / yesterday.revenue) * 100).toFixed(0) : "—";

  return (
    <div className="command-root" data-admin>
      {/* Map */}
      <div className="command-canvas-wrap">
        <UKMap sessions={sessions} events={events} funnel={funnel} />
      </div>

      {/* Sale banner */}
      {showSale && lastSale && (
        <div className="cmd-sale-banner">
          <Zap size={18} />
          <span className="cmd-sale-amount">{fmtMoney(lastSale.amount, currency)}</span>
          <span className="cmd-sale-event">{lastSale.eventName}</span>
        </div>
      )}

      {/* HUD */}
      <div className="command-hud">
        {/* Top bar */}
        <div className="cmd-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/admin/command/" className="command-back" data-interactive>
              <Globe size={14} />
              <span>Globe</span>
            </Link>
            <Link href="/admin/" className="command-back" data-interactive>
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </Link>
          </div>
          <div className="cmd-topbar-right">
            <div className="command-live-dot" />
            <span className="cmd-live-label">LIVE</span>
            <span className="cmd-clock">{clock}</span>
          </div>
        </div>

        {/* Left panel */}
        <div className="cmd-panel cmd-panel-left" data-interactive>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2.5, color: "rgba(224,232,255,0.25)", marginBottom: 12 }}>
            United Kingdom
          </div>
          <div className="cmd-revenue">
            {isLoading ? "—" : fmtMoney(today.revenue, currency)}
          </div>
          <div className="cmd-revenue-label">
            Today&apos;s Revenue
            <span className={`cmd-trend ${revDelta >= 0 ? "cmd-trend-up" : "cmd-trend-down"}`}>
              {revDelta >= 0 ? "\u2191" : "\u2193"} {revPct}%
            </span>
          </div>
          <div className="cmd-kpi-row">
            <div className="cmd-kpi">
              <div className="cmd-kpi-value">{isLoading ? "—" : today.orders}</div>
              <div className="cmd-kpi-label">Orders</div>
            </div>
            <div className="cmd-kpi">
              <div className="cmd-kpi-value">{isLoading ? "—" : today.ticketsSold}</div>
              <div className="cmd-kpi-label">Tickets</div>
            </div>
          </div>
          <div className="cmd-presence-row">
            <div className="cmd-presence">
              <span className="cmd-presence-dot" style={{ background: "#34D399" }} />
              {sessions.length} sessions
            </div>
            <div className="cmd-presence">
              <span className="cmd-presence-dot" style={{ background: "#38BDF8" }} />
              {activeVisitors} viewing
            </div>
            <div className="cmd-presence">
              <span className="cmd-presence-dot" style={{ background: "#FBBF24" }} />
              {activeCarts} carts
            </div>
          </div>
          {saleStreak >= 3 && (
            <div className="cmd-streak"><Zap size={12} /> {saleStreak}x streak</div>
          )}
        </div>

        {/* Bottom funnel */}
        <div className="cmd-bottom">
          <div className="cmd-funnel-bar" data-interactive>
            {STAGES.map((s) => (
              <div key={s.key} className="cmd-funnel-stage">
                <div className="cmd-funnel-dot" style={{ background: s.dot }} />
                <div className="cmd-funnel-value" style={{ color: s.dot }}>
                  {funnel[s.key] > 0 ? funnel[s.key] : "—"}
                </div>
                <div className="cmd-funnel-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
