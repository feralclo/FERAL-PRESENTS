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

function todayStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function yesterdayRange(): { start: string; end: string } {
  const now = new Date();
  const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start: yStart.toISOString(), end: yEnd.toISOString() };
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

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

  /* ── Initial data load ── */
  const loadInitialData = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) { setIsLoading(false); return; }

    const todayStr = todayStart();
    const yRange = yesterdayRange();

    try {
      // Run all queries in parallel
      const [
        // Today's orders
        ordersRes,
        // Today's tickets
        ticketsRes,
        // Yesterday's orders
        yOrdersRes,
        // Yesterday's tickets
        yTicketsRes,
        // Funnel counts (today)
        landingRes,
        ticketsViewRes,
        addToCartRes,
        checkoutRes,
        purchaseRes,
        // Yesterday landing + purchase for conv rate
        yLandingRes,
        yPurchaseRes,
        // Active visitors (sessions in last 5 min)
        recentSessionsRes,
        // Active carts (add_to_cart in last 15 min)
        recentCartsRes,
        // Recent purchases (last 15 min) to exclude from carts
        recentPurchasesRes,
        // Recent checkouts (last 10 min)
        recentCheckoutsRes,
        // Recent activity for feed
        recentActivityRes,
      ] = await Promise.all([
        supabase.from(TABLES.ORDERS).select("id, total, status").eq("org_id", ORG_ID).eq("status", "completed").gte("created_at", todayStr),
        supabase.from(TABLES.TICKETS).select("*", { count: "exact", head: true }).eq("org_id", ORG_ID).gte("created_at", todayStr),
        supabase.from(TABLES.ORDERS).select("id, total, status").eq("org_id", ORG_ID).eq("status", "completed").gte("created_at", yRange.start).lt("created_at", yRange.end),
        supabase.from(TABLES.TICKETS).select("*", { count: "exact", head: true }).eq("org_id", ORG_ID).gte("created_at", yRange.start).lt("created_at", yRange.end),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "landing").gte("timestamp", todayStr),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "tickets").gte("timestamp", todayStr),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "add_to_cart").gte("timestamp", todayStr),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "checkout").gte("timestamp", todayStr),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "purchase").gte("timestamp", todayStr),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "landing").gte("timestamp", yRange.start).lt("timestamp", yRange.end),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "purchase").gte("timestamp", yRange.start).lt("timestamp", yRange.end),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id").gte("timestamp", minutesAgo(5)),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id, timestamp").eq("event_type", "add_to_cart").gte("timestamp", minutesAgo(15)),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id").eq("event_type", "purchase").gte("timestamp", minutesAgo(15)),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id, timestamp").in("event_type", ["checkout", "checkout_start"]).gte("timestamp", minutesAgo(10)),
        supabase.from(TABLES.TRAFFIC_EVENTS).select("event_type, event_name, product_name, product_price, product_qty, timestamp").gte("timestamp", minutesAgo(30)).order("timestamp", { ascending: false }).limit(20),
      ]);

      // Process today's KPIs
      const todayOrders = ordersRes.data || [];
      const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total), 0);
      const todayOrderCount = todayOrders.length;
      const todayTicketCount = ticketsRes.count || 0;

      // Process yesterday's KPIs
      const yOrders = yOrdersRes.data || [];
      const yRevenue = yOrders.reduce((s, o) => s + Number(o.total), 0);
      const yOrderCount = yOrders.length;
      const yTicketCount = yTicketsRes.count || 0;

      // Funnel
      const funnelData: FunnelStats = {
        landing: landingRes.count || 0,
        tickets: ticketsViewRes.count || 0,
        add_to_cart: addToCartRes.count || 0,
        checkout: checkoutRes.count || 0,
        purchase: purchaseRes.count || 0,
      };

      // Conversion rates
      const todayConvRate = funnelData.landing > 0 ? (funnelData.purchase / funnelData.landing) * 100 : 0;
      const yLanding = yLandingRes.count || 0;
      const yPurchase = yPurchaseRes.count || 0;
      const yConvRate = yLanding > 0 ? (yPurchase / yLanding) * 100 : 0;

      setToday({
        revenue: todayRevenue,
        orders: todayOrderCount,
        ticketsSold: todayTicketCount,
        avgOrderValue: todayOrderCount > 0 ? todayRevenue / todayOrderCount : 0,
        conversionRate: todayConvRate,
      });

      setYesterday({
        revenue: yRevenue,
        orders: yOrderCount,
        ticketsSold: yTicketCount,
        avgOrderValue: yOrderCount > 0 ? yRevenue / yOrderCount : 0,
        conversionRate: yConvRate,
      });

      setFunnel(funnelData);

      // Active visitors
      const uniqueSessions = new Set((recentSessionsRes.data || []).map((r) => r.session_id));
      const now = Date.now();
      for (const sid of uniqueSessions) {
        visitorMap.current.set(sid, now);
      }
      setActiveVisitors(uniqueSessions.size);

      // Active carts
      const purchasedMap = new Map<string, number>();
      for (const r of recentPurchasesRes.data || []) {
        purchasedMap.set(r.session_id, now);
      }
      purchaseSessions.current = purchasedMap;
      let carts = 0;
      for (const row of recentCartsRes.data || []) {
        const ts = new Date(row.timestamp).getTime();
        cartSessions.current.set(row.session_id, ts);
        if (!purchasedMap.has(row.session_id)) carts++;
      }
      setActiveCarts(carts);

      // In checkout
      let chk = 0;
      for (const row of recentCheckoutsRes.data || []) {
        const ts = new Date(row.timestamp).getTime();
        checkoutSessions.current.set(row.session_id, ts);
        if (!purchasedMap.has(row.session_id)) chk++;
      }
      setInCheckout(chk);

      // Recent activity for feed
      const feedItems: ActivityItem[] = [];
      for (const row of recentActivityRes.data || []) {
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

  /* ── Load top events (polled) ── */
  const loadTopEvents = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const todayStr = todayStart();

    try {
      // Get event views today
      const { data: viewRows } = await supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("event_name")
        .eq("event_type", "landing")
        .gte("timestamp", todayStr);

      // Get orders today
      const { data: orderRows } = await supabase
        .from(TABLES.ORDERS)
        .select("event_id, total, event:events(name, slug)")
        .eq("org_id", ORG_ID)
        .eq("status", "completed")
        .gte("created_at", todayStr);

      // Get event name → slug mapping
      const { data: events } = await supabase
        .from(TABLES.EVENTS)
        .select("name, slug")
        .eq("org_id", ORG_ID);

      const slugMap = new Map((events || []).map((e) => [e.name, e.slug]));

      // Count views by event_name
      const viewCounts = new Map<string, number>();
      for (const row of viewRows || []) {
        if (row.event_name) {
          viewCounts.set(row.event_name, (viewCounts.get(row.event_name) || 0) + 1);
        }
      }

      // Count sales/revenue by event
      const salesMap = new Map<string, { sales: number; revenue: number; name: string; slug: string }>();
      for (const row of orderRows || []) {
        const ev = row.event as { name?: string; slug?: string } | null;
        if (ev?.slug) {
          const existing = salesMap.get(ev.slug) || { sales: 0, revenue: 0, name: ev.name || "", slug: ev.slug };
          existing.sales++;
          existing.revenue += Number(row.total);
          salesMap.set(ev.slug, existing);
        }
      }

      // Merge views + sales into top events
      const allSlugs = new Set<string>();
      for (const [name] of viewCounts) {
        const slug = slugMap.get(name);
        if (slug) allSlugs.add(slug);
      }
      for (const [slug] of salesMap) {
        allSlugs.add(slug);
      }

      const result: TopEventRow[] = [];
      for (const slug of allSlugs) {
        const salesData = salesMap.get(slug);
        // Find event name from slug
        const eventName = salesData?.name || [...slugMap.entries()].find(([, s]) => s === slug)?.[0] || slug;
        const views = viewCounts.get(eventName) || viewCounts.get(slug) || 0;

        result.push({
          eventName,
          eventSlug: slug,
          views,
          sales: salesData?.sales || 0,
          revenue: salesData?.revenue || 0,
        });
      }

      // Sort by views descending, take top 5
      result.sort((a, b) => b.views - a.views);
      setTopEvents(result.slice(0, 5));
    } catch {
      // Fail silently
    }
  }, []);

  /* ── Setup effect: initial load + realtime + intervals ── */
  useEffect(() => {
    loadInitialData();
    loadTopEvents();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Presence recalculation every 30 seconds
    const presenceInterval = setInterval(recalcPresence, 30_000);

    // Top events polling every 60 seconds
    const topEventsInterval = setInterval(loadTopEvents, 60_000);

    // Realtime channel: traffic_events
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
      .subscribe();

    // Realtime channel: orders
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
      .subscribe();

    // Realtime channel: tickets
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
      .subscribe();

    return () => {
      clearInterval(presenceInterval);
      clearInterval(topEventsInterval);
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
