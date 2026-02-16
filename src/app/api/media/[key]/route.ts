import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

/**
 * GET /api/media/[key] — Serve an uploaded image.
 *
 * Fetches the base64 image from site_settings, decodes it to binary,
 * and returns it with proper Content-Type and aggressive cache headers.
 * This means images load like normal URLs — no base64 in page payloads.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const storageKey = `media_${key}`;

    // Fetch directly from Supabase REST (bypass server client for speed)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(storageKey)}&select=data`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        // Cache for 1 hour on server, revalidate in background
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const rows = await res.json();
    if (!rows?.[0]?.data?.image) {
      return new NextResponse(null, { status: 404 });
    }

    const { image, contentType } = rows[0].data;

    // Strip data URI prefix and decode to binary
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Content-Length": String(buffer.length),
        // Cache for 1 day — URLs include ?v= cache-buster on each upload
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
