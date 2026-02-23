import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, planKey, brandingKey, stripeAccountKey } from "@/lib/constants";
import { PLANS } from "@/lib/plans";
import { calculateApplicationFee } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import type { OrgPlanSettings } from "@/types/plans";

/**
 * GET /api/platform/tenants/[orgId]
 *
 * Returns enriched detail for a single tenant. Platform owner only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const { orgId } = await params;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Parallel queries
  const [
    orgUsersRes,
    settingsRes,
    domainsRes,
    eventsRes,
    ordersRes,
  ] = await Promise.all([
    supabase
      .from(TABLES.ORG_USERS)
      .select("auth_user_id, email, first_name, last_name, role, status, perm_events, perm_orders, perm_marketing, perm_finance, created_at")
      .eq("org_id", orgId),
    supabase
      .from(TABLES.SITE_SETTINGS)
      .select("key, data")
      .in("key", [planKey(orgId), brandingKey(orgId), stripeAccountKey(orgId)]),
    supabase
      .from(TABLES.DOMAINS)
      .select("id, hostname, type, status, is_primary, created_at")
      .eq("org_id", orgId),
    supabase
      .from(TABLES.EVENTS)
      .select("id, name, slug, status, venue_name, date_start, created_at")
      .eq("org_id", orgId)
      .order("date_start", { ascending: false }),
    supabase
      .from(TABLES.ORDERS)
      .select("id, order_number, total, status, created_at, event_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
  ]);

  // 404 if org doesn't exist
  if (!orgUsersRes.data || orgUsersRes.data.length === 0) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const teamMembers = orgUsersRes.data;
  const owner = teamMembers.find((m) => m.role === "owner") || null;
  const domains = domainsRes.data || [];
  const events = eventsRes.data || [];
  const orders = ordersRes.data || [];

  // Parse settings
  const settingsMap = new Map<string, Record<string, unknown>>();
  for (const row of settingsRes.data || []) {
    if (row.data && typeof row.data === "object") {
      settingsMap.set(row.key, row.data as Record<string, unknown>);
    }
  }

  const planSettings = settingsMap.get(planKey(orgId)) as OrgPlanSettings | undefined;
  const brandingData = settingsMap.get(brandingKey(orgId));
  const stripeData = settingsMap.get(stripeAccountKey(orgId));

  const planId = planSettings?.plan_id ?? "starter";
  const plan = PLANS[planId] ?? PLANS.starter;

  // Stripe account details
  const stripeAccountId = stripeData
    ? (stripeData as { account_id?: string }).account_id || null
    : null;

  let stripeAccount: {
    account_id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  } | null = null;

  if (stripeAccountId && stripe) {
    try {
      const acct = await stripe.accounts.retrieve(stripeAccountId);
      stripeAccount = {
        account_id: stripeAccountId,
        charges_enabled: acct.charges_enabled ?? false,
        payouts_enabled: acct.payouts_enabled ?? false,
        details_submitted: acct.details_submitted ?? false,
      };
    } catch {
      // Stripe unreachable or account invalid — return partial info
      stripeAccount = {
        account_id: stripeAccountId,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      };
    }
  }

  // Onboarding checklist
  const onboarding = {
    account_created: true,
    stripe_connected: !!stripeAccountId,
    stripe_kyc_complete: stripeAccount?.details_submitted ?? false,
    first_event: events.length > 0,
    first_sale: orders.length > 0,
  };

  // Revenue + estimated platform fees
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const estimatedFees = orders.reduce(
    (sum, o) => sum + calculateApplicationFee(o.total || 0, plan.fee_percent, plan.min_fee),
    0
  );

  // Find last order date
  const lastOrderDate = orders.length > 0 ? orders[0].created_at : null;

  const orgName = brandingData
    ? (brandingData as { org_name?: string }).org_name || null
    : null;
  const logo = brandingData
    ? (brandingData as { logo?: string }).logo || null
    : null;

  const primaryDomain = domains.find((d) => d.is_primary);

  return NextResponse.json({
    data: {
      org_id: orgId,
      display_name: orgName || orgId,
      logo,
      signup_date: owner?.created_at || null,
      primary_domain: primaryDomain
        ? { hostname: primaryDomain.hostname, type: primaryDomain.type }
        : null,
      onboarding,
      plan: {
        plan_id: planId,
        plan_name: plan.name,
        fee_percent: plan.fee_percent,
        min_fee: plan.min_fee,
        card_rate_label: plan.card_rate_label,
        subscription_status: planSettings?.subscription_status || null,
        billing_waived: planSettings?.billing_waived ?? false,
      },
      stripe: stripeAccount,
      stats: {
        events_count: events.length,
        orders_count: orders.length,
        total_revenue: totalRevenue,
        estimated_fees: estimatedFees,
        last_order_date: lastOrderDate,
      },
      team: teamMembers.map((m) => ({
        email: m.email,
        first_name: m.first_name,
        last_name: m.last_name,
        role: m.role,
        status: m.status,
        perm_events: m.perm_events,
        perm_orders: m.perm_orders,
        perm_marketing: m.perm_marketing,
        perm_finance: m.perm_finance,
      })),
      domains: domains.map((d) => ({
        id: d.id,
        hostname: d.hostname,
        type: d.type,
        status: d.status,
        is_primary: d.is_primary,
      })),
      recent_events: events.slice(0, 5).map((e) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        status: e.status,
        venue_name: e.venue_name,
        date_start: e.date_start,
      })),
      recent_orders: orders.slice(0, 5).map((o) => ({
        id: o.id,
        order_number: o.order_number,
        total: o.total,
        status: o.status,
        created_at: o.created_at,
        event_id: o.event_id,
      })),
    },
  });
}
