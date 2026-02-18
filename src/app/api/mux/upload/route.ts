import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMuxClient } from "@/lib/mux";

/**
 * POST /api/mux/upload — Create a Mux direct upload URL.
 *
 * The client uploads directly to Mux (browser → Mux), bypassing our server.
 * Mux handles all transcoding automatically.
 *
 * Returns: { uploadUrl: string, uploadId: string }
 */
export async function POST() {
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

    const upload = await mux.video.uploads.create({
      new_asset_settings: {
        playback_policy: ["public"],
      },
      cors_origin: "*",
    });

    return NextResponse.json({
      uploadUrl: upload.url,
      uploadId: upload.id,
    });
  } catch (e) {
    console.error("[mux/upload] Error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Mux error: ${msg}` }, { status: 500 });
  }
}
