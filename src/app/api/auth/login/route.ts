import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/constants";
import { createRateLimiter } from "@/lib/rate-limit";

// 5 login attempts per 15 minutes per IP — prevents brute force
const loginLimiter = createRateLimiter("auth-login", {
  limit: 5,
  windowSeconds: 15 * 60,
});

/**
 * POST /api/auth/login
 *
 * Sign in with email and password via Supabase Auth.
 * Sets HTTP-only auth cookies for subsequent requests.
 * Rate limited: 5 attempts per 15 minutes per IP.
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = loginLimiter(request);
    if (blocked) return blocked;

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Tag user as admin in app_metadata. This is an additive flag (shallow merge)
    // that allows the same user to be both admin and rep without conflict.
    // The is_admin flag persists and overrides any is_rep flag in middleware checks.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey && SUPABASE_URL) {
      try {
        const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
        await adminClient.auth.admin.updateUserById(data.user.id, {
          app_metadata: { is_admin: true },
        });
      } catch (err) {
        // Non-fatal — admin tagging is best-effort.
        // User can still log in; they just won't be tagged yet.
        console.warn("[auth/login] Failed to tag admin metadata:", err);
      }
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
