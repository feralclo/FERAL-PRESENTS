import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

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
