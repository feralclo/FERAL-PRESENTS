import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TABLES, ORG_ID, SUPABASE_URL } from "@/lib/constants";

/**
 * GET /api/rep-portal/dev-login/[token] — Dev-access auto-login (public)
 *
 * Validates a permanent dev_access_token, looks up the rep, and generates
 * a one-time OTP via Supabase admin. The client page exchanges this OTP
 * for a real session. No email is actually sent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 32) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey || !SUPABASE_URL) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const adminClient = createClient(SUPABASE_URL, serviceRoleKey);

    // Look up rep by dev_access_token
    const { data: rep, error: repError } = await adminClient
      .from(TABLES.REPS)
      .select("id, email, status, auth_user_id")
      .eq("dev_access_token", token)
      .eq("org_id", ORG_ID)
      .single();

    if (repError || !rep) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 }
      );
    }

    if (rep.status !== "active") {
      return NextResponse.json(
        { error: "Rep account is not active" },
        { status: 403 }
      );
    }

    if (!rep.auth_user_id) {
      return NextResponse.json(
        { error: "Rep has no auth account" },
        { status: 403 }
      );
    }

    // Generate a magic link (OTP) — no email is sent
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: rep.email,
      });

    if (linkError || !linkData?.properties?.email_otp) {
      console.error("[dev-login] generateLink failed:", linkError);
      return NextResponse.json(
        { error: "Failed to generate login link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      email: rep.email,
      otp: linkData.properties.email_otp,
    });
  } catch (err) {
    console.error("[dev-login] error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
