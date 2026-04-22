import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/ep/ledger
 *
 * Paginated view of the tenant's EP ledger entries — every movement in or
 * out of their float + earned pots, in descending chronological order.
 * Drives the Ledger subtab of /admin/ep/.
 *
 * Query params:
 *   ?limit=50 (1..200)
 *   ?offset=0
 *   ?entry_type=tenant_purchase,rep_shop_debit,... comma-separated filter
 *
 * Response:
 *   {
 *     data: [{ id, created_at, entry_type, ep_amount, fiat_rate_pence,
 *              notes, signed_float_delta, signed_earned_delta,
 *              rep_id, rep_display_name, quest_submission_id,
 *              reward_claim_id, ep_purchase_id, payout_id }],
 *     pagination: { limit, offset, has_more, total }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.max(1, Math.min(200, isNaN(rawLimit) ? 50 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const entryTypeFilter = url.searchParams.get("entry_type");
    const entryTypes = entryTypeFilter
      ? entryTypeFilter.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    let query = db
      .from("ep_ledger")
      .select(
        "id, created_at, entry_type, ep_amount, fiat_rate_pence, notes, rep_id, quest_submission_id, reward_claim_id, ep_purchase_id, payout_id",
        { count: "exact" }
      )
      .eq("tenant_org_id", auth.orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (entryTypes && entryTypes.length > 0) {
      query = query.in("entry_type", entryTypes);
    }

    const { data, error, count } = await query;

    if (error) {
      Sentry.captureException(error, { extra: { orgId: auth.orgId } });
      return NextResponse.json(
        { error: "Failed to load ledger" },
        { status: 500 }
      );
    }

    type LedgerRow = {
      id: number;
      created_at: string;
      entry_type: string;
      ep_amount: number;
      fiat_rate_pence: number;
      notes: string | null;
      rep_id: string | null;
      quest_submission_id: string | null;
      reward_claim_id: string | null;
      ep_purchase_id: string | null;
      payout_id: string | null;
    };
    const rows = (data ?? []) as LedgerRow[];

    // Join rep display names for rows that reference a rep (for human
    // readability in the ledger UI — otherwise it's just UUIDs).
    const repIds = [...new Set(rows.map((r) => r.rep_id).filter((id): id is string => !!id))];
    const repNames = new Map<string, string>();
    if (repIds.length > 0) {
      const { data: reps } = await db
        .from("reps")
        .select("id, display_name, first_name, last_name, email")
        .in("id", repIds);
      for (const rep of (reps ?? []) as Array<{
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>) {
        repNames.set(
          rep.id,
          rep.display_name
            || [rep.first_name, rep.last_name].filter(Boolean).join(" ")
            || rep.email
            || "Unknown rep"
        );
      }
    }

    // Emit signed deltas per side so the UI can render +/- badges
    // without reapplying the same CASE logic the views use internally.
    const enriched = rows.map((r) => ({
      ...r,
      rep_display_name: r.rep_id ? repNames.get(r.rep_id) ?? null : null,
      signed_float_delta: floatDelta(r.entry_type, r.ep_amount),
      signed_earned_delta: earnedDelta(r.entry_type, r.ep_amount),
      signed_rep_delta: repDelta(r.entry_type, r.ep_amount),
    }));

    const total = count ?? rows.length;
    return NextResponse.json({
      data: enriched,
      pagination: {
        limit,
        offset,
        has_more: offset + rows.length < total,
        total,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/ep/ledger] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Sign helpers — mirror the CASE expressions in ep_tenant_float /
// ep_tenant_earned / ep_rep_balances views so the UI doesn't have to.
// ---------------------------------------------------------------------------

function floatDelta(entryType: string, amount: number): number {
  switch (entryType) {
    case "tenant_purchase":
      return amount;
    case "tenant_purchase_reversal":
    case "tenant_quest_debit":
      return -amount;
    case "tenant_quest_reversal":
      return amount;
    default:
      return 0;
  }
}

function earnedDelta(entryType: string, amount: number): number {
  switch (entryType) {
    case "rep_shop_debit":
      return amount;
    case "rep_shop_reversal":
    case "tenant_payout":
      return -amount;
    case "tenant_payout_reversal":
      return amount;
    default:
      return 0;
  }
}

function repDelta(entryType: string, amount: number): number {
  switch (entryType) {
    case "rep_quest_credit":
    case "rep_shop_reversal":
    case "platform_bonus":
      return amount;
    case "rep_quest_reversal":
    case "rep_shop_debit":
      return -amount;
    default:
      return 0;
  }
}
