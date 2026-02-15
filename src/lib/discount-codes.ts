import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * Generate a unique discount code for a rep.
 *
 * Format: REP-{NAME}{6DIGITS} — e.g., REP-JORDAN849271
 * Retries with new random digits if a collision is detected (up to 5 attempts).
 * Returns the created discount row, or null if all attempts fail.
 */
export async function createRepDiscountCode(params: {
  repId: string;
  firstName: string;
  discountType?: string;
  discountValue?: number;
  applicableEventIds?: string[] | null;
  description?: string;
}): Promise<{ id: string; code: string } | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const {
    repId,
    firstName,
    discountType = "percentage",
    discountValue = 10,
    applicableEventIds = null,
    description,
  } = params;

  const name = firstName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 6-digit random number for better collision resistance
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    const code = `REP-${name}${digits}`;

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .insert({
        org_id: ORG_ID,
        code,
        description: description || `Rep discount for ${firstName}`,
        type: discountType,
        value: Number(discountValue),
        used_count: 0,
        applicable_event_ids: applicableEventIds,
        status: "active",
        rep_id: repId,
      })
      .select("id, code")
      .single();

    if (!error && data) {
      return data;
    }

    // If it's a uniqueness constraint violation, retry
    if (error?.code === "23505" || error?.message?.includes("duplicate")) {
      continue;
    }

    // Non-collision error — don't retry
    console.error("[discount-codes] Insert error:", error);
    return null;
  }

  console.error(
    `[discount-codes] Failed to create unique code after ${maxAttempts} attempts for rep=${repId}`
  );
  return null;
}
