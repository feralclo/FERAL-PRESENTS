import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { searchTracks, isConfigured } from "@/lib/spotify/client";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/spotify/search?q=<query>&limit=<1..50>
 *
 * Proxy to Spotify's search API using the backend's client-credentials
 * token. Returns iOS-shaped track DTOs.
 *
 * Auth: rep bearer token required.
 * Validation: empty q or q < 2 chars → 400.
 * Cache: per (q, limit) ~5 min (inside lib/spotify/client).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 20;

    if (q.length < 2) {
      return NextResponse.json(
        { error: "q must be at least 2 characters" },
        { status: 400 }
      );
    }
    if (q.length > 200) {
      return NextResponse.json(
        { error: "q must be 200 characters or fewer" },
        { status: 400 }
      );
    }

    if (!isConfigured()) {
      // Not an error — return empty result so the picker renders "no
      // results" rather than a scary error banner when creds aren't wired.
      // Spotify credential gaps get surfaced via /admin tooling / Sentry.
      return NextResponse.json({ data: [], note: "spotify_unconfigured" });
    }

    try {
      const tracks = await searchTracks(q, limit);
      return NextResponse.json({ data: tracks });
    } catch (err) {
      Sentry.captureException(err, {
        level: "warning",
        extra: { step: "spotify/search", q, limit, repId: auth.rep.id },
      });
      return NextResponse.json(
        { error: "spotify_unreachable" },
        { status: 502 }
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/search] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
