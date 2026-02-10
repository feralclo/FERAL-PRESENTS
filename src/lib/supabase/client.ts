"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Get singleton Supabase client for browser usage.
 * Uses @supabase/ssr for proper Next.js integration.
 * Custom fetch wrapper bypasses browser HTTP cache (matches existing feral-settings.js pattern).
 * Returns null if env vars are not configured.
 */
export function getSupabaseClient() {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
      "[FERAL] Supabase env vars not set — NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required"
    );
    return null;
  }

  client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
        return fetch(url, { ...options, cache: "no-store" });
      },
    },
  });

  return client;
}
