"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Zap, Volume2, VolumeX, MapPin } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import type { LiveSession, SessionStage } from "@/hooks/useLiveSessions";
import type { ActivityItem } from "@/components/admin/dashboard/ActivityFeed";
import type { TopEventRow } from "@/components/admin/dashboard/TopEventsTable";
import type { CitySceneProps } from "./CityScene";
import "@/styles/command.css";

const CityScene = dynamic<CitySceneProps>(
  () => import("./CityScene").then((m) => m.CityScene),
  { ssr: false }
);

/* ── Types ── */

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

interface Toast {
  id: string;
  icon: string;
  text: string;
  detail?: string;
  color: string;
  createdAt: number;
  side: "left" | "right";
  yOffset: number;
}

/* ── Constants ── */

const STAGES: { key: keyof CommandViewProps["funnel"]; label: string; color: string; dot: string }[] = [
  { key: "landing", label: "Viewing", color: "rgba(136,136,160,0.9)", dot: "#8888a0" },
  { key: "tickets", label: "Tickets", color: "rgba(56,189,248,0.9)", dot: "#38BDF8" },
  { key: "add_to_cart", label: "Cart", color: "rgba(251,191,36,0.9)", dot: "#FBBF24" },
  { key: "checkout", label: "Checkout", color: "rgba(139,92,246,0.9)", dot: "#8B5CF6" },
  { key: "purchase", label: "Sold", color: "rgba(52,211,153,0.9)", dot: "#34D399" },
];

const FEED_ICONS: Record<string, string> = {
  order: "\u26A1", purchase: "\u26A1", checkout: "\uD83D\uDCB3",
  add_to_cart: "\uD83D\uDED2", page_view: "\uD83D\uDC41", ticket: "\uD83C\uDFAB",
};

const FEED_COLORS: Record<string, string> = {
  order: "#34D399", purchase: "#34D399", checkout: "#8B5CF6",
  add_to_cart: "#FBBF24", page_view: "#8888a0", ticket: "#38BDF8",
};

function formatTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function relativeTime(ts: Date): string {
  const diff = Math.max(0, Date.now() - ts.getTime());
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

/* ════════════════════════════════════════════════════════
   SOUND ENGINE — Subtle audio feedback
   ════════════════════════════════════════════════════════ */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.enabled = true;
    } catch { /* Audio not available */ }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled() { return this.enabled; }

  private tone(freq: number, duration: number, vol: number, type: OscillatorType = "sine") {
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Soft bloop — someone landed
  pageView() { this.tone(440, 0.15, 0.02); }

  // Warmer tone — tickets interest
  ticketView() { this.tone(520, 0.2, 0.025, "triangle"); }

  // Rising — add to cart
  addToCart() {
    this.tone(600, 0.15, 0.03, "triangle");
    setTimeout(() => this.tone(750, 0.15, 0.03, "triangle"), 80);
  }

  // Tension — checkout
  checkout() {
    this.tone(700, 0.12, 0.03, "triangle");
    setTimeout(() => this.tone(880, 0.12, 0.03, "triangle"), 60);
    setTimeout(() => this.tone(1000, 0.15, 0.025, "triangle"), 120);
  }

  // Ka-ching — purchase!
  purchase() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = "triangle";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(1200, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.06);
    osc2.frequency.setValueAtTime(1800, ctx.currentTime + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(2800, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.08);
    osc1.stop(ctx.currentTime + 0.3);
    osc2.stop(ctx.currentTime + 0.5);
  }

  // Milestone chime
  milestone() {
    this.tone(800, 0.1, 0.04, "triangle");
    setTimeout(() => this.tone(1000, 0.1, 0.04, "triangle"), 100);
    setTimeout(() => this.tone(1200, 0.2, 0.04, "triangle"), 200);
  }
}

/* ════════════════════════════════════════════════════════
   COMMAND VIEW
   ════════════════════════════════════════════════════════ */

export function CommandView({
  sessions, funnel, activityFeed, topEvents, today, yesterday,
  lastSale, activeVisitors, activeCarts, inCheckout, isLoading,
  eventCapacity, saleStreak, currencySymbol, currency,
}: CommandViewProps) {
  const router = useRouter();
  const [clock, setClock] = useState(formatTime);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [purchaseFlash, setPurchaseFlash] = useState(false);
  const [showSaleBanner, setShowSaleBanner] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [milestone, setMilestone] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const lastSaleKeyRef = useRef<string | null>(null);
  const lastFeedLenRef = useRef(0);
  const soundRef = useRef(new SoundEngine());
  const milestonesHitRef = useRef(new Set<string>());
  const toastCountRef = useRef(0);

  // Clock
  useEffect(() => {
    const i = setInterval(() => setClock(formatTime()), 1000);
    return () => clearInterval(i);
  }, []);

  // ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") router.push("/admin/"); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router]);

  // Init sound on first click
  const handleClick = useCallback(() => {
    soundRef.current.init();
    if (!soundOn) setSoundOn(true);
  }, [soundOn]);

  const toggleSound = useCallback(() => {
    const on = soundRef.current.toggle();
    setSoundOn(on);
  }, []);

  // ── Purchase celebration ──
  useEffect(() => {
    if (!lastSale) return;
    const key = `${lastSale.orderNumber}-${lastSale.timestamp.getTime()}`;
    if (lastSaleKeyRef.current === key) return;
    lastSaleKeyRef.current = key;
    setPurchaseFlash(true);
    setShowSaleBanner(true);
    soundRef.current.purchase();
    const t1 = setTimeout(() => setPurchaseFlash(false), 1200);
    const t2 = setTimeout(() => setShowSaleBanner(false), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [lastSale]);

  // ── Floating toasts from activity feed ──
  useEffect(() => {
    const feed = activityFeed.filter((a) => a.type !== "page_view");
    const newLen = feed.length;
    if (lastFeedLenRef.current === 0) { lastFeedLenRef.current = newLen; return; }
    if (newLen <= lastFeedLenRef.current) { lastFeedLenRef.current = newLen; return; }

    const newItems = feed.slice(0, newLen - lastFeedLenRef.current);
    lastFeedLenRef.current = newLen;

    for (const item of newItems.slice(0, 3)) {
      // Play sound based on type
      if (item.type === "add_to_cart") soundRef.current.addToCart();
      else if (item.type === "checkout") soundRef.current.checkout();
      else if (item.type === "order" || item.type === "purchase") { /* handled by sale banner */ }
      else soundRef.current.ticketView();

      const id = `toast-${++toastCountRef.current}`;
      const side = toastCountRef.current % 2 === 0 ? "left" as const : "right" as const;
      const yOffset = 30 + (toastCountRef.current % 4) * 22;

      setToasts((prev) => [
        ...prev.slice(-4),
        {
          id,
          icon: FEED_ICONS[item.type] || "\u00B7",
          text: item.amount || item.title,
          detail: item.eventName,
          color: FEED_COLORS[item.type] || "#8888a0",
          createdAt: Date.now(),
          side,
          yOffset,
        },
      ]);
    }
  }, [activityFeed]);

  // Clean up old toasts
  useEffect(() => {
    const i = setInterval(() => {
      setToasts((prev) => prev.filter((t) => Date.now() - t.createdAt < 4000));
    }, 500);
    return () => clearInterval(i);
  }, []);

  // ── Milestones ──
  useEffect(() => {
    const hits = milestonesHitRef.current;
    const show = (key: string, msg: string) => {
      if (hits.has(key)) return;
      hits.add(key);
      soundRef.current.milestone();
      setMilestone(msg);
      setTimeout(() => setMilestone(null), 4000);
    };

    if (sessions.length >= 1 && !hits.has("first")) show("first", "\uD83D\uDC4B First visitor of the day!");
    if (sessions.length >= 10 && !hits.has("10")) show("10", "\uD83D\uDD25 10 people browsing!");
    if (sessions.length >= 25 && !hits.has("25")) show("25", "\uD83D\uDE80 25 live sessions!");
    if (sessions.length >= 50 && !hits.has("50")) show("50", "\uD83C\uDF1F 50 people watching!");
    if (funnel.add_to_cart >= 1 && !hits.has("cart1")) show("cart1", "\uD83D\uDED2 First add to cart!");
    if (funnel.checkout >= 1 && !hits.has("ck1")) show("ck1", "\uD83D\uDCB3 Someone's checking out!");
    if (funnel.purchase >= 1 && !hits.has("sale1")) show("sale1", "\uD83C\uDF89 First sale of the day!");
    if (saleStreak >= 3 && !hits.has("streak3")) show("streak3", "\u26A1 3x sale streak!");
    if (saleStreak >= 5 && !hits.has("streak5")) show("streak5", "\uD83D\uDD25 5x sale streak — on fire!");
  }, [sessions.length, funnel, saleStreak]);

  // Computed
  const revDelta = today.revenue - yesterday.revenue;
  const revPct = yesterday.revenue > 0 ? ((revDelta / yesterday.revenue) * 100).toFixed(0) : "—";

  const feedItems = useMemo(
    () => activityFeed.filter((a) => a.type !== "page_view").slice(0, 8),
    [activityFeed]
  );

  // Top events with live counts
  const eventSpotlights = useMemo(() => {
    return topEvents.slice(0, 4).map((ev) => {
      const liveSessions = sessions.filter((s) => s.eventSlug === ev.eventSlug).length;
      const cap = eventCapacity[ev.eventSlug];
      return { ...ev, liveSessions, cap };
    });
  }, [topEvents, sessions, eventCapacity]);

  // Tick for relative times
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="command-root" data-admin onClick={handleClick}>
      {/* Globe */}
      <div className="command-canvas-wrap">
        <Suspense fallback={<div className="cmd-loading">Initializing globe...</div>}>
          <CityScene
            sessions={sessions} topEvents={topEvents} eventCapacity={eventCapacity}
            purchaseFlash={purchaseFlash} selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
          />
        </Suspense>
      </div>

      {/* Purchase flash */}
      {purchaseFlash && <div className="cmd-purchase-flash" />}

      {/* Sale banner */}
      {showSaleBanner && lastSale && (
        <div className="cmd-sale-banner">
          <Zap size={18} />
          <span className="cmd-sale-amount">{fmtMoney(lastSale.amount, currency)}</span>
          <span className="cmd-sale-event">{lastSale.eventName}</span>
        </div>
      )}

      {/* Milestone banner */}
      {milestone && (
        <div className="cmd-milestone-banner">{milestone}</div>
      )}

      {/* ── Floating toasts near globe ── */}
      {toasts.map((t) => {
        const age = Date.now() - t.createdAt;
        const opacity = age < 300 ? age / 300 : age > 3000 ? 1 - (age - 3000) / 1000 : 1;
        const translateY = -(age / 80);
        return (
          <div
            key={t.id}
            className="cmd-toast"
            style={{
              [t.side]: "calc(50% + 320px)",
              top: `${t.yOffset}%`,
              opacity: Math.max(0, opacity),
              transform: `translateY(${translateY}px)`,
              borderColor: `${t.color}20`,
            }}
          >
            <span className="cmd-toast-icon">{t.icon}</span>
            <div>
              <div className="cmd-toast-text" style={{ color: t.color }}>{t.text}</div>
              {t.detail && <div className="cmd-toast-detail">{t.detail}</div>}
            </div>
          </div>
        );
      })}

      {/* HUD */}
      <div className="command-hud">

        {/* Top bar */}
        <div className="cmd-topbar">
          <Link href="/admin/" className="command-back" data-interactive>
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </Link>
          <Link href="/admin/command/uk/" className="command-back" data-interactive>
            <MapPin size={14} />
            <span>UK Map</span>
          </Link>
          <div className="cmd-topbar-right">
            <button className="cmd-sound-btn" data-interactive onClick={(e) => { e.stopPropagation(); toggleSound(); }}>
              {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <div className="command-live-dot" />
            <span className="cmd-live-label">LIVE</span>
            <span className="cmd-clock">{clock}</span>
          </div>
        </div>

        {/* Left panel: Revenue */}
        <div className="cmd-panel cmd-panel-left" data-interactive>
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
            <div className="cmd-kpi">
              <div className="cmd-kpi-value">{isLoading ? "—" : `${today.conversionRate.toFixed(1)}%`}</div>
              <div className="cmd-kpi-label">Conv.</div>
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

        {/* Right panel: Feed + Event spotlights */}
        <div className="cmd-panel cmd-panel-right" data-interactive>
          {/* Event spotlights */}
          {eventSpotlights.length > 0 && (
            <div className="cmd-spotlights">
              <div className="cmd-feed-header">Events</div>
              {eventSpotlights.map((ev) => (
                <div key={ev.eventSlug} className="cmd-spotlight">
                  <div className="cmd-spotlight-name">{ev.eventName}</div>
                  <div className="cmd-spotlight-stats">
                    <span>{ev.liveSessions} live</span>
                    <span>{ev.views} views</span>
                    <span>{ev.sales} sold</span>
                  </div>
                  {ev.cap && ev.cap.capacity > 0 && (
                    <div className="cmd-spotlight-bar">
                      <div
                        className="cmd-spotlight-fill"
                        style={{ width: `${Math.min((ev.cap.sold / ev.cap.capacity) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Activity feed */}
          <div className="cmd-feed-header" style={{ marginTop: eventSpotlights.length > 0 ? 0 : undefined }}>
            Live Activity
          </div>
          <div className="cmd-feed-list">
            {feedItems.length === 0 && (
              <div className="cmd-feed-empty">Waiting for activity...</div>
            )}
            {feedItems.map((item) => {
              const fresh = Date.now() - item.timestamp.getTime() < 10000;
              return (
                <div key={item.id} className={`cmd-feed-item ${fresh ? "cmd-feed-fresh" : ""}`}>
                  <div className="cmd-feed-icon" style={{ color: FEED_COLORS[item.type] || "#8888a0" }}>
                    {FEED_ICONS[item.type] || "\u00B7"}
                  </div>
                  <div className="cmd-feed-content">
                    <div className="cmd-feed-title">
                      {item.amount ? (
                        <span className="cmd-feed-amount">{item.amount}</span>
                      ) : (
                        item.title
                      )}
                    </div>
                    {item.eventName && <div className="cmd-feed-event">{item.eventName}</div>}
                  </div>
                  <div className="cmd-feed-time">{relativeTime(item.timestamp)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom: Funnel */}
        <div className="cmd-bottom">
          <div className="cmd-funnel-bar" data-interactive>
            {STAGES.map((s) => (
              <div key={s.key} className="cmd-funnel-stage">
                <div className="cmd-funnel-dot" style={{ background: s.dot }} />
                <div className="cmd-funnel-value" style={{ color: s.color }}>
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
