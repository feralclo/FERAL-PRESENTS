import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/waitlist/validate?token=TOKEN
 *
 * Public endpoint — validates a waitlist notification token.
 * Returns { valid, email, event_id } so the event page can unlock the ticket widget.
 * Does NOT mark the token as used — that happens in confirm-order.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ valid: false }, { status: 503 });
    }

    const { data: signup } = await supabase
      .from(TABLES.WAITLIST_SIGNUPS)
      .select("id, email, event_id, status, token_expires_at")
      .eq("notification_token", token)
      .single();

    if (!signup) {
      return NextResponse.json({ valid: false });
    }

    // Token expired
    if (signup.token_expires_at && new Date(signup.token_expires_at) < new Date()) {
      // Mark as expired if still notified
      if (signup.status === "notified") {
        await supabase
          .from(TABLES.WAITLIST_SIGNUPS)
          .update({ status: "expired" })
          .eq("id", signup.id);
      }
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    // Already purchased or removed
    if (signup.status !== "notified" && signup.status !== "pending") {
      return NextResponse.json({ valid: false, reason: signup.status });
    }

    return NextResponse.json({
      valid: true,
      email: signup.email,
      event_id: signup.event_id,
      signup_id: signup.id,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
