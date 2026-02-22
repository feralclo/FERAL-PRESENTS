import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { sendTeamInviteEmail } from "@/lib/team-emails";

/**
 * Verify the requesting user is an org owner.
 * Returns the owner row or an error response.
 */
async function requireOwner(userId: string) {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return { owner: null, error: NextResponse.json({ error: "Service unavailable" }, { status: 503 }) };
  }

  const { data: owner } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, role, first_name, last_name")
    .eq("auth_user_id", userId)
    .eq("org_id", ORG_ID)
    .eq("role", "owner")
    .single();

  if (!owner) {
    return { owner: null, error: NextResponse.json({ error: "Owner access required" }, { status: 403 }) };
  }

  return { owner, error: null };
}

/**
 * GET /api/team — List all team members for the org.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const ownerCheck = await requireOwner(auth.user.id);
  if (ownerCheck.error) return ownerCheck.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: members, error } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, org_id, auth_user_id, email, first_name, last_name, role, perm_events, perm_orders, perm_marketing, perm_finance, status, invite_expires_at, invited_by, created_at, updated_at")
    .eq("org_id", ORG_ID)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[team] Failed to list members:", error);
    return NextResponse.json({ error: "Failed to load team members" }, { status: 500 });
  }

  return NextResponse.json({ data: members });
}

/**
 * POST /api/team — Invite a new team member.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const ownerCheck = await requireOwner(auth.user.id);
  if (ownerCheck.error) return ownerCheck.error;

  const body = await request.json();
  const { email, first_name, last_name, perm_events, perm_orders, perm_marketing, perm_finance } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (!first_name || typeof first_name !== "string" || first_name.trim().length === 0) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 });
  }

  if (first_name.length > 50 || (last_name && last_name.length > 50)) {
    return NextResponse.json({ error: "Name fields must be under 50 characters" }, { status: 400 });
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Check for existing member with same email
  const { data: existing } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, status")
    .eq("org_id", ORG_ID)
    .ilike("email", cleanEmail)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "A team member with this email already exists" },
      { status: 409 }
    );
  }

  // Create the invite
  const { data: member, error } = await supabase
    .from(TABLES.ORG_USERS)
    .insert({
      org_id: ORG_ID,
      email: cleanEmail,
      first_name: first_name.trim(),
      last_name: (last_name || "").trim(),
      role: "member",
      perm_events: !!perm_events,
      perm_orders: !!perm_orders,
      perm_marketing: !!perm_marketing,
      perm_finance: !!perm_finance,
      status: "invited",
      invited_by: auth.user.id,
    })
    .select("id, org_id, email, first_name, last_name, role, perm_events, perm_orders, perm_marketing, perm_finance, status, invite_expires_at, created_at, updated_at")
    .single();

  if (error) {
    console.error("[team] Failed to create invite:", error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A team member with this email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  // Fetch the invite token separately (we don't return it in the response)
  const { data: tokenRow } = await supabase
    .from(TABLES.ORG_USERS)
    .select("invite_token")
    .eq("id", member.id)
    .single();

  // Send invite email (fire-and-forget)
  if (tokenRow?.invite_token) {
    const ownerName = [ownerCheck.owner.first_name, ownerCheck.owner.last_name]
      .filter(Boolean)
      .join(" ");
    sendTeamInviteEmail({
      email: cleanEmail,
      firstName: first_name.trim(),
      orgId: ORG_ID,
      inviteToken: tokenRow.invite_token,
      invitedByName: ownerName || undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ data: member }, { status: 201 });
}
