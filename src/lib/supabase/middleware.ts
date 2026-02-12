import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

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
        // Set cookies on the response (for the browser)
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, response: () => response };
}
