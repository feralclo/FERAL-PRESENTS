import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, planKey, stripeAccountKey, brandingKey } from "@/lib/constants";
import { PLANS } from "@/lib/plans";
import { calculateApplicationFee } from "@/lib/stripe/config";
import type { OrgPlanSettings } from "@/types/plans";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform/dashboard
 *
 * Platform-owner-only. Returns aggregated cross-tenant metrics
 * for the platform overview dashboard.
 */
export async function GET() {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries
  const [ownersRes, ordersRes, eventsRes, settingsRes, domainsRes] = await Promise.all([
    // All owners (for signup dates + total count)
    supabase
      .from(TABLES.ORG_USERS)
      .select("org_id, email, first_name, last_name, created_at")
      .eq("role", "owner")
      .order("created_at", { ascending: false }),

    // All orders (for GMV + revenue calcs)
    supabase
      .from(TABLES.ORDERS)
      .select("org_id, total, created_at, order_number"),

    // All events (for event counts per org)
    supabase
      .from(TABLES.EVENTS)
      .select("org_id, created_at"),

    // Batch fetch plan + stripe account settings
    // We'll fetch all site_settings and filter client-side since we need dynamic keys
    supabase
      .from(TABLES.SITE_SETTINGS)
      .select("key, data"),

    // All domains (for onboarding check)
    supabase
      .from(TABLES.DOMAINS)
      .select("org_id"),
  ]);

  const owners = ownersRes.data || [];
  const orders = ordersRes.data || [];
  const events = eventsRes.data || [];
  const allSettings = settingsRes.data || [];

  // Build settings map
  const settingsMap = new Map<string, Record<string, unknown>>();
  for (const row of allSettings) {
    if (row.data && typeof row.data === "object") {
      settingsMap.set(row.key, row.data as Record<string, unknown>);
    }
  }

  // Unique org IDs from owners
  const orgIds = [...new Set(owners.map((o) => o.org_id))];

  // --- Tenant counts ---
  const totalTenants = orgIds.length;
  const signupsThisWeek = owners.filter(
    (o) => o.created_at && new Date(o.created_at) >= new Date(weekAgo)
  ).length;
  const signupsThisMonth = owners.filter(
    (o) => o.created_at && new Date(o.created_at) >= new Date(monthAgo)
  ).length;

  // --- Financial metrics ---
  // Build per-org plan lookup
  const getOrgPlanRate = (orgId: string) => {
    const planSettings = settingsMap.get(planKey(orgId)) as OrgPlanSettings | undefined;
    const planId = planSettings?.plan_id ?? "starter";
    return PLANS[planId] ?? PLANS.starter;
  };

  let allTimeGmv = 0;
  let allTimeFees = 0;
  let allTimeOrders = 0;
  let weekGmv = 0;
  let weekFees = 0;
  let weekOrders = 0;
  let monthGmv = 0;
  let monthFees = 0;
  let monthOrders = 0;

  // Per-org GMV aggregation for top tenants
  const orgGmvMap = new Map<string, number>();
  const orgOrderCountMap = new Map<string, number>();

  for (const order of orders) {
    const total = order.total || 0;
    const orgPlan = getOrgPlanRate(order.org_id);
    const fee = calculateApplicationFee(total, orgPlan.fee_percent, orgPlan.min_fee);

    allTimeGmv += total;
    allTimeFees += fee;
    allTimeOrders++;

    orgGmvMap.set(order.org_id, (orgGmvMap.get(order.org_id) || 0) + total);
    orgOrderCountMap.set(order.org_id, (orgOrderCountMap.get(order.org_id) || 0) + 1);

    if (order.created_at && new Date(order.created_at) >= new Date(weekAgo)) {
      weekGmv += total;
      weekFees += fee;
      weekOrders++;
    }
    if (order.created_at && new Date(order.created_at) >= new Date(monthAgo)) {
      monthGmv += total;
      monthFees += fee;
      monthOrders++;
    }
  }

  // --- Onboarding funnel ---
  const orgsWithStripe = orgIds.filter((id) => {
    const stripeData = settingsMap.get(stripeAccountKey(id));
    return stripeData && (stripeData as { account_id?: string }).account_id;
  }).length;

  const orgEventSet = new Set(events.map((e) => e.org_id));
  const orgsWithEvent = orgIds.filter((id) => orgEventSet.has(id)).length;

  const orgOrderSet = new Set(orders.map((o) => o.org_id));
  const orgsWithSale = orgIds.filter((id) => orgOrderSet.has(id)).length;

  // --- Recent signups (last 5) ---
  const recentSignups = owners.slice(0, 5).map((o) => {
    const branding = settingsMap.get(brandingKey(o.org_id)) as { org_name?: string } | undefined;
    return {
      org_id: o.org_id,
      email: o.email,
      name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
      display_name: branding?.org_name || o.org_id,
      created_at: o.created_at,
    };
  });

  // --- Recent orders (last 5) ---
  const sortedOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentOrders = sortedOrders.map((o) => {
    const branding = settingsMap.get(brandingKey(o.org_id)) as { org_name?: string } | undefined;
    return {
      order_number: o.order_number,
      total: o.total,
      org_id: o.org_id,
      display_name: branding?.org_name || o.org_id,
      created_at: o.created_at,
    };
  });

  // --- Top tenants by GMV (top 5) ---
  const topTenants = orgIds
    .map((orgId) => {
      const branding = settingsMap.get(brandingKey(orgId)) as { org_name?: string } | undefined;
      return {
        org_id: orgId,
        display_name: branding?.org_name || orgId,
        gmv: orgGmvMap.get(orgId) || 0,
        orders_count: orgOrderCountMap.get(orgId) || 0,
      };
    })
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  return NextResponse.json({
    tenants: {
      total: totalTenants,
      this_week: signupsThisWeek,
      this_month: signupsThisMonth,
    },
    financial: {
      all_time: { gmv: allTimeGmv, platform_fees: allTimeFees, orders: allTimeOrders },
      this_week: { gmv: weekGmv, platform_fees: weekFees, orders: weekOrders },
      this_month: { gmv: monthGmv, platform_fees: monthFees, orders: monthOrders },
    },
    onboarding_funnel: [
      { label: "Account Created", count: totalTenants },
      { label: "Stripe Connected", count: orgsWithStripe },
      { label: "First Event", count: orgsWithEvent },
      { label: "First Sale", count: orgsWithSale },
    ],
    recent_signups: recentSignups,
    recent_orders: recentOrders,
    top_tenants: topTenants,
  });
}
