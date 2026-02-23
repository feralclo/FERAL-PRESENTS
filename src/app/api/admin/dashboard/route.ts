import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/admin/dashboard — Dashboard stats (bypasses RLS via service role key)
 *
 * Returns all the data needed by the live dashboard:
 * - Today's and yesterday's KPIs (orders, revenue, tickets)
 * - Funnel counts (landing → tickets → add_to_cart → checkout → purchase)
 * - Active visitors / carts / checkout sessions
 * - Recent activity feed
 * - Top events
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const now = new Date();
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
    const yEnd = todayStr;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const [
      ordersRes,
      ticketsRes,
      yOrdersRes,
      yTicketsRes,
      landingRes,
      ticketsViewRes,
      addToCartRes,
      checkoutRes,
      purchaseRes,
      yLandingRes,
      yPurchaseRes,
      recentSessionsRes,
      recentCartsRes,
      recentPurchasesRes,
      recentCheckoutsRes,
      recentActivityRes,
    ] = await Promise.all([
      supabase.from(TABLES.ORDERS).select("id, total, status").eq("org_id", orgId).eq("status", "completed").gte("created_at", todayStr),
      supabase.from(TABLES.TICKETS).select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", todayStr),
      supabase.from(TABLES.ORDERS).select("id, total, status").eq("org_id", orgId).eq("status", "completed").gte("created_at", yStart).lt("created_at", yEnd),
      supabase.from(TABLES.TICKETS).select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", yStart).lt("created_at", yEnd),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "landing").gte("timestamp", todayStr),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "tickets").gte("timestamp", todayStr),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "add_to_cart").gte("timestamp", todayStr),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "checkout").gte("timestamp", todayStr),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "purchase").gte("timestamp", todayStr),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "landing").gte("timestamp", yStart).lt("timestamp", yEnd),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("*", { count: "exact", head: true }).eq("event_type", "purchase").gte("timestamp", yStart).lt("timestamp", yEnd),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id").gte("timestamp", fiveMinAgo),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id, timestamp").eq("event_type", "add_to_cart").gte("timestamp", fifteenMinAgo),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id").eq("event_type", "purchase").gte("timestamp", fifteenMinAgo),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("session_id, timestamp").in("event_type", ["checkout", "checkout_start"]).gte("timestamp", tenMinAgo),
      supabase.from(TABLES.TRAFFIC_EVENTS).select("event_type, event_name, product_name, product_price, product_qty, timestamp").gte("timestamp", thirtyMinAgo).order("timestamp", { ascending: false }).limit(20),
    ]);

    // Today's KPIs
    const todayOrders = ordersRes.data || [];
    const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total), 0);
    const todayOrderCount = todayOrders.length;
    const todayTicketCount = ticketsRes.count || 0;

    // Yesterday's KPIs
    const yOrders = yOrdersRes.data || [];
    const yRevenue = yOrders.reduce((s, o) => s + Number(o.total), 0);
    const yOrderCount = yOrders.length;
    const yTicketCount = yTicketsRes.count || 0;

    // Funnel
    const funnel = {
      landing: landingRes.count || 0,
      tickets: ticketsViewRes.count || 0,
      add_to_cart: addToCartRes.count || 0,
      checkout: checkoutRes.count || 0,
      purchase: purchaseRes.count || 0,
    };

    // Conversion
    const todayConvRate = funnel.landing > 0 ? (funnel.purchase / funnel.landing) * 100 : 0;
    const yLanding = yLandingRes.count || 0;
    const yPurchase = yPurchaseRes.count || 0;
    const yConvRate = yLanding > 0 ? (yPurchase / yLanding) * 100 : 0;

    // Active visitors (unique sessions in last 5 min)
    const uniqueSessions = new Set((recentSessionsRes.data || []).map((r) => r.session_id));

    // Active carts (add_to_cart in last 15 min, minus purchases)
    const purchasedSessions = new Set((recentPurchasesRes.data || []).map((r) => r.session_id));
    let activeCarts = 0;
    for (const row of recentCartsRes.data || []) {
      if (!purchasedSessions.has(row.session_id)) activeCarts++;
    }

    // In checkout (last 10 min, minus purchases)
    let inCheckout = 0;
    for (const row of recentCheckoutsRes.data || []) {
      if (!purchasedSessions.has(row.session_id)) inCheckout++;
    }

    // Top events
    const { data: viewRows } = await supabase
      .from(TABLES.TRAFFIC_EVENTS)
      .select("event_name")
      .eq("event_type", "landing")
      .gte("timestamp", todayStr);

    const { data: orderRows } = await supabase
      .from(TABLES.ORDERS)
      .select("event_id, total, event:events(name, slug)")
      .eq("org_id", orgId)
      .eq("status", "completed")
      .gte("created_at", todayStr);

    const { data: events } = await supabase
      .from(TABLES.EVENTS)
      .select("name, slug, date_start")
      .eq("org_id", orgId);

    const slugMap = new Map((events || []).map((e: { name: string; slug: string }) => [e.name, e.slug]));

    // Build slug→display name map for resolving activity feed event names
    const slugToDisplay = new Map<string, string>();
    for (const e of events || []) {
      const ev = e as { name: string; slug: string; date_start?: string };
      let display = ev.name;
      if (ev.date_start) {
        const d = new Date(ev.date_start);
        display += ` - ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
      }
      slugToDisplay.set(ev.slug, display);
    }
    const viewCounts = new Map<string, number>();
    for (const row of viewRows || []) {
      if (row.event_name) {
        viewCounts.set(row.event_name, (viewCounts.get(row.event_name) || 0) + 1);
      }
    }

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

    const allSlugs = new Set<string>();
    for (const [name] of viewCounts) {
      const slug = slugMap.get(name);
      if (slug) allSlugs.add(slug);
    }
    for (const [slug] of salesMap) allSlugs.add(slug);

    const topEvents = [];
    for (const slug of allSlugs) {
      const salesData = salesMap.get(slug);
      const eventName = salesData?.name || [...slugMap.entries()].find(([, s]) => s === slug)?.[0] || slug;
      const views = viewCounts.get(eventName) || viewCounts.get(slug) || 0;
      topEvents.push({ eventName, eventSlug: slug, views, sales: salesData?.sales || 0, revenue: salesData?.revenue || 0 });
    }
    topEvents.sort((a, b) => b.views - a.views);

    // Resolve slugs to display names in recent activity
    const recentActivity = (recentActivityRes.data || []).map((row) => ({
      ...row,
      event_name: row.event_name
        ? slugToDisplay.get(row.event_name) || row.event_name
        : row.event_name,
    }));

    // Build serializable slug→name map for frontend realtime resolution
    const eventSlugMap: Record<string, string> = {};
    for (const [slug, display] of slugToDisplay) {
      eventSlugMap[slug] = display;
    }

    return NextResponse.json({
      today: {
        revenue: todayRevenue,
        orders: todayOrderCount,
        ticketsSold: todayTicketCount,
        avgOrderValue: todayOrderCount > 0 ? todayRevenue / todayOrderCount : 0,
        conversionRate: todayConvRate,
      },
      yesterday: {
        revenue: yRevenue,
        orders: yOrderCount,
        ticketsSold: yTicketCount,
        avgOrderValue: yOrderCount > 0 ? yRevenue / yOrderCount : 0,
        conversionRate: yConvRate,
      },
      funnel,
      activeVisitors: uniqueSessions.size,
      activeCarts,
      inCheckout,
      recentActivity,
      recentSessions: recentSessionsRes.data || [],
      recentCartSessions: recentCartsRes.data || [],
      recentPurchaseSessions: recentPurchasesRes.data || [],
      recentCheckoutSessions: recentCheckoutsRes.data || [],
      topEvents: topEvents.slice(0, 5),
      eventSlugMap,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
