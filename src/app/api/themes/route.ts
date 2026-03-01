import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, themesKey, brandingKey } from "@/lib/constants";
import { getOrgId } from "@/lib/org";
import { requireAuth } from "@/lib/auth";
import { THEME_VIBES } from "@/lib/theme-vibes";
import type { BrandingSettings, StoreTheme, ThemeStore } from "@/types/settings";

/** Get Entry Dark preset colors for the default theme baseline */
const entryDark = THEME_VIBES.find((p) => p.id === "entry-dark")!;

/** Platform-neutral default branding — the Entry Dark theme baseline */
const DEFAULT_BRANDING: BrandingSettings = {
  org_name: "Entry",
  logo_url: "",
  accent_color: entryDark.colors.accent,
  background_color: entryDark.colors.background,
  card_color: entryDark.colors.card,
  text_color: entryDark.colors.text,
  card_border_color: entryDark.colors.border,
  heading_font: "Space Mono",
  body_font: "Inter",
  copyright_text: "",
};

/** Template presets for creating new themes */
const TEMPLATE_PRESETS: Record<string, BrandingSettings> = {
  midnight: {
    ...DEFAULT_BRANDING,
  },
  aura: {
    ...DEFAULT_BRANDING,
    accent_color: "#f59e0b",
    background_color: "#0c0a09",
    card_color: "#1c1917",
    text_color: "#fafaf9",
    heading_font: "Outfit",
    body_font: "Inter",
  },
};

function generateId(): string {
  return `theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET /api/themes — List all themes for the current org (public read)
 */
export async function GET() {
  try {
    const orgId = await getOrgId();
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: getDefaultThemeStore() });
    }

    const key = themesKey(orgId);
    const { data: row } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    if (row?.data && typeof row.data === "object") {
      const store = row.data as ThemeStore;
      // Ensure themes array and active_theme_id exist
      if (!store.themes || !Array.isArray(store.themes)) {
        return NextResponse.json({ data: getDefaultThemeStore() });
      }
      return NextResponse.json({ data: store });
    }

    // No themes stored yet — check if there's existing branding to migrate
    const brandingRow = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", brandingKey(orgId))
      .single();

    const existingBranding = brandingRow.data?.data as BrandingSettings | null;
    const store = getDefaultThemeStore(existingBranding || undefined);

    return NextResponse.json({ data: store });
  } catch {
    return NextResponse.json({ data: getDefaultThemeStore() });
  }
}

/**
 * POST /api/themes — Create, update, delete, or activate a theme (admin only)
 *
 * Actions:
 *   { action: "create", name, template, branding? }
 *   { action: "update", id, branding, name? }
 *   { action: "delete", id }
 *   { action: "activate", id }
 *   { action: "duplicate", id, name? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const body = await request.json();
    const { action } = body;

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Load current theme store
    const key = themesKey(orgId);
    const { data: row } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    let store: ThemeStore =
      row?.data && typeof row.data === "object" && (row.data as ThemeStore).themes
        ? (row.data as ThemeStore)
        : getDefaultThemeStore();

    const now = new Date().toISOString();

    switch (action) {
      case "create": {
        const template = body.template || "midnight";
        const preset = TEMPLATE_PRESETS[template] || TEMPLATE_PRESETS.midnight;
        const newTheme: StoreTheme = {
          id: generateId(),
          name: body.name || `${template.charAt(0).toUpperCase() + template.slice(1)} Copy`,
          template: template as StoreTheme["template"],
          branding: { ...preset, ...(body.branding || {}) },
          created_at: now,
          updated_at: now,
        };
        store.themes.push(newTheme);
        await saveThemeStore(supabase, key, store);
        return NextResponse.json({ data: newTheme, store });
      }

      case "update": {
        const idx = store.themes.findIndex((t) => t.id === body.id);
        if (idx === -1) {
          return NextResponse.json(
            { error: "Theme not found" },
            { status: 404 }
          );
        }
        if (body.branding) {
          store.themes[idx].branding = {
            ...store.themes[idx].branding,
            ...body.branding,
          };
        }
        if (body.name) {
          store.themes[idx].name = body.name;
        }
        store.themes[idx].updated_at = now;
        await saveThemeStore(supabase, key, store);

        // If this is the active theme, sync branding to the live key
        if (store.active_theme_id === body.id) {
          await syncBrandingToLive(supabase, store.themes[idx].branding, orgId);
        }

        return NextResponse.json({ data: store.themes[idx], store });
      }

      case "delete": {
        if (store.active_theme_id === body.id) {
          return NextResponse.json(
            { error: "Cannot delete the active theme" },
            { status: 400 }
          );
        }
        store.themes = store.themes.filter((t) => t.id !== body.id);
        await saveThemeStore(supabase, key, store);
        return NextResponse.json({ success: true, store });
      }

      case "activate": {
        const theme = store.themes.find((t) => t.id === body.id);
        if (!theme) {
          return NextResponse.json(
            { error: "Theme not found" },
            { status: 404 }
          );
        }
        store.active_theme_id = body.id;
        await saveThemeStore(supabase, key, store);

        // Sync the activated theme's branding to the live branding key
        await syncBrandingToLive(supabase, theme.branding, orgId);

        return NextResponse.json({ success: true, store });
      }

      case "duplicate": {
        const source = store.themes.find((t) => t.id === body.id);
        if (!source) {
          return NextResponse.json(
            { error: "Theme not found" },
            { status: 404 }
          );
        }
        const dup: StoreTheme = {
          id: generateId(),
          name: body.name || `${source.name} (Copy)`,
          template: source.template,
          branding: { ...source.branding },
          created_at: now,
          updated_at: now,
        };
        store.themes.push(dup);
        await saveThemeStore(supabase, key, store);
        return NextResponse.json({ data: dup, store });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Save theme store to site_settings */
async function saveThemeStore(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  key: string,
  store: ThemeStore
) {
  if (!supabase) return;
  await supabase.from(TABLES.SITE_SETTINGS).upsert(
    {
      key,
      data: store as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

/** Sync a theme's branding to the live branding key so all event pages use it.
 *  Merges theme branding on top of existing live branding to preserve fields
 *  that only exist in the live key (about_section, favicon_url, logo_height, etc). */
async function syncBrandingToLive(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  branding: BrandingSettings,
  orgId: string
) {
  if (!supabase) return;
  const key = brandingKey(orgId);

  // Read existing live branding first
  const { data: existing } = await supabase
    .from(TABLES.SITE_SETTINGS)
    .select("data")
    .eq("key", key)
    .single();

  const existingBranding = (existing?.data as BrandingSettings) || {};

  // Merge: existing fields preserved, theme branding wins for overlapping keys
  const merged = { ...existingBranding, ...branding };

  await supabase.from(TABLES.SITE_SETTINGS).upsert(
    {
      key,
      data: merged as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

/** Generate default theme store — creates one Entry Dark theme from existing branding or defaults */
function getDefaultThemeStore(existingBranding?: BrandingSettings): ThemeStore {
  const now = new Date().toISOString();
  const midnightTheme: StoreTheme = {
    id: "default_midnight",
    name: "Entry Dark",
    template: "midnight",
    branding: { ...DEFAULT_BRANDING, ...(existingBranding || {}) },
    created_at: now,
    updated_at: now,
  };
  return {
    active_theme_id: midnightTheme.id,
    themes: [midnightTheme],
  };
}
