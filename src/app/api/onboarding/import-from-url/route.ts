import { NextRequest, NextResponse } from "next/server";
import { fetchBrandFromUrl } from "@/lib/brand-fetch";
import { createRateLimiter } from "@/lib/rate-limit";
import { TABLES } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// 5 imports / minute / IP — generous enough for "paste, edit, paste again"
// while preventing scraping abuse.
const limiter = createRateLimiter("brand-fetch", { limit: 5, windowSeconds: 60 });

/**
 * 24h cache key. Hash isn't crypto — we just want a short, stable filename.
 */
function cacheKey(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h << 5) - h + url.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return `platform_brand_fetch_cache_${Math.abs(h).toString(36)}`;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedResult {
  result: unknown;
  cached_at: string;
}

/**
 * POST /api/onboarding/import-from-url
 *
 * Body: { url: string }
 * Returns the brand-fetch result. Auth required (any logged-in user can call;
 * no org scope needed because the user might be pre-provisioning).
 */
export async function POST(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  // Auth: just verify the user is logged in. No org check — the wizard runs
  // before provisioning, so the user might not yet have an org row.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (url.length > 2_000) {
    return NextResponse.json({ error: "url too long" }, { status: 400 });
  }

  // Cache lookup — same user pasting the same URL twice in a session is
  // surprisingly common.
  const supabase = await getSupabaseAdmin();
  const key = cacheKey(url);

  if (supabase) {
    try {
      const { data: cached } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", key)
        .maybeSingle();
      if (cached?.data) {
        const entry = cached.data as CachedResult;
        const age = Date.now() - new Date(entry.cached_at).getTime();
        if (age < CACHE_TTL_MS && entry.result) {
          return NextResponse.json({ ...entry.result, cached: true });
        }
      }
    } catch {
      // Cache read failure is non-fatal — fall through to live fetch
    }
  }

  try {
    const result = await fetchBrandFromUrl(url);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    // Cache the result (best-effort)
    if (supabase) {
      try {
        await supabase.from(TABLES.SITE_SETTINGS).upsert(
          {
            key,
            data: { result, cached_at: new Date().toISOString() } as CachedResult,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      } catch {
        // Cache write failure is non-fatal
      }
    }

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[onboarding/import-from-url] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
