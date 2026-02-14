import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/upload — Upload an image and get back a serving URL.
 *
 * Images are stored in the site_settings table (JSONB) which reliably handles
 * large data (proven by Liverpool's minimalBgImage). The events table then
 * stores only a short URL string pointing to /api/media/{key}.
 *
 * Body: { imageData: string (base64 data URI), key: string (unique identifier) }
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { imageData, key } = await request.json();

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

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Detect content type from data URI
    const contentType = imageData.match(/^data:(image\/\w+);/)?.[1] || "image/jpeg";

    // Store in site_settings with a media_ prefix
    const storageKey = `media_${key}`;
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

    // Return the serving URL
    const url = `/api/media/${key}`;
    console.log(`[upload] Stored image: key=${storageKey}, size=${Math.round(imageData.length / 1024)}KB, url=${url}`);

    return NextResponse.json({ url });
  } catch (e) {
    console.error("[upload] Error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
