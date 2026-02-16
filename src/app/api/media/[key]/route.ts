import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";

// Images are mutable (same key can be overwritten), so never statically cache this route
export const dynamic = "force-dynamic";

/**
 * GET /api/media/[key] — Serve an uploaded image.
 *
 * Fetches the base64 image from site_settings, decodes it to binary,
 * and returns it with proper Content-Type. Browser caching relies on
 * the ?v= cache-buster appended by the upload API — each new upload
 * gets a unique URL so browsers fetch fresh.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const storageKey = `media_${key}`;

    // Always fetch fresh from Supabase — no server-side caching.
    // Browser-level caching (Cache-Control below) handles repeat visits.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(storageKey)}&select=data`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
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
        // Browser caching — URLs include ?v=<timestamp> cache-buster per upload
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
