import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
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
