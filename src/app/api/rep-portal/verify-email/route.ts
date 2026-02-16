import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TABLES, ORG_ID, SUPABASE_URL } from "@/lib/constants";
import { sendRepEmail } from "@/lib/rep-emails";

/**
 * Get a Supabase admin client for public verification routes.
 */
function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && SUPABASE_URL) {
    return createClient(SUPABASE_URL, serviceRoleKey);
  }
  return null;
}

/**
 * POST /api/rep-portal/verify-email — Verify email or resend verification (public)
 *
 * Two modes:
 * - { token: "..." } → Validate token, set email_verified = true
 * - { email: "..." } → Resend verification email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, email } = body;

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // ── Mode 1: Verify token ──
    if (token) {
      const { data: rep, error: repError } = await supabase
        .from(TABLES.REPS)
        .select("id, email, status, email_verified, org_id")
        .eq("email_verification_token", token)
        .eq("org_id", ORG_ID)
        .single();

      if (repError || !rep) {
        return NextResponse.json(
          { error: "Invalid or expired verification token" },
          { status: 400 }
        );
      }

      if (rep.email_verified) {
        return NextResponse.json({
          data: { already_verified: true, status: rep.status },
        });
      }

      // Mark email as verified, clear token
      const { error: updateError } = await supabase
        .from(TABLES.REPS)
        .update({
          email_verified: true,
          email_verification_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rep.id)
        .eq("org_id", ORG_ID);

      if (updateError) {
        console.error("[verify-email] Failed to update rep:", updateError);
        return NextResponse.json(
          { error: "Verification failed" },
          { status: 500 }
        );
      }

      // Send welcome email now that they're verified
      if (rep.status === "active") {
        sendRepEmail({
          type: "welcome",
          repId: rep.id,
          orgId: ORG_ID,
        }).catch(() => {});
      }

      return NextResponse.json({
        data: { verified: true, status: rep.status },
      });
    }

    // ── Mode 2: Resend verification email ──
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      const { data: rep } = await supabase
        .from(TABLES.REPS)
        .select("id, email, email_verified, email_verification_token, org_id")
        .eq("email", normalizedEmail)
        .eq("org_id", ORG_ID)
        .single();

      if (!rep) {
        // Don't reveal whether the email exists — return success either way
        return NextResponse.json({ data: { sent: true } });
      }

      if (rep.email_verified) {
        return NextResponse.json({ data: { already_verified: true } });
      }

      // Generate a fresh token
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
      sendRepEmail({
        type: "email_verification",
        repId: rep.id,
        orgId: ORG_ID,
        data: { verification_token: newToken },
      }).catch(() => {});

      return NextResponse.json({ data: { sent: true } });
    }

    return NextResponse.json(
      { error: "Provide either 'token' (to verify) or 'email' (to resend)" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[verify-email] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
