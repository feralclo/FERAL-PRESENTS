import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";

/**
 * GET /api/account — Returns current user's profile.
 *
 * Combines org_users row (name, role, permissions) with auth identities
 * (has_google, has_password) so the account page can render correctly.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Get org_users row for name, role, permissions
  const { data: orgUser } = await db
    .from(TABLES.ORG_USERS)
    .select(
      "first_name, last_name, role, perm_events, perm_orders, perm_marketing, perm_finance, created_at"
    )
    .eq("auth_user_id", auth.user.id)
    .eq("org_id", auth.orgId)
    .single();

  // Get full user via admin auth to inspect identities
  const { data: fullUser } = await db.auth.admin.getUserById(auth.user.id);

  const identities = fullUser?.user?.identities || [];
  const hasGoogle = identities.some(
    (i: { provider: string }) => i.provider === "google"
  );
  const hasPassword =
    identities.some(
      (i: { provider: string }) => i.provider === "email"
    ) || false;

  return NextResponse.json({
    email: auth.user.email,
    first_name: orgUser?.first_name || "",
    last_name: orgUser?.last_name || "",
    role: orgUser?.role || "member",
    perm_events: orgUser?.perm_events ?? true,
    perm_orders: orgUser?.perm_orders ?? true,
    perm_marketing: orgUser?.perm_marketing ?? false,
    perm_finance: orgUser?.perm_finance ?? false,
    created_at: orgUser?.created_at || null,
    has_google: hasGoogle,
    has_password: hasPassword,
  });
}

/**
 * PUT /api/account — Updates name and/or password.
 *
 * Body: { first_name?, last_name?, current_password?, new_password? }
 */
export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { first_name, last_name, current_password, new_password } = body;

  const db = await getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // --- Name update ---
  if (first_name !== undefined || last_name !== undefined) {
    const update: Record<string, string> = {};
    if (first_name !== undefined) {
      if (typeof first_name !== "string" || first_name.length > 50) {
        return NextResponse.json(
          { error: "First name must be 50 characters or less" },
          { status: 400 }
        );
      }
      update.first_name = first_name.trim();
    }
    if (last_name !== undefined) {
      if (typeof last_name !== "string" || last_name.length > 50) {
        return NextResponse.json(
          { error: "Last name must be 50 characters or less" },
          { status: 400 }
        );
      }
      update.last_name = last_name.trim();
    }

    const { error: updateErr } = await db
      .from(TABLES.ORG_USERS)
      .update(update)
      .eq("auth_user_id", auth.user.id)
      .eq("org_id", auth.orgId);

    if (updateErr) {
      console.error("[PUT /api/account] Name update failed:", updateErr);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }
  }

  // --- Password update ---
  if (new_password) {
    if (typeof new_password !== "string" || new_password.length < 8 || new_password.length > 72) {
      return NextResponse.json(
        { error: "Password must be between 8 and 72 characters" },
        { status: 400 }
      );
    }

    // Check if user has an existing password (needs verification)
    const { data: fullUser } = await db.auth.admin.getUserById(auth.user.id);
    const identities = fullUser?.user?.identities || [];
    const hasPassword = identities.some(
      (i: { provider: string }) => i.provider === "email"
    );

    if (hasPassword) {
      // Verify current password before allowing change
      if (!current_password) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      const supabase = await getSupabaseServer();
      if (!supabase) {
        return NextResponse.json(
          { error: "Service unavailable" },
          { status: 503 }
        );
      }

      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: auth.user.email,
        password: current_password,
      });

      if (verifyErr) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }
    }

    // Set new password via admin client
    const { error: pwErr } = await db.auth.admin.updateUserById(auth.user.id, {
      password: new_password,
    });

    if (pwErr) {
      console.error("[PUT /api/account] Password update failed:", pwErr);
      return NextResponse.json(
        { error: "Failed to update password" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
