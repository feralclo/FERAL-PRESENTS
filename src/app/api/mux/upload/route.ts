import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMuxClient } from "@/lib/mux";

/**
 * POST /api/mux/upload — Create a Mux asset from a URL.
 *
 * The video is already uploaded to Supabase Storage. This tells Mux
 * to download it server-to-server — no CORS, no browser upload issues.
 *
 * Body: { videoUrl: string } — the public URL of the uploaded video
 * Returns: { assetId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const mux = getMuxClient();
    if (!mux) {
      return NextResponse.json(
        { error: "Mux not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET." },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { videoUrl } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { error: "videoUrl is required" },
        { status: 400 },
      );
    }

    // Tell Mux to download and process the video from the URL
    const asset = await mux.video.assets.create({
      inputs: [{ url: videoUrl }],
      playback_policies: ["public"],
    });

    return NextResponse.json({
      assetId: asset.id,
    });
  } catch (e) {
    console.error("[mux/upload] Error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Mux error: ${msg}` }, { status: 500 });
  }
}
