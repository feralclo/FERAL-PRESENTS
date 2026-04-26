import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMuxClient } from "@/lib/mux";
import * as Sentry from "@sentry/nextjs";

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

    // Tell Mux to download and process the video from the URL.
    // mp4_support: "capped-1080p" produces a downloadable capped-1080p.mp4
    // file. We use "capped-1080p" rather than the deprecated "standard"
    // because "standard" is rejected on Mux accounts using the default
    // "basic" video_quality tier — which causes a 400 invalid_parameters
    // error. 1080p matches what Instagram and TikTok cap uploads at, so
    // there's zero quality loss for the rep-share use case.
    const asset = await mux.video.assets.create({
      inputs: [{ url: videoUrl }],
      playback_policies: ["public"],
      mp4_support: "capped-1080p",
    });

    return NextResponse.json({
      assetId: asset.id,
    });
  } catch (e) {
    Sentry.captureException(e);
    // Surface the actual Mux response body when available — APIError from
    // @mux/mux-node carries .status and .error so we can tell the admin UI
    // exactly what went wrong instead of a generic 500.
    const errAny = e as {
      status?: number;
      error?: { type?: string; messages?: string[] };
      message?: string;
    };
    const muxStatus = errAny?.status;
    const muxType = errAny?.error?.type;
    const muxMessages = errAny?.error?.messages?.join("; ");
    const detail =
      muxMessages ||
      muxType ||
      (e instanceof Error ? e.message : "Unknown error");
    console.error("[mux/upload] Error:", {
      status: muxStatus,
      type: muxType,
      messages: muxMessages,
    });
    return NextResponse.json(
      { error: `Mux error: ${detail}` },
      { status: muxStatus && muxStatus < 500 ? muxStatus : 500 }
    );
  }
}
