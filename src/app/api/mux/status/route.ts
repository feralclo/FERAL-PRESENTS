import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMuxClient } from "@/lib/mux";

/**
 * GET /api/mux/status?assetId=xxx — Check Mux asset processing status.
 *
 * Returns the playback ID once the asset is ready.
 * Client polls this every 3s after creating the asset.
 *
 * Returns: { status: string, playbackId?: string }
 *   status: "processing" | "ready" | "errored"
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const assetId = request.nextUrl.searchParams.get("assetId");
    if (!assetId) {
      return NextResponse.json({ error: "assetId required" }, { status: 400 });
    }

    const mux = getMuxClient();
    if (!mux) {
      return NextResponse.json({ error: "Mux not configured" }, { status: 503 });
    }

    const asset = await mux.video.assets.retrieve(assetId);

    if (asset.status === "preparing") {
      return NextResponse.json({ status: "processing" });
    }

    if (asset.status === "errored") {
      return NextResponse.json({ status: "errored" });
    }

    // Asset is ready — return the playback ID
    const playbackId = asset.playback_ids?.[0]?.id;
    if (!playbackId) {
      return NextResponse.json({ status: "errored" });
    }

    return NextResponse.json({ status: "ready", playbackId });
  } catch (e) {
    console.error("[mux/status] Error:", e);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
