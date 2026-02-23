import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, planKey } from "@/lib/constants";
import { PLANS } from "@/lib/plans";
import type { PlanId, OrgPlanSettings } from "@/types/plans";

/**
 * GET /api/plans
 *
 * Lists all orgs with their plan assignments.
 * Platform owner only.
 */
export async function GET() {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Get all distinct org_ids from org_users
  const { data: orgRows, error: orgErr } = await supabase
    .from(TABLES.ORG_USERS)
    .select("org_id")
    .order("org_id");

  if (orgErr) {
    return NextResponse.json({ error: orgErr.message }, { status: 500 });
  }

  const orgIds = [...new Set((orgRows || []).map((r) => r.org_id))];

  // Fetch plan settings for all orgs
  const planKeys = orgIds.map((id) => planKey(id));
  const { data: planRows } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("key, data")
    .in("key", planKeys);

  const planMap = new Map<string, OrgPlanSettings>();
  for (const row of planRows || []) {
    if (row.data && typeof row.data === "object") {
      // Extract org_id from key pattern "{org_id}_plan"
      const orgId = row.key.replace(/_plan$/, "");
      planMap.set(orgId, row.data as OrgPlanSettings);
    }
  }

  const orgs = orgIds.map((orgId) => {
    const settings = planMap.get(orgId);
    const planId = settings?.plan_id ?? "starter";
    const plan = PLANS[planId] ?? PLANS.starter;
    return {
      org_id: orgId,
      plan_id: planId,
      plan_name: plan.name,
      fee_percent: plan.fee_percent,
      min_fee: plan.min_fee,
      billing_waived: settings?.billing_waived ?? false,
      assigned_at: settings?.assigned_at ?? null,
    };
  });

  return NextResponse.json({ data: orgs, plans: PLANS });
}

/**
 * POST /api/plans
 *
 * Assigns a plan to an org.
 * Platform owner only.
 *
 * Body: { org_id, plan_id, billing_waived? }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const body = await request.json();
  const { org_id, plan_id, billing_waived } = body;

  if (!org_id || !plan_id) {
    return NextResponse.json(
      { error: "Missing required fields: org_id, plan_id" },
      { status: 400 }
    );
  }

  if (!PLANS[plan_id as PlanId]) {
    return NextResponse.json(
      { error: `Invalid plan_id: ${plan_id}` },
      { status: 400 }
    );
  }

  const settings: OrgPlanSettings = {
    plan_id: plan_id as PlanId,
    billing_waived: !!billing_waived,
    assigned_at: new Date().toISOString(),
    assigned_by: auth.user.email,
  };

  const { error } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .upsert(
      {
        key: planKey(org_id),
        data: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: settings });
}
