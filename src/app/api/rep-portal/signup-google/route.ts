import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { getRepSettings } from "@/lib/rep-points";
import { sendRepEmail } from "@/lib/rep-emails";
import { ensureRepCustomer } from "@/lib/rep-utils";
import { autoAssignRepToAllEvents } from "@/lib/rep-auto-assign";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/signup-google
 *
 * Creates a rep from the currently authenticated user's Google profile.
 * Used when the user is already logged in (e.g. as an admin) to avoid
 * a full OAuth redirect that would disrupt the existing session.
 */
export async function POST() {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminClient = await getSupabaseAdmin();
    if (!adminClient) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const orgId = await getOrgId();
    const email = user.email.toLowerCase().trim();

    // Check if rep already exists
    const { data: existing } = await adminClient
      .from(TABLES.REPS)
      .select("id, status")
      .or(`auth_user_id.eq.${user.id},email.eq.${email}`)
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Link auth_user_id if needed
      await adminClient
        .from(TABLES.REPS)
        .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("org_id", orgId);

      // Tag is_rep
      await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: { is_rep: true },
      });

      return NextResponse.json({ data: { id: existing.id, status: existing.status, existing: true } });
    }

    // Create new rep from Google profile
    const settings = await getRepSettings(orgId);
    const firstName = user.user_metadata?.full_name?.split(" ")[0] || user.user_metadata?.name?.split(" ")[0] || "Rep";
    const lastName = user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || user.user_metadata?.name?.split(" ").slice(1).join(" ") || "";
    const status = settings.auto_approve ? "active" : "pending";

    const { data: newRep, error: repError } = await adminClient
      .from(TABLES.REPS)
      .insert({
        org_id: orgId,
        auth_user_id: user.id,
        status,
        email,
        first_name: firstName,
        last_name: lastName,
        display_name: `${firstName} ${lastName.charAt(0) || ""}`.trim() + (lastName.charAt(0) ? "." : ""),
        photo_url: user.user_metadata?.avatar_url || null,
        points_balance: 0,
        currency_balance: 0,
        total_sales: 0,
        total_revenue: 0,
        level: 1,
        onboarding_completed: false,
      })
      .select("id, status")
      .single();

    if (repError) {
      console.error("[signup-google] Failed to create rep:", repError);
      return NextResponse.json({ error: "Failed to create rep account" }, { status: 500 });
    }

    // Tag is_rep in auth metadata
    await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { is_rep: true },
    });

    // Create customer record (fire-and-forget)
    ensureRepCustomer({
      supabase: adminClient,
      repId: newRep.id,
      orgId,
      email,
      firstName,
      lastName,
    }).catch(() => {});

    // Auto-approve: send welcome email + assign events
    if (newRep.status === "active") {
      sendRepEmail({ type: "welcome", repId: newRep.id, orgId }).catch(() => {});
      autoAssignRepToAllEvents({
        supabase: adminClient,
        repId: newRep.id,
        orgId,
        repFirstName: firstName,
      }).catch(() => {});
    }

    return NextResponse.json({ data: { id: newRep.id, status: newRep.status, existing: false } }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[signup-google] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
