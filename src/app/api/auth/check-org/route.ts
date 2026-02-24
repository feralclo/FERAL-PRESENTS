import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "@/lib/constants";

/**
 * GET /api/auth/check-org — Check if the authenticated user already has an org.
 *
 * Used by the onboarding wizard to redirect users who already have an org.
 * Returns { has_org: boolean, org_id?: string }.
 */
export async function GET() {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only — no cookies to set
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ has_org: false, authenticated: false });
    }

    // Query org_users with service role to bypass RLS
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
    const { data: orgUser } = await adminClient
      .from(TABLES.ORG_USERS)
      .select("org_id")
      .eq("auth_user_id", user.id)
      .in("status", ["active"])
      .limit(1)
      .single();

    if (orgUser?.org_id) {
      return NextResponse.json({
        has_org: true,
        org_id: orgUser.org_id,
        authenticated: true,
      });
    }

    return NextResponse.json({ has_org: false, authenticated: true });
  } catch (err) {
    console.error("[check-org] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
