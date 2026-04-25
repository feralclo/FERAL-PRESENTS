import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/constants";

let adminClient: SupabaseClient | null = null;

/**
 * Get a Supabase client for server-side data operations.
 *
 * Strategy (in order of preference):
 * 1. Service role key (bypasses RLS entirely) — best for admin routes
 * 2. Session-based server client (has user's auth context) — same as before
 *
 * This ensures we NEVER downgrade from the original behavior. If the
 * service role key is available, we get full access. If not, we fall
 * back to the exact same session-based client the routes used before.
 *
 * IMPORTANT: Only use on the server side (API routes, server components).
 */
export async function getSupabaseAdmin(): Promise<SupabaseClient | null> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Prefer service role key — bypasses RLS entirely
  if (serviceRoleKey && SUPABASE_URL) {
    if (!adminClient) {
      adminClient = createClient(SUPABASE_URL, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        // Bypass Next.js Data Cache on every Supabase call. Without this,
        // repeat queries with identical URLs (e.g. /stories/feed within
        // a tight window — same author_pool, same `expires_at > now`
        // rounded to the same instant) get served from a stale cache
        // entry. Symptom: rep posts a story, the next /stories/feed
        // request omits it for ~10–15 min until the cache entry rotates.
        // Same pattern as getSupabaseServer() and the bearer-validation
        // client (commit e54e284).
        global: {
          fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
            fetch(url, { ...options, cache: "no-store" }),
        },
      });
    }
    return adminClient;
  }

  // Fallback: session-based server client (preserves user's auth context)
  // This is the SAME client routes used before — never worse than original behavior
  return getSupabaseServer();
}
