/**
 * Approve a rep's pending memberships for a tenant's promoter and ensure
 * each approved membership carries a discount code.
 *
 * Triggered when a tenant flips a rep's status to 'active' via
 * /api/reps/[id] PUT — that endpoint only mutates the legacy reps row, so
 * without this helper the v2 rep_promoter_memberships row stays at
 * status='pending' forever and dashboard.discount.primary_code stays null.
 *
 * Flow:
 *   1. Look up the promoter for this org (1:1 with org_id).
 *   2. Find any pending memberships for (rep_id, promoter_id).
 *   3. Ensure the rep has a row in `discounts` (creates one if missing).
 *   4. Update each pending membership to status='approved', stamp discount_code.
 *
 * Idempotent: re-running it on an already-approved rep is a no-op (no
 * memberships match the pending filter). Errors are logged + reported to
 * Sentry but never thrown — approval should not fail because of a downstream
 * discount hiccup.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateRepDiscount } from "@/lib/discount-codes";
import * as Sentry from "@sentry/nextjs";

interface ApproveParams {
  repId: string;
  orgId: string;
  /** First name fallback for discount-code generation when display_name is empty. */
  firstName: string;
  /** Preferred source for the discount-code "tag" (gamertag). */
  displayName?: string | null;
  /** Per-membership discount percent. Defaults to 10 — same as getOrCreateRepDiscount. */
  discountPercent?: number;
}

export async function approveRepMembershipsForOrg(
  params: ApproveParams,
): Promise<{ approved: number; code: string | null }> {
  const { repId, orgId, firstName, displayName, discountPercent = 10 } = params;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return { approved: 0, code: null };
  }

  try {
    // 1. Promoter for this org (1:1).
    const { data: promoter } = await supabase
      .from("promoters")
      .select("id")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!promoter) {
      // No promoter row — tenant hasn't been migrated to v2 yet. Nothing to do.
      return { approved: 0, code: null };
    }

    // 2. Pending memberships to approve (almost always 0 or 1 row).
    const { data: pending } = await supabase
      .from("rep_promoter_memberships")
      .select("id")
      .eq("rep_id", repId)
      .eq("promoter_id", promoter.id)
      .eq("status", "pending");

    if (!pending || pending.length === 0) {
      return { approved: 0, code: null };
    }

    // 3. Ensure discount code exists in the `discounts` table. Same code is
    //    written onto each approved membership row so dashboard.discount
    //    reads it directly without joining back to discounts.
    const discount = await getOrCreateRepDiscount({
      repId,
      orgId,
      firstName,
      displayName: displayName ?? undefined,
      discountValue: discountPercent,
    });

    if (!discount) {
      // Discount creation failed (empty tag, code collision, db error). Still
      // approve the memberships — code can be backfilled later via PATCH.
      const { data: rows } = await supabase
        .from("rep_promoter_memberships")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("rep_id", repId)
        .eq("promoter_id", promoter.id)
        .eq("status", "pending")
        .select("id");
      return { approved: rows?.length ?? 0, code: null };
    }

    // 4. Approve + stamp code in one update.
    const { data: rows } = await supabase
      .from("rep_promoter_memberships")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        discount_code: discount.code,
        discount_percent: discountPercent,
      })
      .eq("rep_id", repId)
      .eq("promoter_id", promoter.id)
      .eq("status", "pending")
      .select("id");

    return { approved: rows?.length ?? 0, code: discount.code };
  } catch (err) {
    Sentry.captureException(err, { extra: { repId, orgId } });
    console.error("[rep-membership-approval] Failed:", err);
    return { approved: 0, code: null };
  }
}
