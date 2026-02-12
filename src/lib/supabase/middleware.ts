import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

/**
 * Cookie options for auth session cookies.
 * Explicit maxAge ensures sessions persist across Vercel deployments.
 * 30 days = 2592000 seconds.
 */
const COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

/**
 * Create a Supabase client for Next.js middleware.
 *
 * Middleware can't use next/headers cookies() — it must read/write cookies
 * on the request/response objects directly. This client handles:
 * - Reading auth cookies from the incoming request
 * - Writing refreshed auth cookies to the outgoing response
 *
 * Returns null if Supabase env vars are not configured.
 */
export function createMiddlewareClient(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        // Update request cookies (for downstream server components)
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        // Re-create response with updated request
        response = NextResponse.next({ request });
        // Set cookies on the response (for the browser) with explicit persistence options
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...COOKIE_OPTIONS, ...options })
        );
      },
    },
  });

  return { supabase, response: () => response };
}
