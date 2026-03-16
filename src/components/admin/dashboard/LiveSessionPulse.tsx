"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveIndicator } from "@/components/ui/live-indicator";
import {
  Eye,
  Ticket,
  ShoppingCart,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import type { LiveSession, SessionStage } from "@/hooks/useLiveSessions";
import type { ActivityItem } from "@/components/admin/dashboard/ActivityFeed";

/* ── Stage config ── */

interface StageConfig {
  key: SessionStage;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  color: string;        // tailwind text color
  dotColor: string;     // hex for inline styles
  glowColor: string;    // rgba for box-shadow
  bgGradient: string;   // subtle background wash
}

const STAGES: StageConfig[] = [
  {
    key: "landing",
    label: "Views",
    icon: Eye,
    color: "text-muted-foreground",
    dotColor: "#8888a0",
    glowColor: "rgba(136, 136, 160, 0.4)",
    bgGradient: "radial-gradient(ellipse at 50% 80%, rgba(136,136,160,0.06) 0%, transparent 70%)",
  },
  {
    key: "tickets",
    label: "Tickets",
    icon: Ticket,
    color: "text-info",
    dotColor: "#38BDF8",
    glowColor: "rgba(56, 189, 248, 0.4)",
    bgGradient: "radial-gradient(ellipse at 50% 80%, rgba(56,189,248,0.06) 0%, transparent 70%)",
  },
  {
    key: "add_to_cart",
    label: "Cart",
    icon: ShoppingCart,
    color: "text-warning",
    dotColor: "#FBBF24",
    glowColor: "rgba(251, 191, 36, 0.4)",
    bgGradient: "radial-gradient(ellipse at 50% 80%, rgba(251,191,36,0.06) 0%, transparent 70%)",
  },
  {
    key: "checkout",
    label: "Checkout",
    icon: CreditCard,
    color: "text-primary",
    dotColor: "#8B5CF6",
    glowColor: "rgba(139, 92, 246, 0.4)",
    bgGradient: "radial-gradient(ellipse at 50% 80%, rgba(139,92,246,0.06) 0%, transparent 70%)",
  },
  {
    key: "purchase",
    label: "Sold",
    icon: CheckCircle2,
    color: "text-success",
    dotColor: "#34D399",
    glowColor: "rgba(52, 211, 153, 0.4)",
    bgGradient: "radial-gradient(ellipse at 50% 80%, rgba(52,211,153,0.06) 0%, transparent 70%)",
  },
];

const STAGE_INDEX: Record<SessionStage, number> = {
  landing: 0,
  tickets: 1,
  add_to_cart: 2,
  checkout: 3,
  purchase: 4,
};

/* ── Hash function for deterministic dot placement ── */

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/* ── Golden-angle positioning within a zone ── */

function dotPosition(sessionId: string, index: number): { x: number; y: number } {
  const seed = hashStr(sessionId);
  // Golden angle offset: distribute evenly in a circle-like pattern
  const angle = (seed + index * 137.508) * (Math.PI / 180);
  const radius = 0.25 + (((seed * 7 + index * 13) % 100) / 100) * 0.2;
  const x = 0.5 + Math.cos(angle) * radius;
  const y = 0.5 + Math.sin(angle) * radius;
  // Clamp to keep within zone bounds (10%-90%)
  return {
    x: Math.max(0.1, Math.min(0.9, x)),
    y: Math.max(0.15, Math.min(0.85, y)),
  };
}

/* ── Format relative time ── */

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60_000)}m ago`;
}

const STAGE_LABELS: Record<SessionStage, string> = {
  landing: "Viewed page",
  tickets: "Browsing tickets",
  add_to_cart: "Added to cart",
  checkout: "In checkout",
  purchase: "Purchased!",
};

/* ── Max visible dots per zone ── */
const MAX_DOTS_PER_ZONE = 12;

/* ════════════════════════════════════════════════════════
   SESSION DOT
   ════════════════════════════════════════════════════════ */

interface SessionDotProps {
  session: LiveSession;
  stageConfig: StageConfig;
  x: number; // 0-1 within zone
  y: number; // 0-1 within zone
  floatDelay: number;
}

const SessionDot = React.memo(function SessionDot({
  session,
  stageConfig,
  x,
  y,
  floatDelay,
}: SessionDotProps) {
  const [showPopover, setShowPopover] = useState(false);
  const isRecent = Date.now() - session.stageChangedAt < 2_000;

  return (
    <div
      className="absolute z-10"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: "translate(-50%, -50%)",
      }}
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      {/* Purchase burst */}
      {session.isPurchaseNew && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="absolute rounded-full purchase-ring"
            style={{
              width: 8,
              height: 8,
              border: `2px solid ${stageConfig.dotColor}`,
              opacity: 0.6,
            }}
          />
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full purchase-particle"
              style={{
                width: 3,
                height: 3,
                backgroundColor: stageConfig.dotColor,
                "--particle-angle": `${i * 60}deg`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* The dot */}
      <div
        className={`rounded-full cursor-default session-float session-glow ${
          isRecent ? "session-arrive" : ""
        }`}
        style={{
          width: session.stage === "purchase" ? 10 : 8,
          height: session.stage === "purchase" ? 10 : 8,
          backgroundColor: stageConfig.dotColor,
          boxShadow: `0 0 8px ${stageConfig.glowColor}, 0 0 16px ${stageConfig.glowColor}`,
          animationDelay: `${floatDelay}s, ${floatDelay * 0.7}s`,
        }}
      />

      {/* Popover */}
      {showPopover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 pointer-events-none">
          <div className="whitespace-nowrap rounded-lg bg-popover border border-border px-3 py-2 shadow-xl text-[11px]">
            {session.eventName && (
              <div className="font-semibold text-foreground mb-1">{session.eventName}</div>
            )}
            <div className="text-muted-foreground">
              {STAGE_LABELS[session.stage]}
              {session.productName && ` · ${session.productName}`}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-muted-foreground/60">
              <span>
                {session.journeyPath
                  .map((s) => STAGE_LABELS[s as SessionStage]?.split(" ")[0] || s)
                  .join(" → ")}
              </span>
            </div>
            <div className="text-muted-foreground/40 mt-1">
              {relativeTime(session.enteredAt)}
            </div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-border bg-popover" />
          </div>
        </div>
      )}
    </div>
  );
});

/* ════════════════════════════════════════════════════════
   STAGE ZONE
   ════════════════════════════════════════════════════════ */

interface StageZoneProps {
  config: StageConfig;
  count: number;
  sessions: LiveSession[];
  allDotPositions: Map<string, { x: number; y: number }>;
}

function StageZone({ config, count, sessions, allDotPositions }: StageZoneProps) {
  const Icon = config.icon;
  const visibleSessions = sessions.slice(0, MAX_DOTS_PER_ZONE);
  const overflow = sessions.length - MAX_DOTS_PER_ZONE;

  return (
    <div className="relative flex flex-col items-center flex-1 min-w-0">
      {/* Header: icon + label */}
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} strokeWidth={1.5} className={config.color} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {config.label}
        </span>
      </div>

      {/* Zone area — dot container */}
      <div
        className="relative w-full rounded-xl border border-border/30 overflow-hidden"
        style={{
          height: 120,
          background: config.bgGradient,
        }}
      >
        {/* Dots */}
        {visibleSessions.map((s, i) => {
          const pos = allDotPositions.get(s.sessionId) || dotPosition(s.sessionId, i);
          return (
            <SessionDot
              key={s.sessionId}
              session={s}
              stageConfig={config}
              x={pos.x}
              y={pos.y}
              floatDelay={(hashStr(s.sessionId) % 4000) / 1000}
            />
          );
        })}

        {/* Overflow badge */}
        {overflow > 0 && (
          <div className="absolute bottom-1.5 right-1.5 z-20 rounded-full bg-secondary/80 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-muted-foreground">
            +{overflow}
          </div>
        )}
      </div>

      {/* Count */}
      <span className="mt-2 font-mono text-[18px] font-bold tabular-nums text-foreground">
        {count > 0 ? count : "—"}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   EVENT TICKER
   ════════════════════════════════════════════════════════ */

interface EventTickerProps {
  items: ActivityItem[];
}

const TX_ICONS: Record<string, string> = {
  order: "⚡",
  purchase: "⚡",
  checkout: "💳",
  add_to_cart: "🛒",
  page_view: "👁",
  ticket: "🎫",
};

function EventTicker({ items }: EventTickerProps) {
  const recent = items.slice(0, 5);
  if (recent.length === 0) return null;

  return (
    <div className="flex items-center gap-3 overflow-hidden px-1">
      {recent.map((item) => (
        <span
          key={item.id}
          className="shrink-0 text-[11px] text-muted-foreground/60 ticker-slide-in"
        >
          {TX_ICONS[item.type] || "·"}{" "}
          <span className="text-muted-foreground/80">
            {item.amount ? `${item.amount}` : item.title}
          </span>
          {item.eventName && (
            <span className="text-muted-foreground/40"> · {item.eventName}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   LIVE SESSION PULSE (MAIN)
   ════════════════════════════════════════════════════════ */

interface FunnelStats {
  landing: number;
  tickets: number;
  add_to_cart: number;
  checkout: number;
  purchase: number;
}

interface LiveSessionPulseProps {
  sessions: LiveSession[];
  funnel: FunnelStats;
  activityFeed: ActivityItem[];
}

export function LiveSessionPulse({ sessions, funnel, activityFeed }: LiveSessionPulseProps) {
  // Group sessions by stage
  const sessionsByStage = useMemo(() => {
    const map: Record<SessionStage, LiveSession[]> = {
      landing: [],
      tickets: [],
      add_to_cart: [],
      checkout: [],
      purchase: [],
    };
    for (const s of sessions) {
      if (map[s.stage]) map[s.stage].push(s);
    }
    return map;
  }, [sessions]);

  // Precompute all dot positions (stable by sessionId)
  const allDotPositions = useMemo(() => {
    const posMap = new Map<string, { x: number; y: number }>();
    for (const stage of STAGES) {
      const stageSessions = sessionsByStage[stage.key];
      stageSessions.forEach((s, i) => {
        if (!posMap.has(s.sessionId)) {
          posMap.set(s.sessionId, dotPosition(s.sessionId, i));
        }
      });
    }
    return posMap;
  }, [sessionsByStage]);

  // Ticker: only non-page_view activity
  const tickerItems = useMemo(
    () => activityFeed.filter((a) => a.type !== "page_view").slice(0, 5),
    [activityFeed]
  );

  const isEmpty = sessions.length === 0;

  // Force re-render every second so relativeTime stays fresh in popovers
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(tickRef.current);
  }, []);

  return (
    <Card className="py-0 gap-0 overflow-hidden">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2.5">
          <LiveIndicator color="success" size="sm" />
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Live Pulse
          </CardTitle>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground/50">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
        </span>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {/* ── Desktop: Horizontal zones ── */}
        <div className="hidden md:flex gap-2 relative">
          {STAGES.map((stage) => (
            <StageZone
              key={stage.key}
              config={stage}
              count={funnel[stage.key]}
              sessions={sessionsByStage[stage.key]}
              allDotPositions={allDotPositions}
            />
          ))}

          {/* Empty state overlay */}
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="flex items-center gap-2 text-muted-foreground/30 text-sm">
                <div
                  className="w-2 h-2 rounded-full bg-muted-foreground/20 session-glow"
                  style={{ animationDelay: "0s" }}
                />
                <span>Waiting for visitors…</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Mobile: Compact vertical zones ── */}
        <div className="md:hidden space-y-2">
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            const count = funnel[stage.key];
            const stageSessions = sessionsByStage[stage.key];
            const dotCount = Math.min(stageSessions.length, 8);

            return (
              <div key={stage.key} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-20 shrink-0">
                  <Icon size={13} strokeWidth={1.5} className={stage.color} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 truncate">
                    {stage.label}
                  </span>
                </div>
                <div
                  className="flex-1 relative rounded-lg border border-border/30 overflow-hidden"
                  style={{ height: 32, background: stage.bgGradient }}
                >
                  {/* Mini dots */}
                  <div className="absolute inset-0 flex items-center px-2 gap-1.5">
                    {stageSessions.slice(0, dotCount).map((s) => (
                      <div
                        key={s.sessionId}
                        className={`rounded-full shrink-0 session-glow ${
                          s.isPurchaseNew ? "purchase-ring" : ""
                        }`}
                        style={{
                          width: 6,
                          height: 6,
                          backgroundColor: stage.dotColor,
                          boxShadow: `0 0 6px ${stage.glowColor}`,
                        }}
                      />
                    ))}
                    {stageSessions.length > dotCount && (
                      <span className="text-[9px] font-mono text-muted-foreground/40 ml-0.5">
                        +{stageSessions.length - dotCount}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[14px] font-bold tabular-nums text-foreground w-8 text-right">
                  {count > 0 ? count : "—"}
                </span>
              </div>
            );
          })}

          {isEmpty && (
            <div className="text-center py-4 text-muted-foreground/30 text-xs">
              Waiting for visitors…
            </div>
          )}
        </div>

        {/* ── Ticker ── */}
        {tickerItems.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/20">
            <EventTicker items={tickerItems} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
