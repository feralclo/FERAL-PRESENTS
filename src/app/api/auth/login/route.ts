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

    // Tag user as admin in app_metadata. This is REQUIRED for dual-role users
    // (admin + rep) — without is_admin, requireAuth() will block them with 403.
    // Retry once on failure to ensure the flag is set reliably.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey && SUPABASE_URL) {
      const adminClient = createClient(SUPABASE_URL, serviceRoleKey);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await adminClient.auth.admin.updateUserById(data.user.id, {
            app_metadata: { is_admin: true },
          });
          break; // success
        } catch (err) {
          if (attempt === 2) {
            console.error("[auth/login] Failed to tag admin metadata after 2 attempts:", err);
          } else {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
    } else {
      console.warn("[auth/login] SUPABASE_SERVICE_ROLE_KEY not configured — cannot tag admin metadata");
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
