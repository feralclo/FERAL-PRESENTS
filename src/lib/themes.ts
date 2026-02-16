import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID, themesKey } from "@/lib/constants";
import type { ThemeStore } from "@/types/settings";

/**
 * getActiveTemplate — Server-side helper to determine the active theme template.
 *
 * Fetches the ThemeStore from site_settings and returns the template string
 * of the currently active theme (e.g. "midnight", "aurora", "daylight").
 *
 * Used by:
 * - src/app/event/[slug]/layout.tsx — to set data-theme attribute + load CSS
 * - src/app/event/[slug]/page.tsx — to route to theme-specific components
 * - src/app/event/[slug]/checkout/page.tsx — to route to theme-specific checkout
 */
export async function getActiveTemplate(): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return "midnight";

    const key = themesKey(ORG_ID);
    const { data: row } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    if (!row?.data || typeof row.data !== "object") return "midnight";

    const store = row.data as ThemeStore;
    if (!store.themes || !Array.isArray(store.themes) || !store.active_theme_id) {
      return "midnight";
    }

    const active = store.themes.find((t) => t.id === store.active_theme_id);
    return active?.template || "midnight";
  } catch {
    return "midnight";
  }
}
