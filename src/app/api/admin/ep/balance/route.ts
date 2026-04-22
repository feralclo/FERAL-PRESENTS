import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getEpConfig, epToPence } from "@/lib/ep/config";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/admin/ep/balance
 *
 * Tenant's current EP position:
 *   - float: EP available to award via quests (paid-in, not yet spent)
 *   - earned: EP redeemed by reps at your shop, not yet paid out to you in cash
 *   - committed: EP reserved against open quests (ep_reward × remaining completions)
 *
 * Response:
 *   {
 *     data: {
 *       float: int,
 *       earned: int,
 *       committed: int,
 *       float_net_of_commitments: int,
 *       fiat_rate_pence: int,
 *       float_pence: int,
 *       earned_pence_gross: int,
 *       platform_cut_bps: int,
 *       earned_pence_net: int,
 *       min_payout_pence: int,
 *       low_float_warning: boolean
 *     }
 *   }
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const [floatResult, earnedResult, quests, config] = await Promise.all([
      db
        .from("ep_tenant_float")
        .select("balance")
        .eq("tenant_org_id", auth.orgId)
        .maybeSingle(),
      db
        .from("ep_tenant_earned")
        .select("balance")
        .eq("tenant_org_id", auth.orgId)
        .maybeSingle(),
      // Active quests for this tenant's promoter, to compute committed EP
      db
        .from("rep_quests")
        .select("ep_reward, max_completions, total_completed")
        .eq("org_id", auth.orgId)
        .eq("status", "active"),
      getEpConfig(),
    ]);

    const float = floatResult.data?.balance ?? 0;
    const earned = earnedResult.data?.balance ?? 0;

    const committed = ((quests.data ?? []) as Array<{
      ep_reward: number | null;
      max_completions: number | null;
      total_completed: number | null;
    }>).reduce((sum, q) => {
      const reward = q.ep_reward ?? 0;
      const remaining =
        (q.max_completions ?? 0) - (q.total_completed ?? 0);
      if (reward > 0 && remaining > 0) {
        return sum + reward * remaining;
      }
      return sum;
    }, 0);

    const floatPence = epToPence(float, config.fiat_rate_pence);
    const earnedPenceGross = epToPence(earned, config.fiat_rate_pence);
    const earnedPenceNet = Math.floor(
      (earnedPenceGross * (10_000 - config.platform_cut_bps)) / 10_000
    );

    return NextResponse.json({
      data: {
        float,
        earned,
        committed,
        float_net_of_commitments: float - committed,
        fiat_rate_pence: config.fiat_rate_pence,
        float_pence: floatPence,
        earned_pence_gross: earnedPenceGross,
        platform_cut_bps: config.platform_cut_bps,
        earned_pence_net: earnedPenceNet,
        min_payout_pence: config.min_payout_pence,
        low_float_warning: float < committed,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/ep/balance] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
