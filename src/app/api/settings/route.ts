import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * Keys that can be read without authentication (public GET).
 * Only event configs, branding, and marketing settings are public.
 * Everything else (stripe accounts, email config, wallet config, media) requires auth.
 */
function isPublicSettingsKey(key: string): boolean {
  // Event-specific settings (e.g., feral_event_liverpool, feral_event_kompass)
  if (key.match(/^[a-z0-9_]+_event_[a-z0-9_-]+$/)) return true;
  // Org branding (e.g., feral_branding)
  if (key.match(/^[a-z0-9_]+_branding$/)) return true;
  // Marketing/pixel settings (e.g., feral_marketing)
  if (key.match(/^[a-z0-9_]+_marketing$/)) return true;
  // VAT settings (e.g., feral_vat) — needed by checkout + event pages
  if (key.match(/^[a-z0-9_]+_vat$/)) return true;
  return false;
}

/**
 * GET /api/settings?key=feral_event_liverpool
 * Server-side settings fetch — avoids exposing anon key in client requests.
 * Only whitelisted keys are accessible without auth — prevents probing of
 * internal config like Stripe account IDs, email settings, or wallet config.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  // Block access to non-public settings keys for unauthenticated requests
  if (!isPublicSettingsKey(key)) {
    // Check if user is authenticated — admin can read any key
    const auth = await requireAuth();
    if (auth.error) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const { data, error } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    if (error || !data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: data.data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/settings
 * Save settings to Supabase. Used by admin dashboard.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { key, data } = body;

    if (!key || !data) {
      return NextResponse.json(
        { error: "Missing key or data" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bust Next.js page cache — settings changes should reflect immediately
    // The key format is like "feral_event_liverpool" or "feral_event_<slug>"
    const slugMatch = key.match(/^feral_event_(.+)$/);
    if (slugMatch) {
      revalidatePath(`/event/${slugMatch[1]}`);
      revalidatePath(`/event/${slugMatch[1]}/checkout`);
    }
    // Also revalidate well-known event slugs mapped to this key
    if (key === "feral_event_liverpool") {
      revalidatePath("/event/liverpool-27-march");
    }
    if (key === "feral_event_kompass") {
      revalidatePath("/event/kompass-klub-7-march");
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
