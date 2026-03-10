import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * Clean a name into a valid discount code base.
 * Uppercase, alphanumeric only, max 20 chars.
 */
function toCodeBase(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

/**
 * Check if a discount code is globally unique (across ALL orgs).
 * Returns true if the code is available.
 */
async function isCodeGloballyAvailable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  code: string,
  excludeId?: string
): Promise<boolean> {
  const query = supabase
    .from(TABLES.DISCOUNTS)
    .select("id")
    .eq("code", code)
    .limit(1);

  if (excludeId) {
    query.neq("id", excludeId);
  }

  const { data } = await query.maybeSingle();
  return !data;
}

/**
 * Generate a unique discount code for a rep.
 *
 * Format: REP-{NAME}{6DIGITS} — e.g., REP-JORDAN849271
 * Retries with new random digits if a collision is detected (up to 5 attempts).
 * Returns the created discount row, or null if all attempts fail.
 *
 * @deprecated Use getOrCreateRepDiscount() for new code — creates one discount per rep.
 */
export async function createRepDiscountCode(params: {
  repId: string;
  orgId?: string;
  firstName: string;
  discountType?: string;
  discountValue?: number;
  applicableEventIds?: string[] | null;
  description?: string;
}): Promise<{ id: string; code: string } | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const {
    repId,
    orgId = ORG_ID,
    firstName,
    discountType = "percentage",
    discountValue = 10,
    applicableEventIds = null,
    description,
  } = params;

  // Validate discount type and value
  if (!["percentage", "fixed"].includes(discountType)) {
    console.error(`[discount-codes] Invalid discount type: ${discountType}`);
    return null;
  }

  if (discountType === "percentage" && (discountValue < 0 || discountValue > 100)) {
    console.error(`[discount-codes] Percentage must be 0-100, got: ${discountValue}`);
    return null;
  }

  if (discountValue < 0 || discountValue > 10000) {
    console.error(`[discount-codes] Value out of range: ${discountValue}`);
    return null;
  }

  const name = firstName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 6-digit random number for better collision resistance
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    const code = `REP-${name}${digits}`;

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .insert({
        org_id: orgId,
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

/**
 * Get or create a single discount code for a rep.
 *
 * New approach: one discount per rep per org, based on display_name (gamertag).
 * Code is globally unique across all orgs.
 * Format: {GAMERTAG} — e.g., COSMICWOLF, NEONPANTHER2
 * Falls back to firstName if no displayName.
 * Sets applicable_event_ids = null (works for all events).
 */
export async function getOrCreateRepDiscount(params: {
  repId: string;
  orgId?: string;
  firstName: string;
  displayName?: string;
  discountType?: string;
  discountValue?: number;
  description?: string;
}): Promise<{ id: string; code: string } | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const {
    repId,
    orgId = ORG_ID,
    firstName,
    displayName,
    discountType = "percentage",
    discountValue = 10,
    description,
  } = params;

  // Check if rep already has a discount in this org
  const { data: existing } = await supabase
    .from(TABLES.DISCOUNTS)
    .select("id, code")
    .eq("rep_id", repId)
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  // Generate code from display name or first name
  const tag = toCodeBase(displayName || firstName);
  if (!tag) {
    console.error("[discount-codes] Empty tag for rep:", repId);
    return null;
  }

  // Validate
  if (!["percentage", "fixed"].includes(discountType)) return null;
  if (discountType === "percentage" && (discountValue < 0 || discountValue > 100)) return null;
  if (discountValue < 0 || discountValue > 10000) return null;

  // Try exact tag first, then with incrementing suffix
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = attempt === 0 ? tag : `${tag}${attempt}`;

    // Check global uniqueness
    const available = await isCodeGloballyAvailable(supabase, code);
    if (!available) continue;

    const { data, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .insert({
        org_id: orgId,
        code,
        description: description || `Rep: ${displayName || firstName}`,
        type: discountType,
        value: Number(discountValue),
        used_count: 0,
        applicable_event_ids: null, // Works for all events
        status: "active",
        rep_id: repId,
      })
      .select("id, code")
      .single();

    if (!error && data) {
      return data;
    }

    // Collision on insert (race condition) — retry
    if (error?.code === "23505" || error?.message?.includes("duplicate")) {
      continue;
    }

    console.error("[discount-codes] Insert error:", error);
    return null;
  }

  console.error(`[discount-codes] Failed to create code for rep=${repId}`);
  return null;
}

/**
 * Sync a rep's discount code(s) when their display_name changes.
 * Updates the code to match the new gamertag, checking global uniqueness.
 * Returns the new code or null if sync failed.
 */
export async function syncRepDiscountCode(params: {
  repId: string;
  orgId: string;
  newDisplayName: string;
}): Promise<{ code: string } | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;

  const { repId, orgId, newDisplayName } = params;

  const newTag = toCodeBase(newDisplayName);
  if (!newTag) return null;

  // Get existing discount for this rep
  const { data: existing } = await supabase
    .from(TABLES.DISCOUNTS)
    .select("id, code")
    .eq("rep_id", repId)
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!existing) return null;

  // If code already matches the new tag, no change needed
  if (existing.code === newTag || existing.code.startsWith(newTag)) {
    return { code: existing.code };
  }

  // Try to update to the new code
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const newCode = attempt === 0 ? newTag : `${newTag}${attempt}`;

    // Check global uniqueness (excluding this discount's own ID)
    const available = await isCodeGloballyAvailable(supabase, newCode, existing.id);
    if (!available) continue;

    const { error } = await supabase
      .from(TABLES.DISCOUNTS)
      .update({ code: newCode, description: `Rep: ${newDisplayName}` })
      .eq("id", existing.id);

    if (!error) {
      return { code: newCode };
    }

    // Collision — retry with next suffix
    if (error?.code === "23505" || error?.message?.includes("duplicate")) {
      continue;
    }

    console.error("[discount-codes] Sync error:", error);
    return null;
  }

  console.error(`[discount-codes] Failed to sync code for rep=${repId}`);
  return null;
}
