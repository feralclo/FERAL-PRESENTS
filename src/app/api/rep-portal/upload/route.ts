import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireRepAuth } from "@/lib/auth";

/**
 * POST /api/rep-portal/upload — Upload an image (rep-authenticated).
 *
 * Same storage mechanism as /api/upload (site_settings JSONB) but uses
 * rep auth instead of admin auth. Used for profile photos and quest proofs.
 *
 * Body: { imageData: string (base64 data URI), key: string (unique identifier) }
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const { imageData, key } = await request.json();

    if (!imageData || !key) {
      return NextResponse.json(
        { error: "imageData and key are required" },
        { status: 400 }
      );
    }

    if (!imageData.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "imageData must be a base64 data URI" },
        { status: 400 }
      );
    }

    // 7MB base64 ~ 5MB raw image
    const MAX_SIZE = 7 * 1024 * 1024;
    if (imageData.length > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image too large. Maximum size is 5MB." },
        { status: 413 }
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "image/avif",
    ];
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

    const contentType =
      imageData.match(/^data:(image\/\w+);/)?.[1] || "image/jpeg";

    const orgId = auth.rep.org_id;
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
      console.error("[rep-portal/upload] Storage error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const url = `/api/media/${orgId}_${key}`;
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[rep-portal/upload] Error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
