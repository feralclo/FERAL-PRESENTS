import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { sendRepEmail } from "@/lib/rep-emails";

/**
 * POST /api/reps/[id]/resend-verification — Resend verification email (admin)
 *
 * Generates a new verification token and sends the verification email.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data: rep, error: repError } = await supabase
      .from(TABLES.REPS)
      .select("id, email, email_verified, org_id")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (repError || !rep) {
      return NextResponse.json(
        { error: "Rep not found" },
        { status: 404 }
      );
    }

    if (rep.email_verified) {
      return NextResponse.json(
        { error: "Email is already verified" },
        { status: 400 }
      );
    }

    // Generate new verification token
    const newToken = crypto.randomUUID();
    await supabase
      .from(TABLES.REPS)
      .update({
        email_verification_token: newToken,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rep.id)
      .eq("org_id", ORG_ID);

    // Send verification email
    await sendRepEmail({
      type: "email_verification",
      repId: rep.id,
      orgId: ORG_ID,
      data: { verification_token: newToken },
    });

    return NextResponse.json({ data: { sent: true } });
  } catch (err) {
    console.error("[reps/resend-verification] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
