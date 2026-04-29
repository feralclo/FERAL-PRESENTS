import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const limiter = createRateLimiter("event-check-slug", {
  limit: 30,
  windowSeconds: 60,
});

/**
 * GET /api/events/check-slug?slug=my-event — Check event-slug availability.
 *
 * Phase 2.2 of EVENT-BUILDER-PLAN. Powers the Start moment's live slug
 * indicator. Org-scoped: a slug taken in another tenant is fine for ours.
 *
 * Auth required (it leaks the existence of an event in this org). Rate
 * limited to keep the keystroke-debounced check from being abused.
 */
export async function GET(request: NextRequest) {
  const blocked = limiter(request);
  if (blocked) return blocked;

  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    const raw = (request.nextUrl.searchParams.get("slug") || "").trim();
    const slug = normaliseSlug(raw);

    if (slug.length < 2) {
      return NextResponse.json({ available: false, slug, reason: "too_short" });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 },
      );
    }

    const { data, error } = await supabase
      .from(TABLES.EVENTS)
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json(
        { error: "Couldn't check that slug." },
        { status: 500 },
      );
    }

    return NextResponse.json({ available: !data, slug });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function normaliseSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
