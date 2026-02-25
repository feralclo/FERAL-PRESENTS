import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
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
  // Popup settings (e.g., feral_popup) — needed by event page discount popup
  if (key.match(/^[a-z0-9_]+_popup$/)) return true;
  // Homepage settings (e.g., feral_homepage) — needed by landing page server component
  if (key.match(/^[a-z0-9_]+_homepage$/)) return true;
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
    // Check if user is authenticated — admin can read their own org's keys
    const auth = await requireAuth();
    if (auth.error) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Prevent cross-tenant reads: key must start with admin's org_id prefix
    // (mirrors the POST validation at line 93)
    if (!key.startsWith(`${auth.orgId}_`) && !key.startsWith("media_") && !key.startsWith("entry_platform_") && !key.startsWith("platform_")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const supabase = await getSupabaseAdmin();
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

    // Validate the key belongs to this org — prevent cross-tenant writes.
    // Keys must start with the org's ID prefix (e.g., "feral_branding", "acme_email").
    // Only exception: platform-wide keys like "entry_platform_*" for platform owners.
    const orgId = auth.orgId;
    if (!key.startsWith(`${orgId}_`) && !key.startsWith("media_") && !key.startsWith("entry_platform_")) {
      return NextResponse.json(
        { error: "Unauthorized: cannot write settings for another org" },
        { status: 403 }
      );
    }

    const supabase = await getSupabaseAdmin();
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
    // The key format is like "{orgId}_event_{slug}"
    const slugMatch = key.match(/^[a-z0-9_]+_event_(.+)$/);
    if (slugMatch) {
      revalidatePath(`/event/${slugMatch[1]}`);
      revalidatePath(`/event/${slugMatch[1]}/checkout`);
    }

    // Revalidate homepage when homepage settings change
    if (key.match(/^[a-z0-9_]+_homepage$/)) {
      revalidatePath("/");
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
