import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";

/**
 * POST /api/platform/impersonate
 *
 * Generates a one-time token for a tenant's owner user so the platform owner
 * can log into their admin dashboard (in an incognito window).
 * Platform owner only.
 *
 * Returns { token_hash, email } — the frontend constructs the callback URL
 * using window.location.origin so it always points to the admin host.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { org_id } = body as { org_id?: string };

  if (!org_id) {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Find the tenant's owner
  const { data: owner, error: ownerErr } = await supabase
    .from(TABLES.ORG_USERS)
    .select("email")
    .eq("org_id", org_id)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1)
    .single();

  if (ownerErr || !owner) {
    return NextResponse.json(
      { error: "No active owner found for this tenant" },
      { status: 404 }
    );
  }

  // Generate a magic link to extract the hashed token
  const { data, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: owner.email,
  });

  if (linkErr || !data?.properties?.hashed_token) {
    console.error("[impersonate] Failed to generate magic link:", linkErr);
    return NextResponse.json(
      { error: "Failed to generate login link" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    token_hash: data.properties.hashed_token,
    email: owner.email,
  });
}
