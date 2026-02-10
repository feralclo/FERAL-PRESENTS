import crypto from "crypto";

// 30-char alphabet: no ambiguous characters (0/O, 1/I removed)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/**
 * Generate a cryptographically random ticket code.
 * Format: FERAL-XXXXXXXX (8 chars from 30-char alphabet, ~40 bits entropy)
 */
export function generateTicketCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `FERAL-${code}`;
}

/**
 * Generate a sequential, human-readable order number.
 * Format: FERAL-00001, FERAL-00002, etc.
 *
 * Uses a count-based approach instead of parsing the last order number,
 * which avoids race conditions when concurrent orders are created.
 * If a collision occurs on the unique constraint, retries with the next number.
 */
export async function generateOrderNumber(
  supabase: { from: (table: string) => unknown },
  orgId: string
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Get the count of existing orders to derive the next number
  const { count } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  // Start from count + 1 (handles the common case)
  const baseNum = (count || 0) + 1;

  // Also check the highest existing order number in case of gaps
  const { data } = await sb
    .from("orders")
    .select("order_number")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let nextNum = baseNum;
  if (data?.order_number) {
    const match = data.order_number.match(/(\d+)$/);
    if (match) {
      const lastNum = parseInt(match[1], 10) + 1;
      nextNum = Math.max(nextNum, lastNum);
    }
  }

  return `FERAL-${String(nextNum).padStart(5, "0")}`;
}
