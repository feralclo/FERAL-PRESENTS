"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, ORG_ID } from "@/lib/constants";
import type { ActivityItem } from "@/components/admin/dashboard/ActivityFeed";
import type { TopEventRow } from "@/components/admin/dashboard/TopEventsTable";

/* ── Types ── */

interface FunnelStats {
  landing: number;
  tickets: number;
  add_to_cart: number;
  checkout: number;
  purchase: number;
}

interface TodayKPIs {
  revenue: number;
  orders: number;
  ticketsSold: number;
  avgOrderValue: number;
  conversionRate: number;
}

export interface DashboardState {
  // Right Now
  activeVisitors: number;
  activeCarts: number;
  inCheckout: number;
  // Today's performance
  today: TodayKPIs;
  yesterday: TodayKPIs;
  // Funnel
  funnel: FunnelStats;
  // Activity feed
  activityFeed: ActivityItem[];
  // Top events
  topEvents: TopEventRow[];
  // Meta
  isLoading: boolean;
}

/* ── Helpers ── */

/* ── Main Hook ── */

export function useDashboardRealtime(): DashboardState {
  const [isLoading, setIsLoading] = useState(true);
  const [activeVisitors, setActiveVisitors] = useState(0);
  const [activeCarts, setActiveCarts] = useState(0);
  const [inCheckout, setInCheckout] = useState(0);
  const [today, setToday] = useState<TodayKPIs>({
    revenue: 0, orders: 0, ticketsSold: 0, avgOrderValue: 0, conversionRate: 0,
  });
  const [yesterday, setYesterday] = useState<TodayKPIs>({
    revenue: 0, orders: 0, ticketsSold: 0, avgOrderValue: 0, conversionRate: 0,
  });
  const [funnel, setFunnel] = useState<FunnelStats>({
    landing: 0, tickets: 0, add_to_cart: 0, checkout: 0, purchase: 0,
  });
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [topEvents, setTopEvents] = useState<TopEventRow[]>([]);

  // Mutable maps for real-time presence tracking
  const visitorMap = useRef<Map<string, number>>(new Map());
  const cartSessions = useRef<Map<string, number>>(new Map());
  const purchaseSessions = useRef<Map<string, number>>(new Map());
  const checkoutSessions = useRef<Map<string, number>>(new Map());
  const feedIdCounter = useRef(0);

  /* ── Presence recalculation ── */
  const recalcPresence = useCallback(() => {
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    const fifteenMin = 15 * 60 * 1000;
    const tenMin = 10 * 60 * 1000;

    // Active visitors — sessions seen in last 5 min
    let visitorCount = 0;
    for (const [sid, lastSeen] of visitorMap.current) {
      if (now - lastSeen > fiveMin) {
        visitorMap.current.delete(sid);
      } else {
        visitorCount++;
      }
    }
    setActiveVisitors(visitorCount);

    // Prune old purchase sessions (keep 15 min to cover cart window)
    for (const [sid, ts] of purchaseSessions.current) {
      if (now - ts > fifteenMin) {
        purchaseSessions.current.delete(sid);
      }
    }

    // Active carts — sessions with add_to_cart in last 15 min but no purchase
    let cartCount = 0;
    for (const [sid, lastSeen] of cartSessions.current) {
      if (now - lastSeen > fifteenMin) {
        cartSessions.current.delete(sid);
      } else if (!purchaseSessions.current.has(sid)) {
        cartCount++;
      }
    }
    setActiveCarts(cartCount);

    // In checkout — sessions on checkout in last 10 min but no purchase
    let checkoutCount = 0;
    for (const [sid, lastSeen] of checkoutSessions.current) {
      if (now - lastSeen > tenMin) {
        checkoutSessions.current.delete(sid);
      } else if (!purchaseSessions.current.has(sid)) {
        checkoutCount++;
      }
    }
    setInCheckout(checkoutCount);
  }, []);

  /* ── Add to activity feed ── */
  const addActivity = useCallback((item: Omit<ActivityItem, "id">) => {
    feedIdCounter.current++;
    const newItem: ActivityItem = { ...item, id: `feed-${feedIdCounter.current}` };
    setActivityFeed((prev) => [newItem, ...prev].slice(0, 30));
  }, []);

  /* ── Initial data load via API (bypasses RLS) ── */
  const loadInitialData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) { setIsLoading(false); return; }
      const data = await res.json();

      setToday(data.today);
      setYesterday(data.yesterday);
      setFunnel(data.funnel);

      // Active visitors
      const now = Date.now();
      const sessions = data.recentSessions || [];
      const uniqueSessions = new Set<string>(sessions.map((r: { session_id: string }) => r.session_id));
      for (const sid of uniqueSessions) {
        visitorMap.current.set(sid, now);
      }
      setActiveVisitors(data.activeVisitors || uniqueSessions.size);

      // Active carts
      const purchasedMap = new Map<string, number>();
      for (const r of data.recentPurchaseSessions || []) {
        purchasedMap.set(r.session_id, now);
      }
      purchaseSessions.current = purchasedMap;
      let carts = 0;
      for (const row of data.recentCartSessions || []) {
        const ts = new Date(row.timestamp).getTime();
        cartSessions.current.set(row.session_id, ts);
        if (!purchasedMap.has(row.session_id)) carts++;
      }
      setActiveCarts(data.activeCarts ?? carts);

      // In checkout
      let chk = 0;
      for (const row of data.recentCheckoutSessions || []) {
        const ts = new Date(row.timestamp).getTime();
        checkoutSessions.current.set(row.session_id, ts);
        if (!purchasedMap.has(row.session_id)) chk++;
      }
      setInCheckout(data.inCheckout ?? chk);

      // Top events
      if (data.topEvents) setTopEvents(data.topEvents);

      // Recent activity for feed
      const feedItems: ActivityItem[] = [];
      for (const row of data.recentActivity || []) {
        feedIdCounter.current++;
        const ts = new Date(row.timestamp);
        if (row.event_type === "add_to_cart") {
          feedItems.push({
            id: `init-${feedIdCounter.current}`,
            type: "add_to_cart",
            title: row.product_name ? `Added ${row.product_name} to cart` : "Added to cart",
            amount: row.product_price ? `£${Number(row.product_price).toFixed(2)}` : undefined,
            timestamp: ts,
            eventName: row.event_name || undefined,
          });
        } else if (row.event_type === "landing") {
          feedItems.push({
            id: `init-${feedIdCounter.current}`,
            type: "page_view",
            title: "Viewing event page",
            timestamp: ts,
            eventName: row.event_name || undefined,
          });
        } else if (row.event_type === "purchase") {
          feedItems.push({
            id: `init-${feedIdCounter.current}`,
            type: "purchase",
            title: "Purchase completed",
            timestamp: ts,
            eventName: row.event_name || undefined,
          });
        } else if (row.event_type === "checkout" || row.event_type === "checkout_start") {
          feedItems.push({
            id: `init-${feedIdCounter.current}`,
            type: "checkout",
            title: "Started checkout",
            timestamp: ts,
            eventName: row.event_name || undefined,
          });
        }
      }
      setActivityFeed(feedItems);

    } catch {
      // Graceful degradation — dashboard shows zeros
    }

    setIsLoading(false);
  }, []);

  /* ── Load top events (included in dashboard API response, polled via loadInitialData) ── */
  const loadTopEvents = useCallback(() => {
    // Top events are now fetched as part of loadInitialData via the API.
    // This callback is kept for the polling interval compatibility.
    loadInitialData();
  }, [loadInitialData]);

  /* ── Setup effect: initial load + realtime + polling ── */
  useEffect(() => {
    loadInitialData();
    loadTopEvents();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Presence recalculation every 30 seconds
    const presenceInterval = setInterval(recalcPresence, 30_000);

    // Top events polling every 60 seconds
    const topEventsInterval = setInterval(loadTopEvents, 60_000);

    // Data polling every 15 seconds — safety net for when Realtime misses events
    // This is the Shopify-style live dashboard pattern: WebSocket for instant,
    // polling to guarantee data freshness regardless of connection state
    const dataRefreshInterval = setInterval(loadInitialData, 15_000);

    // Realtime channel: traffic_events (instant updates between polls)
    const trafficChannel = supabase
      .channel("dashboard-traffic")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.TRAFFIC_EVENTS },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const eventType = row.event_type as string;
          const sessionId = row.session_id as string;
          const eventName = row.event_name as string | undefined;
          const now = Date.now();

          // Update visitor map
          if (sessionId) {
            visitorMap.current.set(sessionId, now);
          }

          // Update funnel (checkout_start counts toward checkout stage)
          const funnelKey = eventType === "checkout_start" ? "checkout" : eventType;
          if (funnelKey in { landing: 1, tickets: 1, add_to_cart: 1, checkout: 1, purchase: 1 }) {
            setFunnel((prev) => ({
              ...prev,
              [funnelKey]: prev[funnelKey as keyof FunnelStats] + 1,
            }));
          }

          // Track active carts
          if (eventType === "add_to_cart" && sessionId) {
            cartSessions.current.set(sessionId, now);
          }

          // Track checkout sessions
          if ((eventType === "checkout" || eventType === "checkout_start") && sessionId) {
            checkoutSessions.current.set(sessionId, now);
          }

          // Track purchases — remove from cart/checkout
          if (eventType === "purchase" && sessionId) {
            purchaseSessions.current.set(sessionId, now);
          }

          // Recalculate presence immediately for cart/checkout/purchase events
          if (["add_to_cart", "checkout", "checkout_start", "purchase"].includes(eventType)) {
            recalcPresence();
          } else if (sessionId) {
            // Just update visitor count for other events
            setActiveVisitors(visitorMap.current.size);
          }

          // Add to activity feed
          if (eventType === "add_to_cart") {
            const productName = row.product_name as string | undefined;
            const productPrice = row.product_price as number | undefined;
            addActivity({
              type: "add_to_cart",
              title: productName ? `Added ${productName} to cart` : "Added to cart",
              amount: productPrice ? `£${Number(productPrice).toFixed(2)}` : undefined,
              timestamp: new Date(),
              eventName: eventName || undefined,
            });
          } else if (eventType === "landing") {
            addActivity({
              type: "page_view",
              title: "Viewing event page",
              timestamp: new Date(),
              eventName: eventName || undefined,
            });
          } else if (eventType === "purchase") {
            addActivity({
              type: "purchase",
              title: "Purchase completed",
              timestamp: new Date(),
              eventName: eventName || undefined,
            });
          } else if (eventType === "checkout" || eventType === "checkout_start") {
            addActivity({
              type: "checkout",
              title: "Started checkout",
              timestamp: new Date(),
              eventName: eventName || undefined,
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Entry] Dashboard traffic realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Entry] Dashboard traffic realtime issue:", status);
        }
      });

    // Realtime channel: orders (instant updates between polls)
    const ordersChannel = supabase
      .channel("dashboard-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.ORDERS },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.org_id !== ORG_ID) return;
          if (row.status !== "completed") return;

          const total = Number(row.total) || 0;
          const orderNumber = row.order_number as string;

          setToday((prev) => {
            const newOrders = prev.orders + 1;
            const newRevenue = prev.revenue + total;
            return {
              ...prev,
              orders: newOrders,
              revenue: newRevenue,
              avgOrderValue: newOrders > 0 ? newRevenue / newOrders : 0,
            };
          });

          addActivity({
            type: "order",
            title: `New order ${orderNumber}`,
            amount: `£${total.toFixed(2)}`,
            timestamp: new Date(),
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Entry] Dashboard orders realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Entry] Dashboard orders realtime issue:", status);
        }
      });

    // Realtime channel: tickets (instant updates between polls)
    const ticketsChannel = supabase
      .channel("dashboard-tickets")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.TICKETS },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.org_id !== ORG_ID) return;

          setToday((prev) => ({
            ...prev,
            ticketsSold: prev.ticketsSold + 1,
          }));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Entry] Dashboard tickets realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Entry] Dashboard tickets realtime issue:", status);
        }
      });

    return () => {
      clearInterval(presenceInterval);
      clearInterval(topEventsInterval);
      clearInterval(dataRefreshInterval);
      supabase.removeChannel(trafficChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(ticketsChannel);
    };
  }, [loadInitialData, loadTopEvents, recalcPresence, addActivity]);

  // Derive conversion rate from funnel for today's KPIs
  const todayWithConversion = useMemo<TodayKPIs>(() => ({
    ...today,
    conversionRate: funnel.landing > 0 ? (funnel.purchase / funnel.landing) * 100 : 0,
  }), [today, funnel]);

  return useMemo<DashboardState>(() => ({
    activeVisitors,
    activeCarts,
    inCheckout,
    today: todayWithConversion,
    yesterday,
    funnel,
    activityFeed,
    topEvents,
    isLoading,
  }), [activeVisitors, activeCarts, inCheckout, todayWithConversion, yesterday, funnel, activityFeed, topEvents, isLoading]);
}
