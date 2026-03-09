import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth, requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/upload — Upload an image and get back a serving URL.
 *
 * Images are stored in the site_settings table (JSONB) which reliably handles
 * large data (proven by Liverpool's minimalBgImage). The events table then
 * stores only a short URL string pointing to /api/media/{key}.
 *
 * Accepts admin auth (primary) or rep auth (fallback — for quest proof uploads).
 *
 * Body: { imageData: string (base64 data URI), key: string (unique identifier) }
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Try admin auth first, fall back to rep auth (quest proof uploads)
    let orgId: string;
    const auth = await requireAuth();
    if (auth.error) {
      const repAuth = await requireRepAuth();
      if (repAuth.error) return repAuth.error;
      orgId = repAuth.rep.org_id;
    } else {
      orgId = auth.orgId;
    }

    const body = await request.json();
    // Accept both "imageData" (current) and "image" (legacy) param names
    const imageData: string | undefined = body.imageData || body.image;
    const key: string | undefined = body.key;

    if (!imageData || !key) {
      return NextResponse.json(
        { error: "imageData and key are required" },
        { status: 400 }
      );
    }

    // Validate it's a data URI
    if (!imageData.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "imageData must be a base64 data URI" },
        { status: 400 }
      );
    }

    // Enforce 5MB max file size (base64 is ~33% larger than raw, so 5MB raw ≈ 6.7MB base64)
    const MAX_SIZE = 7 * 1024 * 1024; // 7MB base64 ≈ 5MB raw image
    if (imageData.length > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image too large. Maximum size is 5MB." },
        { status: 413 }
      );
    }

    // Validate content type is a safe image format
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/avif"];
    const detectedType = imageData.match(/^data:(image\/[\w+.-]+);/)?.[1];
    if (!detectedType || !allowedTypes.includes(detectedType)) {
      return NextResponse.json(
        { error: "Unsupported image format" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Detect content type from data URI
    const contentType = imageData.match(/^data:(image\/\w+);/)?.[1] || "image/jpeg";

    // Store in site_settings with org-namespaced media_ prefix
    const storageKey = `media_${orgId}_${key}`;
    const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert(
      {
        key: storageKey,
        data: { image: imageData, contentType },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      console.error("[upload] Storage error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return the serving URL (cache-bust so browser fetches new version on replace)
    const url = `/api/media/${orgId}_${key}?v=${Date.now()}`;
    console.log(`[upload] Stored image: key=${storageKey}, size=${Math.round(imageData.length / 1024)}KB, url=${url}`);

    return NextResponse.json({ url, key: `${orgId}_${key}` });
  } catch (e) {
    Sentry.captureException(e);
    console.error("[upload] Error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
