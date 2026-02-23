import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { sendTeamInviteEmail } from "@/lib/team-emails";

/**
 * POST /api/team/[id]/resend-invite — Resend invite email to a pending member.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const orgId = auth.orgId;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Verify requester is owner
  const { data: owner } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, role, first_name, last_name")
    .eq("auth_user_id", auth.user.id)
    .eq("org_id", orgId)
    .eq("role", "owner")
    .single();

  if (!owner) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const { id } = await params;

  // Fetch the target member
  const { data: member } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, email, first_name, status, invite_token")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  if (member.status !== "invited") {
    return NextResponse.json({ error: "Can only resend invites for pending members" }, { status: 400 });
  }

  // Regenerate invite token and extend expiry
  const { data: updated, error } = await supabase
    .from(TABLES.ORG_USERS)
    .update({
      invite_token: crypto.randomUUID(),
      invite_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("invite_token")
    .single();

  if (error || !updated?.invite_token) {
    console.error("[team] Failed to regenerate invite token:", error);
    return NextResponse.json({ error: "Failed to resend invite" }, { status: 500 });
  }

  // Send the email
  const ownerName = [owner.first_name, owner.last_name].filter(Boolean).join(" ");
  sendTeamInviteEmail({
    email: member.email,
    firstName: member.first_name,
    orgId,
    inviteToken: updated.invite_token,
    invitedByName: ownerName || undefined,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
