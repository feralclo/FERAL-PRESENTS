"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Get singleton Supabase client for browser usage.
 * Uses @supabase/ssr for proper Next.js integration.
 * Custom fetch wrapper bypasses browser HTTP cache (matches existing feral-settings.js pattern).
 */
export function getSupabaseClient() {
  if (client) return client;

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          return fetch(url, { ...options, cache: "no-store" });
        },
      },
    }
  );

  return client;
}
