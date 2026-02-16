import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { createRepDiscountCode } from "@/lib/discount-codes";
import { sendRepInviteEmail } from "@/lib/rep-emails";

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

    const supabase = getSupabaseAdmin();
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
    const { error: updateError } = await supabase
      .from(TABLES.REPS)
      .update({
        invite_token,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", ORG_ID);

    if (updateError) {
      console.error("[POST /api/reps/[id]/invite] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to generate invite" },
        { status: 500 }
      );
    }

    // Create a discount code for this rep (with collision retry)
    const discount = await createRepDiscountCode({
      repId: id,
      firstName: rep.first_name,
      discountType: discount_type,
      discountValue: discount_value,
      applicableEventIds: applicable_event_ids || null,
    });

    if (!discount) {
      return NextResponse.json(
        { error: "Failed to create discount code" },
        { status: 500 }
      );
    }

    // Build a full absolute URL for the invite link
    const host = request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
      : host
        ? `${proto}://${host}`
        : "";
    const invite_url = `${siteUrl}/rep/invite/${invite_token}`;

    // Send invite email (fire-and-forget — don't block the response)
    sendRepInviteEmail({
      email: rep.email,
      firstName: rep.first_name,
      orgId: ORG_ID,
      inviteToken: invite_token,
      discountCode: discount.code,
    }).catch(() => {});

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
