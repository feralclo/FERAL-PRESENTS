import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { densifyBuckets, type SalesBucket } from "@/lib/sales-velocity";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/events/[id]/overview — analytics dashboard payload.
 *
 * One-shot aggregate that powers the new /admin/events/[slug]/overview/
 * page. Covers everything a host wants when they click on a live event
 * to check "how are we doing?":
 *
 *   - Headline KPIs (total sold/revenue/refunded + capacity progress)
 *   - Trend windows (today, last 7d, prior 7d for week-over-week deltas)
 *   - Sales buckets (same shape as /sales-timeline so the same chart
 *     library can render — single fetch on the overview page)
 *   - Per-tier breakdown with last-sold-at + rolling 7d velocity
 *   - Recent orders (last 10 completed)
 *   - Payment-method split (count + revenue)
 *   - Funnel (page views → cart started → paid) over 30d
 *   - Top sources (referrer + utm_source) over 30d
 *
 * Org-scoped via requireAuth. Drafts return zero-shaped data — the page
 * just renders an "events isn't live yet" panel.
 */

const DAY_MS = 1000 * 60 * 60 * 24;

interface OrderItemRow {
  qty: number | null;
  unit_price: number | null;
  ticket_type_id: string | null;
  created_at: string;
  order: {
    id: string;
    event_id: string;
    status: string;
    currency: string;
    payment_method: string | null;
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const { id: eventId } = await context.params;
    if (!eventId) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Verify org ownership before any data reads.
    const { data: ev, error: evErr } = await supabase
      .from(TABLES.EVENTS)
      .select(
        "id, name, slug, status, date_start, date_end, currency, capacity, payment_method"
      )
      .eq("id", eventId)
      .eq("org_id", orgId)
      .single();
    if (evErr || !ev) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // ── Ticket types (always — even unsold tiers should appear) ──────
    const { data: ticketTypeRows } = await supabase
      .from(TABLES.TICKET_TYPES)
      .select("id, name, sold, capacity, price, sort_order, status")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });

    // ── Order items joined with completed orders ─────────────────────
    // Pull everything once, then fold in JS — keeps the SQL simple and
    // lets us compute multiple time-window aggregates from one read.
    const { data: itemsRaw } = await supabase
      .from(TABLES.ORDER_ITEMS)
      .select(
        "qty, unit_price, ticket_type_id, created_at, order:orders!inner(id, event_id, status, currency, payment_method)"
      )
      .eq("org_id", orgId)
      .eq("order.event_id", eventId)
      .eq("order.status", "completed");

    const items: OrderItemRow[] = (itemsRaw ?? []) as unknown as OrderItemRow[];

    // ── Headline + windows ───────────────────────────────────────────
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();
    const last7Cut = now - 7 * DAY_MS;
    const prev7Start = now - 14 * DAY_MS;

    let totalSold = 0;
    let totalRevenue = 0;
    let todaySold = 0;
    let todayRevenue = 0;
    let last7Sold = 0;
    let last7Revenue = 0;
    let prev7Sold = 0;
    let prev7Revenue = 0;
    const paidOrderIds = new Set<string>();
    const perMethodCount = new Map<string, number>();
    const perMethodRevenue = new Map<string, number>();
    const perTierAgg = new Map<
      string,
      { sold: number; revenue: number; lastAt: string | null; per7d: number }
    >();

    // Sales bucket folding — same shape as the existing sales-timeline
    // endpoint so the client can re-use buildTimelineSeries / velocity.
    const bucketMap = new Map<string, SalesBucket>();

    for (const row of items) {
      const qty = Number(row.qty ?? 0);
      const unit = Number(row.unit_price ?? 0);
      const lineRevenue = qty * unit;
      const orderRow = row.order;
      const created = new Date(row.created_at).getTime();
      const tierId = row.ticket_type_id;

      // Per-tier rolls — tickets only (skip merch-only items).
      if (tierId) {
        let agg = perTierAgg.get(tierId);
        if (!agg) {
          agg = { sold: 0, revenue: 0, lastAt: null, per7d: 0 };
          perTierAgg.set(tierId, agg);
        }
        agg.sold += qty;
        agg.revenue += lineRevenue;
        if (!agg.lastAt || row.created_at > agg.lastAt) {
          agg.lastAt = row.created_at;
        }
        if (created >= last7Cut) agg.per7d += qty;

        // Sales buckets, by UTC date string.
        const date = String(row.created_at).slice(0, 10);
        let bucket = bucketMap.get(date);
        if (!bucket) {
          bucket = { date, perTicket: {} };
          bucketMap.set(date, bucket);
        }
        const existing = bucket.perTicket[tierId];
        if (existing) {
          existing.qty += qty;
          existing.revenue += lineRevenue;
        } else {
          bucket.perTicket[tierId] = { qty, revenue: lineRevenue };
        }
      }

      // Headline + windows count *all* completed line items including
      // merch — the host cares about total revenue, not just tickets.
      totalSold += qty;
      totalRevenue += lineRevenue;
      if (created >= startOfTodayMs) {
        todaySold += qty;
        todayRevenue += lineRevenue;
      }
      if (created >= last7Cut) {
        last7Sold += qty;
        last7Revenue += lineRevenue;
      } else if (created >= prev7Start) {
        prev7Sold += qty;
        prev7Revenue += lineRevenue;
      }

      // Order id de-dup for paid_orders count.
      if (orderRow?.id) paidOrderIds.add(orderRow.id);

      // Payment-method aggregates (only count each order once for the
      // count, but accumulate revenue per line — gives correct totals
      // and a sane `count` per method).
      const pm = orderRow?.payment_method || "unknown";
      perMethodRevenue.set(pm, (perMethodRevenue.get(pm) ?? 0) + lineRevenue);
    }

    // Count unique orders per payment method by re-walking the rows.
    const seenOrderForMethod = new Set<string>();
    for (const row of items) {
      const pm = row.order?.payment_method || "unknown";
      const key = `${row.order?.id}::${pm}`;
      if (seenOrderForMethod.has(key)) continue;
      seenOrderForMethod.add(key);
      perMethodCount.set(pm, (perMethodCount.get(pm) ?? 0) + 1);
    }

    const sparseBuckets = Array.from(bucketMap.values()).sort((a, b) =>
      a.date < b.date ? -1 : 1
    );
    const buckets = densifyBuckets(sparseBuckets);

    // Per-tier projection — annotate the ticket_types list rather than
    // emitting a separate per-tier array, so the client always renders
    // every tier (sold or not) in sort order.
    const ticketTypes = (ticketTypeRows ?? []).map((tt) => {
      const agg = perTierAgg.get(tt.id as string) ?? {
        sold: 0,
        revenue: 0,
        lastAt: null,
        per7d: 0,
      };
      const capacityNum =
        tt.capacity == null ? null : Number(tt.capacity);
      return {
        id: tt.id as string,
        name: tt.name as string,
        sort_order: Number(tt.sort_order ?? 0),
        status: (tt.status as string) ?? "active",
        price: Number(tt.price ?? 0),
        capacity: capacityNum,
        sold: Number(tt.sold ?? agg.sold),
        revenue_completed: agg.revenue,
        last_sold_at: agg.lastAt,
        per_day_7d: agg.per7d / 7,
        sellthrough_pct:
          capacityNum != null && capacityNum > 0
            ? Math.min(
                100,
                Math.round((Number(tt.sold ?? agg.sold) / capacityNum) * 100)
              )
            : null,
      };
    });

    // ── Refunded revenue (separate query, lightweight) ───────────────
    const { data: refundedRows } = await supabase
      .from(TABLES.ORDERS)
      .select("total")
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .eq("status", "refunded");
    const refundedRevenue = (refundedRows ?? []).reduce(
      (acc, r) => acc + Number(r.total ?? 0),
      0
    );

    // ── Recent orders (last 10 completed) ────────────────────────────
    const { data: recentOrderRows } = await supabase
      .from(TABLES.ORDERS)
      .select(
        "id, order_number, total, currency, customer_email, customer_name, payment_method, created_at, order_items(qty, ticket_type_id)"
      )
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(10);

    const tierNameById = new Map<string, string>();
    for (const tt of ticketTypeRows ?? []) {
      tierNameById.set(tt.id as string, tt.name as string);
    }

    type RecentOrderItem = { qty: number | null; ticket_type_id: string | null };
    const recentOrders = (recentOrderRows ?? []).map((o) => {
      const tierCounts = new Map<string, number>();
      const items = (o.order_items as RecentOrderItem[] | null) ?? [];
      for (const it of items) {
        const tierId = it.ticket_type_id ?? null;
        if (!tierId) continue;
        const name = tierNameById.get(tierId) ?? "Ticket";
        tierCounts.set(name, (tierCounts.get(name) ?? 0) + Number(it.qty ?? 0));
      }
      const tier_summary = Array.from(tierCounts.entries())
        .map(([name, qty]) => `${qty}× ${name}`)
        .join(", ") || "Ticket";
      return {
        id: o.id as string,
        order_number: o.order_number as string,
        total: Number(o.total ?? 0),
        currency: (o.currency as string) ?? ev.currency ?? "GBP",
        customer_name:
          (o.customer_name as string | null) ||
          (o.customer_email as string | null) ||
          "Anonymous",
        payment_method: (o.payment_method as string | null) || "unknown",
        created_at: o.created_at as string,
        tier_summary,
      };
    });

    // ── Funnel (last 30 days) ────────────────────────────────────────
    const cut30 = new Date(now - 30 * DAY_MS).toISOString();
    const slugPath = `/event/${ev.slug}`;

    const [
      { count: pageviews },
      { count: cartStarted },
      { count: paidOrders30 },
    ] = await Promise.all([
      supabase
        .from(TABLES.TRAFFIC_EVENTS)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("event_type", "pageview")
        .like("page_path", `${slugPath}%`)
        .gte("created_at", cut30),
      supabase
        .from(TABLES.ABANDONED_CARTS)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .gte("created_at", cut30),
      supabase
        .from(TABLES.ORDERS)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .eq("status", "completed")
        .gte("created_at", cut30),
    ]);

    const funnel = {
      page_views: pageviews ?? 0,
      cart_started: cartStarted ?? 0,
      paid: paidOrders30 ?? 0,
      // % page views that converted to a paid order.
      conversion_pct:
        pageviews && pageviews > 0
          ? Math.round(((paidOrders30 ?? 0) / pageviews) * 1000) / 10
          : null,
    };

    // ── Sources (last 30 days) ───────────────────────────────────────
    const { data: trafficRows } = await supabase
      .from(TABLES.TRAFFIC_EVENTS)
      .select("referrer, utm_source")
      .eq("org_id", orgId)
      .eq("event_type", "pageview")
      .like("page_path", `${slugPath}%`)
      .gte("created_at", cut30);

    const refCounts = new Map<string, number>();
    const utmCounts = new Map<string, number>();
    for (const t of trafficRows ?? []) {
      const ref = (t.referrer as string | null)?.trim() || "Direct";
      // Normalise referrer to host so multiple deep paths from the same
      // site don't dilute the chart.
      let host = ref;
      try {
        if (ref !== "Direct") host = new URL(ref).hostname || ref;
      } catch {
        /* keep raw */
      }
      refCounts.set(host, (refCounts.get(host) ?? 0) + 1);

      const utm = (t.utm_source as string | null)?.trim();
      if (utm) utmCounts.set(utm, (utmCounts.get(utm) ?? 0) + 1);
    }

    const referrers = Array.from(refCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([referrer, count]) => ({ referrer, count }));
    const utm_sources = Array.from(utmCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([utm_source, count]) => ({ utm_source, count }));

    // ── Payment methods (sorted by revenue desc) ─────────────────────
    const payment_methods = Array.from(perMethodCount.keys())
      .map((method) => ({
        method,
        count: perMethodCount.get(method) ?? 0,
        revenue: perMethodRevenue.get(method) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      event: {
        id: ev.id,
        name: ev.name,
        slug: ev.slug,
        status: ev.status,
        date_start: ev.date_start,
        date_end: ev.date_end,
        currency: ev.currency || "GBP",
        capacity: ev.capacity ?? null,
        payment_method: ev.payment_method,
      },
      generatedAt: new Date().toISOString(),
      totals: {
        sold: totalSold,
        revenue: totalRevenue,
        refunded_revenue: refundedRevenue,
        capacity:
          ev.capacity ??
          (ticketTypes.every((t) => t.capacity != null)
            ? ticketTypes.reduce((acc, t) => acc + (t.capacity ?? 0), 0)
            : null),
        paid_orders: paidOrderIds.size,
      },
      windows: {
        today: { sold: todaySold, revenue: todayRevenue },
        last_7d: { sold: last7Sold, revenue: last7Revenue },
        prev_7d: { sold: prev7Sold, revenue: prev7Revenue },
      },
      buckets,
      ticketTypes,
      recent_orders: recentOrders,
      payment_methods,
      funnel,
      sources: { referrers, utm_sources },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
