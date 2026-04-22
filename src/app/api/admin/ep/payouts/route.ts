import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/ep/payouts
 *
 * Tenant's EP payout history — every Stripe Transfer we've issued to their
 * connected account (and pending / failed attempts). Drives the Payouts
 * subtab of /admin/ep/.
 *
 * Query params:
 *   ?limit=20 (1..100)
 *   ?offset=0
 *
 * Response:
 *   {
 *     data: [ep_tenant_payouts row],
 *     pagination: { limit, offset, has_more, total }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 20 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data, error, count } = await db
      .from("ep_tenant_payouts")
      .select(
        "id, tenant_org_id, ep_amount, platform_cut_bps, fiat_rate_pence, gross_pence, platform_cut_pence, tenant_net_pence, fiat_currency, stripe_transfer_id, period_start, period_end, status, failure_reason, created_at, paid_at",
        { count: "exact" }
      )
      .eq("tenant_org_id", auth.orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      Sentry.captureException(error, { extra: { orgId: auth.orgId } });
      return NextResponse.json(
        { error: "Failed to load payouts" },
        { status: 500 }
      );
    }

    const rows = data ?? [];
    const total = count ?? rows.length;

    return NextResponse.json({
      data: rows,
      pagination: {
        limit,
        offset,
        has_more: offset + rows.length < total,
        total,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/ep/payouts] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
