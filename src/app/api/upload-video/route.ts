import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";

const BUCKET = "artist-media";

/**
 * POST /api/upload-video — Get a signed upload URL for Supabase Storage.
 *
 * The client compresses the video (FFmpeg WASM), then uploads directly to
 * the signed URL (browser → Supabase), bypassing Vercel's 4.5MB body limit.
 *
 * Body: { filename: string, contentType: string }
 * Returns: { signedUrl: string, publicUrl: string, path: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename and contentType are required" },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: mp4, webm, mov, jpg, png, webp" },
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

    // Generate a unique path: artists/{timestamp}_{filename}
    const ext = filename.split(".").pop() || "mp4";
    const safeName = filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
    const path = `artists/${Date.now()}_${safeName}`;

    // Create signed upload URL (expires in 10 minutes, upsert enabled)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error) {
      console.error("[upload-video] Signed URL error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build the public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: publicUrlData.publicUrl,
    });
  } catch (e) {
    console.error("[upload-video] Error:", e);
    return NextResponse.json({ error: "Upload setup failed" }, { status: 500 });
  }
}
