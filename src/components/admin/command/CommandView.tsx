"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import type { LiveSession, SessionStage } from "@/hooks/useLiveSessions";
import type { ActivityItem } from "@/components/admin/dashboard/ActivityFeed";
import type { TopEventRow } from "@/components/admin/dashboard/TopEventsTable";
import type { CitySceneProps } from "./CityScene";
import "@/styles/command.css";

/* Lazy-load the 3D scene (Three.js is heavy) */
const CityScene = dynamic<CitySceneProps>(
  () => import("./CityScene").then((m) => m.CityScene),
  { ssr: false }
);

/* ── Props ── */

interface CommandViewProps {
  sessions: LiveSession[];
  funnel: { landing: number; tickets: number; add_to_cart: number; checkout: number; purchase: number };
  activityFeed: ActivityItem[];
  topEvents: TopEventRow[];
  today: { revenue: number; orders: number; ticketsSold: number; conversionRate: number };
  yesterday: { revenue: number };
  lastSale: { amount: number; eventName: string; orderNumber: string; timestamp: Date } | null;
  activeVisitors: number;
  activeCarts: number;
  inCheckout: number;
  isLoading: boolean;
  eventCapacity: Record<string, { sold: number; capacity: number }>;
  saleStreak: number;
  currencySymbol: string;
  currency: string;
}

/* ── Helpers ── */

const TICKER_ICONS: Record<string, string> = {
  order: "\u26A1", purchase: "\u26A1", checkout: "\uD83D\uDCB3",
  add_to_cart: "\uD83D\uDED2", page_view: "\uD83D\uDC41", ticket: "\uD83C\uDFAB",
};

function formatTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/* Stage colors for the funnel bar */
const FUNNEL_STAGES: { key: keyof CommandViewProps["funnel"]; label: string; colorClass: string }[] = [
  { key: "landing", label: "VIEWS", colorClass: "hud-muted-fg" },
  { key: "tickets", label: "TICKETS", colorClass: "hud-info" },
  { key: "add_to_cart", label: "CART", colorClass: "hud-warning" },
  { key: "checkout", label: "CHECKOUT", colorClass: "hud-violet" },
  { key: "purchase", label: "SOLD", colorClass: "hud-success" },
];

/* ════════════════════════════════════════════════════════
   COMMAND VIEW
   ════════════════════════════════════════════════════════ */

export function CommandView({
  sessions,
  funnel,
  activityFeed,
  topEvents,
  today,
  yesterday,
  lastSale,
  activeVisitors,
  activeCarts,
  inCheckout,
  isLoading,
  eventCapacity,
  saleStreak,
  currencySymbol,
  currency,
}: CommandViewProps) {
  const router = useRouter();
  const [clock, setClock] = useState(formatTime);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [purchaseFlash, setPurchaseFlash] = useState(false);
  const [audioInit, setAudioInit] = useState(false);
  const lastSaleKeyRef = useRef<string | null>(null);

  /* Clock */
  useEffect(() => {
    const i = setInterval(() => setClock(formatTime()), 1000);
    return () => clearInterval(i);
  }, []);

  /* ESC → back to dashboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedEvent) setSelectedEvent(null);
        else router.push("/admin/");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router, selectedEvent]);

  /* Detect new purchase → flash + sound */
  useEffect(() => {
    if (!lastSale) return;
    const key = `${lastSale.orderNumber}-${lastSale.timestamp.getTime()}`;
    if (lastSaleKeyRef.current === key) return;
    lastSaleKeyRef.current = key;
    setPurchaseFlash(true);
    const t = setTimeout(() => setPurchaseFlash(false), 800);
    return () => clearTimeout(t);
  }, [lastSale]);

  /* Revenue delta */
  const revDelta = today.revenue - yesterday.revenue;
  const revPct = yesterday.revenue > 0 ? ((revDelta / yesterday.revenue) * 100).toFixed(0) : "—";

  /* Ticker items */
  const tickerItems = useMemo(
    () => activityFeed.filter((a) => a.type !== "page_view").slice(0, 6),
    [activityFeed]
  );

  /* Selected event details */
  const selectedDetails = useMemo(() => {
    if (!selectedEvent) return null;
    const ev = topEvents.find((e) => e.eventSlug === selectedEvent);
    if (!ev) return null;
    const cap = eventCapacity[selectedEvent];
    const liveSessions = sessions.filter((s) => s.eventSlug === selectedEvent);
    const stageBreakdown: Record<SessionStage, number> = {
      landing: 0, tickets: 0, add_to_cart: 0, checkout: 0, purchase: 0,
    };
    for (const s of liveSessions) stageBreakdown[s.stage]++;
    return { ...ev, cap, liveSessions: liveSessions.length, stageBreakdown };
  }, [selectedEvent, topEvents, eventCapacity, sessions]);

  /* Audio init on click */
  const handleSceneClick = useCallback(() => {
    if (!audioInit) setAudioInit(true);
  }, [audioInit]);

  return (
    <div className="command-root" data-admin onClick={handleSceneClick}>
      {/* 3D Scene */}
      <div className="command-canvas-wrap">
        <Suspense fallback={
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "rgba(224,232,255,0.3)",
            fontFamily: "'Space Mono', monospace", fontSize: 12,
            letterSpacing: 3, textTransform: "uppercase",
          }}>
            Loading command view...
          </div>
        }>
          <CityScene
            sessions={sessions}
            topEvents={topEvents}
            eventCapacity={eventCapacity}
            purchaseFlash={purchaseFlash}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
          />
        </Suspense>
      </div>

      {/* Purchase flash overlay */}
      {purchaseFlash && (
        <div
          className="command-flash"
          style={{
            position: "absolute", inset: 0, zIndex: 5,
            background: "radial-gradient(ellipse at center, rgba(52,211,153,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* HUD */}
      <div className="command-hud">

        {/* ── Top-left: Back + Revenue ── */}
        <div style={{ position: "absolute", top: 24, left: 28 }}>
          <Link href="/admin/" className="command-back" data-interactive>
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </Link>

          <div style={{ marginTop: 28 }}>
            <div className="hud-label">Command</div>
            <div className="hud-separator" />

            <div className="hud-value hud-success" style={{ marginTop: 20 }}>
              {isLoading ? "—" : fmtMoney(today.revenue, currency)}
            </div>
            <div className="hud-muted" style={{ marginTop: 6 }}>
              {revDelta >= 0 ? "\u2191" : "\u2193"} {revPct}% vs yesterday
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 20 }}>
              <div>
                <div className="hud-value-sm">{isLoading ? "—" : today.orders.toLocaleString()}</div>
                <div className="hud-label" style={{ marginTop: 3 }}>Orders</div>
              </div>
              <div>
                <div className="hud-value-sm">{isLoading ? "—" : today.ticketsSold.toLocaleString()}</div>
                <div className="hud-label" style={{ marginTop: 3 }}>Tickets</div>
              </div>
            </div>

            {saleStreak >= 3 && (
              <div style={{ marginTop: 14 }}>
                <div className="hud-value-sm hud-success">{saleStreak}x streak</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Top-right: Live + Clock + Presence ── */}
        <div style={{ position: "absolute", top: 24, right: 28, textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
            <div className="command-live-dot" />
            <span className="hud-label" style={{ color: "#34D399", letterSpacing: 3, fontSize: 10 }}>LIVE</span>
          </div>

          <div className="hud-muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: "rgba(224,232,255,0.45)" }}>
            {clock}
          </div>

          <div style={{ marginTop: 22, display: "flex", gap: 20, justifyContent: "flex-end" }}>
            <div style={{ textAlign: "center" }}>
              <div className="hud-value-sm">{sessions.length}</div>
              <div className="hud-label" style={{ marginTop: 3 }}>Sessions</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="hud-value-sm">{activeVisitors}</div>
              <div className="hud-label" style={{ marginTop: 3 }}>Viewing</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="hud-value-sm">{activeCarts}</div>
              <div className="hud-label" style={{ marginTop: 3 }}>Carts</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="hud-value-xs">{isLoading ? "—" : `${today.conversionRate.toFixed(1)}%`} conversion</div>
          </div>
        </div>

        {/* ── Selected event detail panel ── */}
        {selectedDetails && (
          <div
            className="command-district-tip"
            data-interactive
            style={{ top: "50%", right: 28, transform: "translateY(-50%)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div className="command-district-name">{selectedDetails.eventName}</div>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  background: "none", border: "none", color: "rgba(224,232,255,0.3)",
                  cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 4,
                }}
              >
                &times;
              </button>
            </div>
            <div className="command-district-stats">
              {selectedDetails.views} views &middot; {selectedDetails.sales} sold
              &middot; {selectedDetails.liveSessions} live
            </div>
            {selectedDetails.cap && (
              <>
                <div className="command-district-bar">
                  <div
                    className="command-district-bar-fill"
                    style={{ width: `${Math.min((selectedDetails.cap.sold / selectedDetails.cap.capacity) * 100, 100)}%` }}
                  />
                </div>
                <div className="hud-muted" style={{ marginTop: 4, fontSize: 9 }}>
                  {selectedDetails.cap.sold} / {selectedDetails.cap.capacity} capacity
                </div>
              </>
            )}
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {FUNNEL_STAGES.map((fs) => (
                <div key={fs.key} style={{ textAlign: "center" }}>
                  <div className={`hud-value-xs ${fs.colorClass}`}>
                    {selectedDetails.stageBreakdown[fs.key as SessionStage] || 0}
                  </div>
                  <div className="hud-label" style={{ marginTop: 2, fontSize: 7 }}>{fs.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Funnel summary (bottom center) ── */}
        <div className="command-funnel" data-interactive>
          {FUNNEL_STAGES.map((s) => (
            <div key={s.key} style={{ textAlign: "center" }}>
              <div className={`hud-value-sm ${s.colorClass}`}>
                {funnel[s.key] > 0 ? funnel[s.key] : "—"}
              </div>
              <div className="hud-label" style={{ marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Activity ticker ── */}
        {tickerItems.length > 0 && (
          <div className="command-ticker">
            {tickerItems.map((item) => (
              <span key={item.id} className="command-ticker-item">
                {TICKER_ICONS[item.type] || "\u00B7"}{" "}
                {item.amount ? (
                  <span className="command-ticker-amount">{item.amount}</span>
                ) : (
                  <span>{item.title}</span>
                )}
                {item.eventName && (
                  <span className="command-ticker-dim"> &middot; {item.eventName}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
