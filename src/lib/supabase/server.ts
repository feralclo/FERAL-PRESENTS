import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

/**
 * Create Supabase client for Server Components and API routes.
 * Always bypasses cache (cache: 'no-store') for fresh data.
 * Returns null if Supabase env vars are not configured.
 */
export async function getSupabaseServer() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const cookieStore = await cookies();

    return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  } catch {
    return null;
  }
}
