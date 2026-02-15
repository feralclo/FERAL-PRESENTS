import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES, ORG_ID } from "@/lib/constants";

/**
 * Auth helper for API routes.
 *
 * Verifies the current request has a valid Supabase Auth session.
 * Returns the authenticated user or a 401 NextResponse.
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

    // Look up the rep row linked to this auth user
    const { data: rep, error: repErr } = await supabase
      .from(TABLES.REPS)
      .select("id, auth_user_id, email, org_id, status")
      .eq("auth_user_id", user.id)
      .eq("org_id", ORG_ID)
      .single();

    if (repErr || !rep) {
      console.error("[requireRepAuth] Rep lookup failed:", {
        authUserId: user.id,
        authEmail: user.email,
        orgId: ORG_ID,
        repErr: repErr?.message,
      });
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Rep account not found" },
          { status: 403 }
        ),
      };
    }

    if (rep.status !== "active") {
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Your account is not active. Please contact support." },
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
