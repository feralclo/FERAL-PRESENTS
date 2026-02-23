import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { createRateLimiter } from "@/lib/rate-limit";

// 20 validations per minute per IP — prevents brute-force code guessing
const validateLimiter = createRateLimiter("discount-validate", {
  limit: 20,
  windowSeconds: 60,
});

/**
 * POST /api/discounts/validate
 *
 * Public endpoint — called by checkout to validate a discount code.
 * Rate limited to prevent brute-force guessing.
 *
 * Body: { code: string, event_id?: string, subtotal?: number }
 * Returns: { valid: boolean, discount?: {...}, error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = validateLimiter(request);
    if (blocked) return blocked;

    const orgId = getOrgIdFromRequest(request);
    const body = await request.json();
    const { code, event_id, subtotal } = body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { valid: false, error: "Please enter a discount code" },
        { status: 200 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { valid: false, error: "Service temporarily unavailable" },
        { status: 200 }
      );
    }

    // Look up the code (case-insensitive)
    const { data: discount, error } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("*")
      .eq("org_id", orgId)
      .ilike("code", code.trim())
      .eq("status", "active")
      .single();

    if (error || !discount) {
      return NextResponse.json(
        { valid: false, error: "Invalid discount code" },
        { status: 200 }
      );
    }

    // Check expiry
    const now = new Date();
    if (discount.starts_at && new Date(discount.starts_at) > now) {
      return NextResponse.json(
        { valid: false, error: "This discount code is not yet active" },
        { status: 200 }
      );
    }
    if (discount.expires_at && new Date(discount.expires_at) < now) {
      return NextResponse.json(
        { valid: false, error: "This discount code has expired" },
        { status: 200 }
      );
    }

    // Check usage limit
    if (discount.max_uses != null && discount.used_count >= discount.max_uses) {
      return NextResponse.json(
        { valid: false, error: "This discount code has reached its usage limit" },
        { status: 200 }
      );
    }

    // Check event restriction
    if (
      discount.applicable_event_ids &&
      discount.applicable_event_ids.length > 0 &&
      event_id &&
      !discount.applicable_event_ids.includes(event_id)
    ) {
      return NextResponse.json(
        { valid: false, error: "This discount code is not valid for this event" },
        { status: 200 }
      );
    }

    // Check minimum order amount
    if (
      discount.min_order_amount != null &&
      subtotal != null &&
      subtotal < discount.min_order_amount
    ) {
      return NextResponse.json(
        {
          valid: false,
          error: `Minimum order of £${Number(discount.min_order_amount).toFixed(2)} required`,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      valid: true,
      discount: {
        id: discount.id,
        code: discount.code,
        type: discount.type,
        value: discount.value,
      },
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Something went wrong. Please try again." },
      { status: 200 }
    );
  }
}
