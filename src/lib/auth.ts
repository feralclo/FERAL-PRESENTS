import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { setSentryUserContext, setSentryOrgContext } from "@/lib/sentry";

/**
 * Read the `Authorization: Bearer <token>` header, if present.
 * Used by requireRepAuth to accept JWTs from native clients (iOS) that
 * can't use cookie-based Supabase sessions.
 */
async function readBearerToken(): Promise<string | null> {
  try {
    const h = await headers();
    const auth = h.get("authorization") || h.get("Authorization");
    if (!auth) return null;
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Validate a Supabase access token and return the user.
 * Uses an anon-key client so the lookup doesn't touch the cookie session.
 *
 * CRITICAL: overrides the client's fetch with `cache: 'no-store'`. Without
 * this, Next.js 16's Data Cache silently caches the /auth/v1/user call on
 * Vercel production (dev is un-cached, which is why this worked locally
 * but regressed on prod). A cached stale-or-failed response made every
 * Bearer-authed rep-portal call return 401 "Authentication required".
 */
async function getUserFromBearerToken(token: string): Promise<User | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[requireRepAuth] Bearer validation skipped — Supabase env vars missing");
    return null;
  }
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (url, options = {}) =>
          fetch(url, { ...options, cache: "no-store" }),
      },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      // Surface the real cause. Most common in prod: token expired / signed
      // by a different Supabase project / anon key mismatch.
      console.warn("[requireRepAuth] Bearer token rejected by Supabase:", {
        code: error?.code,
        message: error?.message,
        status: error?.status,
      });
      return null;
    }
    return data.user;
  } catch (err) {
    // Network error reaching Supabase — log so future debugging doesn't
    // have to guess whether the token was invalid or the call never fired.
    console.error("[requireRepAuth] Bearer validation threw:", err);
    return null;
  }
}

/**
 * Auth helper for admin API routes.
 *
 * Verifies the current request has a valid Supabase Auth session
 * AND that the user is NOT a rep (reps have their own auth via requireRepAuth).
 * Returns the authenticated admin user + orgId or an error NextResponse.
 *
 * Usage in API routes:
 *   const auth = await requireAuth();
 *   if (auth.error) return auth.error;
 *   const { user, orgId } = auth;
 */
export async function requireAuth(): Promise<
  | { user: { id: string; email: string }; orgId: string; error: null }
  | { user: null; orgId: null; error: NextResponse }
> {
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return {
        user: null,
        orgId: null,
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
        orgId: null,
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
        orgId: null,
        error: NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        ),
      };
    }

    const orgId = await getOrgId();

    // Enrich Sentry with auth context — every error from this request
    // will be tagged with the user and org for easy filtering
    setSentryUserContext({ id: user.id, email: user.email, role: "admin", orgId });

    return {
      user: { id: user.id, email: user.email || "" },
      orgId,
      error: null,
    };
  } catch {
    return {
      user: null,
      orgId: null,
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
 *
 * Options:
 *   allowPending — if true, pending reps are allowed through (for onboarding flows)
 */
export async function requireRepAuth(options?: { allowPending?: boolean }): Promise<
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
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    // Fallback: accept Authorization: Bearer <token> for native clients (iOS)
    // that can't use cookie-based sessions.
    let user = cookieUser;
    if (!user) {
      const bearer = await readBearerToken();
      if (bearer) {
        user = await getUserFromBearerToken(bearer);
      }
    }

    if (!user) {
      return {
        rep: null,
        error: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        ),
      };
    }

    const orgId = await getOrgId();

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
      .eq("org_id", orgId)
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
          .eq("org_id", orgId)
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
            .eq("org_id", orgId);

          repByEmail.auth_user_id = user.id;

          if (repByEmail.status !== "active") {
            if (options?.allowPending && repByEmail.status === "pending") {
              return { rep: repByEmail, error: null };
            }
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
        orgId,
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
      if (options?.allowPending && rep.status === "pending") {
        // Allow pending reps through for onboarding flows
      } else {
        return {
          rep: null,
          error: NextResponse.json(
            { error: "Your account is not active. Please contact support.", code: `rep_${rep.status}` },
            { status: 403 }
          ),
        };
      }
    }

    setSentryUserContext({ id: rep.auth_user_id, email: rep.email, role: "rep", orgId: rep.org_id });

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
  | { user: { id: string; email: string }; orgId: string; error: null }
  | { user: null; orgId: null; error: NextResponse }
> {
  const auth = await requireAuth();
  if (auth.error) return auth;

  // Check for platform owner flag
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return {
      user: null,
      orgId: null,
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
      orgId: null,
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
