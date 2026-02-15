import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID, SUPABASE_URL } from "@/lib/constants";

/**
 * Get a Supabase client for rep table lookups.
 *
 * Uses the service role key when available (bypasses RLS) so that rep
 * portal reads/writes work even if RLS policies on the reps table don't
 * grant access to the authenticated user's role. Falls back to the
 * session-based server client.
 */
async function getRepDbClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && SUPABASE_URL) {
    return createClient(SUPABASE_URL, serviceRoleKey);
  }
  return getSupabaseServer();
}

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
    // This is defense-in-depth: the middleware also blocks rep users from admin
    // routes, but we check here too in case the middleware is bypassed.
    // Dual-role users (is_admin + is_rep) are allowed — is_admin always wins.
    const meta = user.app_metadata;
    const hasRepFlag = meta?.is_rep === true || meta?.role === "rep";
    const hasAdminFlag = meta?.is_admin === true;
    if (hasRepFlag && !hasAdminFlag) {
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
    const repDb = await getRepDbClient();
    if (!repDb) {
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Service unavailable" },
          { status: 503 }
        ),
      };
    }

    // Look up the rep row linked to this auth user
    const { data: rep, error: repErr } = await repDb
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
        const { data: repByEmail } = await repDb
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
          await repDb
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
