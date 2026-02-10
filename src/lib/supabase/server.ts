import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create Supabase client for Server Components and API routes.
 * Always bypasses cache (cache: 'no-store') for fresh data.
 * Returns null if env vars are not configured.
 *
 * Env vars are read at call time (not module level) to ensure they're
 * available even if the module loads before env vars are injected.
 */
export async function getSupabaseServer() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
      "[FERAL] Supabase env vars not set — NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required"
    );
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
    global: {
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
        return fetch(url, { ...options, cache: "no-store" });
      },
    },
  });
}
