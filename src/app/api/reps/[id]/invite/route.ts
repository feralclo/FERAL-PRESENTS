import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * Generate a discount code for a rep.
 * Format: REP-{FIRSTNAME}{RANDOM4DIGITS} (uppercase, max 15 chars)
 */
function generateDiscountCode(firstName: string): string {
  const digits = Math.floor(1000 + Math.random() * 9000).toString();
  const name = firstName.toUpperCase().replace(/[^A-Z]/g, "");
  // REP- = 4 chars, digits = 4 chars, so name can be up to 7 chars
  const maxNameLen = 15 - 4 - digits.length;
  const truncatedName = name.slice(0, maxNameLen);
  return `REP-${truncatedName}${digits}`;
}

/**
 * POST /api/reps/[id]/invite — Generate/regenerate invite link + discount code
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      discount_type = "percentage",
      discount_value = 10,
      applicable_event_ids,
    } = body;

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch the rep
    const { data: rep, error: repErr } = await supabase
      .from(TABLES.REPS)
      .select("id, first_name, email, invite_token")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (repErr || !rep) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    // Generate new invite token
    const invite_token = crypto.randomUUID();

    // Update rep with new invite token
    await supabase
      .from(TABLES.REPS)
      .update({
        invite_token,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", ORG_ID);

    // Create a discount code for this rep
    const discountCode = generateDiscountCode(rep.first_name);

    const { data: discount, error: discountErr } = await supabase
      .from(TABLES.DISCOUNTS)
      .insert({
        org_id: ORG_ID,
        code: discountCode,
        description: `Rep discount for ${rep.first_name}`,
        type: discount_type,
        value: Number(discount_value),
        used_count: 0,
        applicable_event_ids: applicable_event_ids || null,
        status: "active",
        rep_id: id,
      })
      .select()
      .single();

    if (discountErr) {
      return NextResponse.json(
        { error: `Failed to create discount code: ${discountErr.message}` },
        { status: 500 }
      );
    }

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || ""
    ).replace(/\/$/, "");
    const invite_url = `${siteUrl}/rep/invite/${invite_token}`;

    return NextResponse.json({
      data: {
        invite_url,
        invite_token,
        discount_code: discount.code,
        discount_id: discount.id,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
