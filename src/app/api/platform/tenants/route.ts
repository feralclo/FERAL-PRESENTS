import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, planKey, brandingKey, stripeAccountKey } from "@/lib/constants";
import { PLANS } from "@/lib/plans";
import type { OrgPlanSettings } from "@/types/plans";

interface TenantOwner {
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

interface TenantData {
  org_id: string;
  owner: TenantOwner | null;
  team_size: number;
  plan: {
    plan_id: string;
    plan_name: string;
    subscription_status: string | null;
    billing_waived: boolean;
  };
  domain: { hostname: string; type: string } | null;
  branding: { org_name: string | null; logo: string | null } | null;
  stripe_connected: boolean;
  stats: {
    events_count: number;
    orders_count: number;
    total_revenue: number;
  };
  display_name: string;
  signup_date: string | null;
  status: "active" | "setup" | "inactive";
}

/**
 * GET /api/platform/tenants
 *
 * Returns enriched tenant list for the platform owner.
 * Aggregates data from org_users, site_settings, domains, events, and orders.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // 1. Get all distinct org_ids from org_users
  const { data: orgRows, error: orgErr } = await supabase
    .from(TABLES.ORG_USERS)
    .select("org_id")
    .order("org_id");

  if (orgErr) {
    return NextResponse.json({ error: orgErr.message }, { status: 500 });
  }

  const orgIds = [...new Set((orgRows || []).map((r) => r.org_id))];

  if (orgIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // 2. Batch-fetch owner rows (role = "owner") for all orgs
  const { data: ownerRows } = await supabase
    .from(TABLES.ORG_USERS)
    .select("org_id, email, first_name, last_name, created_at")
    .eq("role", "owner")
    .in("org_id", orgIds);

  const ownerMap = new Map<string, TenantOwner>();
  for (const row of ownerRows || []) {
    if (!ownerMap.has(row.org_id)) {
      ownerMap.set(row.org_id, {
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        created_at: row.created_at,
      });
    }
  }

  // 3. Batch-fetch team member counts
  const { data: teamRows } = await supabase
    .from(TABLES.ORG_USERS)
    .select("org_id")
    .in("org_id", orgIds)
    .eq("status", "active");

  const teamCountMap = new Map<string, number>();
  for (const row of teamRows || []) {
    teamCountMap.set(row.org_id, (teamCountMap.get(row.org_id) || 0) + 1);
  }

  // 4. Batch-fetch settings: plans, branding, stripe accounts
  const allSettingsKeys = [
    ...orgIds.map((id) => planKey(id)),
    ...orgIds.map((id) => brandingKey(id)),
    ...orgIds.map((id) => stripeAccountKey(id)),
  ];

  const { data: settingsRows } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("key, data")
    .in("key", allSettingsKeys);

  const settingsMap = new Map<string, Record<string, unknown>>();
  for (const row of settingsRows || []) {
    if (row.data && typeof row.data === "object") {
      settingsMap.set(row.key, row.data as Record<string, unknown>);
    }
  }

  // 5. Batch-fetch primary domains
  const { data: domainRows } = await supabase
    .from(TABLES.DOMAINS)
    .select("org_id, hostname, type")
    .eq("is_primary", true)
    .in("org_id", orgIds);

  const domainMap = new Map<string, { hostname: string; type: string }>();
  for (const row of domainRows || []) {
    domainMap.set(row.org_id, { hostname: row.hostname, type: row.type });
  }

  // 6. Aggregate event counts per org
  const { data: eventRows } = await supabase
    .from(TABLES.EVENTS)
    .select("org_id")
    .in("org_id", orgIds);

  const eventCountMap = new Map<string, number>();
  for (const row of eventRows || []) {
    eventCountMap.set(row.org_id, (eventCountMap.get(row.org_id) || 0) + 1);
  }

  // 7. Aggregate order counts + revenue per org
  const { data: orderRows } = await supabase
    .from(TABLES.ORDERS)
    .select("org_id, total")
    .in("org_id", orgIds);

  const orderCountMap = new Map<string, number>();
  const revenueMap = new Map<string, number>();
  for (const row of orderRows || []) {
    orderCountMap.set(row.org_id, (orderCountMap.get(row.org_id) || 0) + 1);
    revenueMap.set(row.org_id, (revenueMap.get(row.org_id) || 0) + (row.total || 0));
  }

  // 8. Build tenant objects
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const tenants: TenantData[] = orgIds.map((orgId) => {
    const owner = ownerMap.get(orgId) || null;
    const planSettings = settingsMap.get(planKey(orgId)) as OrgPlanSettings | undefined;
    const brandingData = settingsMap.get(brandingKey(orgId));
    const stripeData = settingsMap.get(stripeAccountKey(orgId));
    const domain = domainMap.get(orgId) || null;

    const planId = planSettings?.plan_id ?? "starter";
    const plan = PLANS[planId] ?? PLANS.starter;
    const ordersCount = orderCountMap.get(orgId) || 0;
    const signupDate = owner?.created_at || null;

    // Derive status
    let status: "active" | "setup" | "inactive" = "inactive";
    if (ordersCount > 0) {
      status = "active";
    } else if (signupDate) {
      const age = now - new Date(signupDate).getTime();
      status = age < thirtyDaysMs ? "setup" : "inactive";
    }

    const orgName = brandingData
      ? (brandingData as { org_name?: string }).org_name || null
      : null;
    const logo = brandingData
      ? (brandingData as { logo?: string }).logo || null
      : null;

    return {
      org_id: orgId,
      owner,
      team_size: teamCountMap.get(orgId) || 0,
      plan: {
        plan_id: planId,
        plan_name: plan.name,
        subscription_status: planSettings?.subscription_status || null,
        billing_waived: planSettings?.billing_waived ?? false,
      },
      domain,
      branding: brandingData ? { org_name: orgName, logo } : null,
      stripe_connected: !!(stripeData && (stripeData as { account_id?: string }).account_id),
      stats: {
        events_count: eventCountMap.get(orgId) || 0,
        orders_count: ordersCount,
        total_revenue: revenueMap.get(orgId) || 0,
      },
      display_name: orgName || orgId,
      signup_date: signupDate,
      status,
    };
  });

  // Optional search filter
  const search = request.nextUrl.searchParams.get("search")?.toLowerCase();
  const filtered = search
    ? tenants.filter(
        (t) =>
          t.display_name.toLowerCase().includes(search) ||
          t.org_id.toLowerCase().includes(search) ||
          (t.owner?.email?.toLowerCase().includes(search) ?? false)
      )
    : tenants;

  return NextResponse.json({ data: filtered });
}
