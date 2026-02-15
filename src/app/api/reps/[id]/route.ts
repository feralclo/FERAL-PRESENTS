import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID, SUPABASE_URL } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reps/[id] — Fetch single rep by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.REPS)
      .select("*")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/reps/[id] — Update rep fields
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Allow only specific fields to be updated
    const allowedFields = [
      "status",
      "first_name",
      "last_name",
      "display_name",
      "phone",
      "photo_url",
      "gender",
      "instagram",
      "tiktok",
      "bio",
      "onboarding_completed",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate status enum if provided (must match RepStatus type)
    if (updates.status && !["pending", "active", "suspended", "deactivated"].includes(updates.status as string)) {
      return NextResponse.json(
        { error: "status must be 'pending', 'active', 'suspended', or 'deactivated'" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLES.REPS)
      .update(updates)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/reps/[id] — Hard delete rep and all related data
 *
 * Safety checks (CRITICAL):
 *   - Cannot delete a rep whose auth user is also an admin (prevents admin lockout)
 *   - Cannot delete your own rep record (prevents self-lockout)
 *
 * Cascade behavior (handled by DB foreign keys):
 *   rep_events, rep_points_log, rep_quest_submissions, rep_reward_claims → ON DELETE CASCADE
 *   discounts.rep_id → ON DELETE SET NULL (discount codes become orphaned)
 *   reps.invited_by → ON DELETE SET NULL (self-referencing)
 *
 * Manual cleanup:
 *   - Delete associated discount codes so they can be re-issued on re-invite
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Verify rep exists and belongs to this org
    const { data: rep, error: fetchError } = await supabase
      .from(TABLES.REPS)
      .select("id, auth_user_id")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();

    if (fetchError || !rep) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    // ── Safety check 1: Prevent self-deletion ──
    // If the admin's own auth user ID matches this rep's auth_user_id,
    // they're trying to delete themselves — which would nuke their login.
    if (rep.auth_user_id && rep.auth_user_id === auth.user!.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account. Ask another admin to remove you." },
        { status: 403 }
      );
    }

    // ── Safety check 2: Never delete auth users that are also admins ──
    // A rep might share an auth account with an admin (dual-role user).
    // Deleting that auth user would lock the admin out completely.
    let authUserIsAdmin = false;
    if (rep.auth_user_id) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey && SUPABASE_URL) {
        try {
          const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
          const { data: authUser } = await adminClient.auth.admin.getUserById(rep.auth_user_id);
          if (authUser?.user?.app_metadata?.is_admin === true) {
            authUserIsAdmin = true;
          }
        } catch (err) {
          // If we can't verify, err on the side of caution — don't delete the auth user
          console.warn("[DELETE /api/reps/[id]] Could not verify auth user admin status:", err);
          authUserIsAdmin = true;
        }
      }
    }

    // Delete the Supabase Auth user ONLY if it's a rep-only account.
    // Admin auth users are preserved — only the rep record is removed.
    if (rep.auth_user_id && !authUserIsAdmin) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey && SUPABASE_URL) {
        try {
          const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
          const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(rep.auth_user_id);
          if (authDeleteError) {
            console.warn("[DELETE /api/reps/[id]] Auth user cleanup failed (non-blocking):", authDeleteError.message);
          }
        } catch (authErr) {
          console.warn("[DELETE /api/reps/[id]] Auth user cleanup error (non-blocking):", authErr);
        }
      }
    } else if (authUserIsAdmin) {
      console.info("[DELETE /api/reps/[id]] Skipping auth user deletion — user is also an admin:", rep.auth_user_id);
    }

    // Clean up discount codes associated with this rep
    await supabase
      .from(TABLES.DISCOUNTS)
      .delete()
      .eq("rep_id", id)
      .eq("org_id", ORG_ID);

    // Hard delete the rep record (cascade handles points_log, events, submissions, claims)
    const { error: deleteError } = await supabase
      .from(TABLES.REPS)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);

    if (deleteError) {
      console.error("[DELETE /api/reps/[id]] Error:", deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      deleted: true,
      auth_user_preserved: authUserIsAdmin,
    });
  } catch (err) {
    console.error("[DELETE /api/reps/[id]] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
