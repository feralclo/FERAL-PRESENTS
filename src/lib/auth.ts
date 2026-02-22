import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * Auth helper for admin API routes.
 *
 * Verifies the current request has a valid Supabase Auth session
 * AND that the user is NOT a rep (reps have their own auth via requireRepAuth).
 * Returns the authenticated admin user or an error NextResponse.
 *
 * Usage in API routes:
 *   const auth = await requireAuth();
 *   if (auth.error) return auth.error;
 *   const user = auth.user;
 */
export async function requireAuth(): Promise<
  | { user: { id: string; email: string }; error: null }
  | { user: null; error: NextResponse }
> {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return {
        user: null,
        error: NextResponse.json(
          { error: "Service unavailable" },
          { status: 503 }
        ),
      };
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        user: null,
        error: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        ),
      };
    }

    // Block rep-only users from admin API routes — they must use rep-portal routes.
    // The is_admin flag (set on admin login) overrides is_rep for dual-role users.
    const meta = user.app_metadata;
    if (meta?.is_rep === true && meta?.is_admin !== true) {
      console.warn("[requireAuth] Blocked rep-only user from admin route:", user.email);
      return {
        user: null,
        error: NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        ),
      };
    }

    return {
      user: { id: user.id, email: user.email || "" },
      error: null,
    };
  } catch {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      ),
    };
  }
}

/**
 * Auth helper for rep portal API routes.
 *
 * Verifies the current request has a valid Supabase Auth session AND
 * that the session belongs to an active rep. Returns the rep row
 * or a 401/403 NextResponse.
 */
export async function requireRepAuth(): Promise<
  | { rep: { id: string; auth_user_id: string; email: string; org_id: string; status: string }; error: null }
  | { rep: null; error: NextResponse }
> {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Service unavailable" },
          { status: 503 }
        ),
      };
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        ),
      };
    }

    // Use admin client for rep table lookups (bypasses RLS)
    const adminDb = await getSupabaseAdmin();
    if (!adminDb) {
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Service unavailable" },
          { status: 503 }
        ),
      };
    }

    // Look up the rep row linked to this auth user
    const { data: rep, error: repErr } = await adminDb
      .from(TABLES.REPS)
      .select("id, auth_user_id, email, org_id, status")
      .eq("auth_user_id", user.id)
      .eq("org_id", ORG_ID)
      .single();

    if (repErr || !rep) {
      // Self-healing: if no rep found by auth_user_id, try matching by email.
      // This handles cases where the invite accept updated the auth user but
      // the rep row's auth_user_id wasn't saved (e.g., partial update failure).
      // Only links if the rep has NO existing auth_user_id (prevents account takeover).
      if (user.email) {
        const { data: repByEmail } = await adminDb
          .from(TABLES.REPS)
          .select("id, auth_user_id, email, org_id, status")
          .eq("email", user.email.toLowerCase())
          .eq("org_id", ORG_ID)
          .is("auth_user_id", null)
          .single();

        if (repByEmail) {
          // Auto-link this auth user to the rep row
          console.warn("[requireRepAuth] Auto-linking rep by email:", {
            repId: repByEmail.id,
            authUserId: user.id,
            email: user.email,
          });
          await adminDb
            .from(TABLES.REPS)
            .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
            .eq("id", repByEmail.id)
            .eq("org_id", ORG_ID);

          repByEmail.auth_user_id = user.id;

          if (repByEmail.status !== "active") {
            return {
              rep: null,
              error: NextResponse.json(
                { error: "Your account is not active. Please contact support.", code: `rep_${repByEmail.status}` },
                { status: 403 }
              ),
            };
          }

          return { rep: repByEmail, error: null };
        }
      }

      console.error("[requireRepAuth] Rep lookup failed:", {
        authUserId: user.id,
        authEmail: user.email,
        orgId: ORG_ID,
        repErr: repErr?.message,
      });
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Rep account not found", code: "rep_not_found" },
          { status: 403 }
        ),
      };
    }

    if (rep.status !== "active") {
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Your account is not active. Please contact support.", code: `rep_${rep.status}` },
          { status: 403 }
        ),
      };
    }

    return { rep, error: null };
  } catch {
    return {
      rep: null,
      error: NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      ),
    };
  }
}

/**
 * Auth helper for platform-owner-only API routes.
 *
 * Verifies the user is an authenticated admin AND has the
 * `is_platform_owner: true` flag in `app_metadata`. Returns 403
 * if the user is a regular admin without the flag.
 *
 * Use this for routes that should only be accessible to the
 * platform operator (e.g., Stripe Connect management, data resets).
 */
export async function requirePlatformOwner(): Promise<
  | { user: { id: string; email: string }; error: null }
  | { user: null; error: NextResponse }
> {
  const auth = await requireAuth();
  if (auth.error) return auth;

  // Check for platform owner flag
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      ),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.app_metadata?.is_platform_owner) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Platform owner access required" },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Get the current session without enforcing authentication.
 * Returns null if not authenticated.
 */
export async function getSession() {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user;
  } catch {
    return null;
  }
}
