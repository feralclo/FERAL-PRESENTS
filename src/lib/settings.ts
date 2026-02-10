import type { EventSettings } from "@/types/settings";

/**
 * Fetch settings from Supabase (server-side).
 * Used by Server Components to pre-fetch settings — eliminates FOUC.
 */
export async function fetchSettings(
  key: string
): Promise<EventSettings | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=data`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) return null;

    const rows = await res.json();
    if (!rows || rows.length === 0) return null;

    return rows[0].data as EventSettings;
  } catch {
    return null;
  }
}

/**
 * Save settings to Supabase (client-side, used by admin).
 * Routes through /api/settings which uses server-side Supabase .upsert().
 * Matches the original js/feral-settings.js pattern.
 */
export async function saveSettings(
  key: string,
  data: EventSettings
): Promise<{ error: Error | null }> {
  // Update localStorage cache immediately
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable
  }

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, data }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error || `Save failed: ${res.status}`;
      return { error: new Error(msg) };
    }

    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/**
 * Load settings from localStorage (synchronous fallback).
 * Matches the existing feralSettings.loadCached() pattern.
 */
export function loadCachedSettings(key: string): EventSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as EventSettings) : null;
  } catch {
    return null;
  }
}
