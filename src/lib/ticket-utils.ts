import crypto from "crypto";

// 30-char alphabet: no ambiguous characters (0/O, 1/I removed)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/**
 * Generate a cryptographically random ticket code.
 * Format: {PREFIX}-XXXXXXXX (8 chars from 30-char alphabet, ~40 bits entropy)
 * The prefix defaults to the org_id uppercased (e.g., "ACME", "ENTRY").
 */
export function generateTicketCode(orgId: string = "ENTRY"): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  const prefix = orgId.toUpperCase();
  return `${prefix}-${code}`;
}

/**
 * Generate a sequential, human-readable order number.
 * Format: {PREFIX}-00001, {PREFIX}-00002, etc.
 * The prefix defaults to the org_id uppercased (e.g., "ACME", "ENTRY").
 *
 * Finds the highest existing number for this org's prefix and increments.
 * The `attempt` offset handles retries after unique-constraint collisions
 * (e.g. concurrent orders or race conditions).
 */
export async function generateOrderNumber(
  supabase: { from: (table: string) => unknown },
  orgId: string,
  attempt: number = 0
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const prefix = orgId.toUpperCase();

  // Find the highest existing order number matching this org's prefix.
  // Sort by order_number DESC to get the highest numerically (not by created_at,
  // which can return a different-prefix order like TEST-00003 that's newer).
  const { data: rows } = await sb
    .from("orders")
    .select("order_number")
    .eq("org_id", orgId)
    .like("order_number", `${prefix}-%`)
    .order("order_number", { ascending: false })
    .limit(1);

  let nextNum = 1;
  const latest = rows?.[0]?.order_number;
  if (latest) {
    const match = latest.match(/(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  // Add attempt offset so retries don't collide on the same number
  nextNum += attempt;

  return `${prefix}-${String(nextNum).padStart(5, "0")}`;
}
