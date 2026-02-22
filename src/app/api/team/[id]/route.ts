import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * Verify the requesting user is an org owner.
 */
async function requireOwner(userId: string) {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return { owner: null, error: NextResponse.json({ error: "Service unavailable" }, { status: 503 }) };
  }

  const { data: owner } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, role")
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
 * PUT /api/team/[id] — Update a team member's permissions.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const ownerCheck = await requireOwner(auth.user.id);
  if (ownerCheck.error) return ownerCheck.error;

  const { id } = await params;
  const body = await request.json();

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Fetch the target member
  const { data: member } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, role, org_id")
    .eq("id", id)
    .eq("org_id", ORG_ID)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  // Prevent editing the owner
  if (member.role === "owner") {
    return NextResponse.json({ error: "Cannot edit the owner's permissions" }, { status: 403 });
  }

  // Build update payload — only allow permission fields and status
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.perm_events === "boolean") update.perm_events = body.perm_events;
  if (typeof body.perm_orders === "boolean") update.perm_orders = body.perm_orders;
  if (typeof body.perm_marketing === "boolean") update.perm_marketing = body.perm_marketing;
  if (typeof body.perm_finance === "boolean") update.perm_finance = body.perm_finance;
  if (body.status === "active" || body.status === "suspended") update.status = body.status;
  if (typeof body.first_name === "string" && body.first_name.trim()) update.first_name = body.first_name.trim();
  if (typeof body.last_name === "string") update.last_name = body.last_name.trim();

  const { data: updated, error } = await supabase
    .from(TABLES.ORG_USERS)
    .update(update)
    .eq("id", id)
    .eq("org_id", ORG_ID)
    .select("id, org_id, email, first_name, last_name, role, perm_events, perm_orders, perm_marketing, perm_finance, status, created_at, updated_at")
    .single();

  if (error) {
    console.error("[team] Failed to update member:", error);
    return NextResponse.json({ error: "Failed to update team member" }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}

/**
 * DELETE /api/team/[id] — Remove a team member.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const ownerCheck = await requireOwner(auth.user.id);
  if (ownerCheck.error) return ownerCheck.error;

  const { id } = await params;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Fetch the target member
  const { data: member } = await supabase
    .from(TABLES.ORG_USERS)
    .select("id, role, auth_user_id, org_id")
    .eq("id", id)
    .eq("org_id", ORG_ID)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  // Prevent removing the owner
  if (member.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner" }, { status: 403 });
  }

  // Prevent self-deletion
  if (member.auth_user_id === auth.user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 403 });
  }

  const { error } = await supabase
    .from(TABLES.ORG_USERS)
    .delete()
    .eq("id", id)
    .eq("org_id", ORG_ID);

  if (error) {
    console.error("[team] Failed to remove member:", error);
    return NextResponse.json({ error: "Failed to remove team member" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
