import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMuxClient } from "@/lib/mux";

/**
 * GET /api/mux/status?uploadId=xxx — Check Mux upload/asset status.
 *
 * Returns the playback ID once the asset is ready.
 * Client polls this every 2s after uploading.
 *
 * Returns: { status: string, playbackId?: string }
 *   status: "waiting" | "processing" | "ready" | "errored"
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const uploadId = request.nextUrl.searchParams.get("uploadId");
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId required" }, { status: 400 });
    }

    const mux = getMuxClient();
    if (!mux) {
      return NextResponse.json({ error: "Mux not configured" }, { status: 503 });
    }

    // Check the upload to get the asset ID
    const upload = await mux.video.uploads.retrieve(uploadId);

    if (upload.status === "waiting") {
      return NextResponse.json({ status: "waiting" });
    }

    if (upload.status === "errored" || upload.status === "timed_out" || upload.status === "cancelled") {
      return NextResponse.json({ status: "errored" });
    }

    // Upload complete — check the asset
    if (!upload.asset_id) {
      return NextResponse.json({ status: "processing" });
    }

    const asset = await mux.video.assets.retrieve(upload.asset_id);

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
