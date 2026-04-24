import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { searchTracks, isConfigured } from "@/lib/spotify/client";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/rep-portal/spotify/search?q=<query>&limit=<1..10>&offset=<0..990>
 *
 * Proxy to Spotify's search API using the backend's client-credentials
 * token. Returns iOS-shaped track DTOs.
 *
 * Auth: rep bearer token required.
 * Validation: empty q or q < 2 chars → 400.
 * Limit: hard-capped at 10. Spotify silently tightened their search limit
 *   from 50 → 10 in 2025 — requests with limit > 10 get 400 "Invalid limit".
 *   iOS should paginate via `offset` to render "load more".
 * Cache: per (q, limit, offset) ~5 min.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "10", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(10, rawLimit)) : 10;
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(990, rawOffset)) : 0;

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
      const tracks = await searchTracks(q, limit, offset);
      return NextResponse.json({ data: tracks, limit, offset });
    } catch (err) {
      Sentry.captureException(err, {
        level: "warning",
        extra: { step: "spotify/search", q, limit, repId: auth.rep.id },
      });
      // Diagnostic: expose the Spotify error detail in dev/preview so we
      // can see what's actually failing without round-tripping Sentry.
      // Production still returns the clean spotify_unreachable shape but
      // with a one-line message for visibility.
      const detail =
        err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240);
      console.error("[rep-portal/spotify/search] Spotify call failed:", detail);
      return NextResponse.json(
        { error: "spotify_unreachable", detail },
        { status: 502 }
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/spotify/search] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
