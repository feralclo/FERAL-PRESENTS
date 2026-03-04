import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";

/**
 * GET /api/rep-portal/download-media?url=...
 *
 * Proxies an image/video URL server-side and returns it with
 * Content-Disposition: attachment so the browser triggers a native download.
 * This avoids CORS issues when fetching from Supabase Storage / CDN.
 */
export async function GET(request: NextRequest) {
  // Auth check — only reps can download
  const auth = await requireRepAuth();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Only allow known storage domains
  const parsed = new URL(url);
  const allowed = [
    "supabase.co",
    "supabase.in",
    "stream.mux.com",
    "image.mux.com",
  ];
  if (!allowed.some((d) => parsed.hostname.endsWith(d))) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json({ error: "Failed to fetch media" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const ext = contentType.includes("png") ? "png" : contentType.includes("video") ? "mp4" : "jpg";

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="story.${ext}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 502 });
  }
}
