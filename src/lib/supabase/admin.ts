import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

let adminClient: SupabaseClient | null = null;
let anonAdminClient: SupabaseClient | null = null;

/**
 * Get a Supabase client with elevated privileges for server-side data operations.
 *
 * Uses the service role key (bypasses Row Level Security) when available.
 * Falls back to a plain anon-key client (no cookies/session) as a last resort.
 *
 * IMPORTANT: This client should ONLY be used on the server side (API routes,
 * server components). Never expose the service role key to the browser.
 *
 * Auth verification should still use getSupabaseServer() via requireAuth()
 * since it needs access to the user's session cookies. This client is purely
 * for data operations AFTER auth has been verified.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Prefer service role key — bypasses RLS entirely
  if (serviceRoleKey && SUPABASE_URL) {
    if (!adminClient) {
      adminClient = createClient(SUPABASE_URL, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
    return adminClient;
  }

  // Fallback: anon key without session (for environments without service role key)
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    if (!anonAdminClient) {
      anonAdminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
    return anonAdminClient;
  }

  return null;
}
