import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { createRateLimiter } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

// 30 lookups per minute per IP — lightweight but rate-limited
const autoLimiter = createRateLimiter("discount-auto", {
  limit: 30,
  windowSeconds: 60,
});

/**
 * GET /api/discounts/auto?event_id=xxx
 *
 * Public endpoint — returns the active auto-apply discount for an event.
 * Used by event pages to automatically apply flash sale discounts.
 *
 * Returns: { discount?: { code, type, value, expires_at } } or { discount: null }
 */
export async function GET(request: NextRequest) {
  try {
    const blocked = autoLimiter(request);
    if (blocked) return blocked;

    const orgId = getOrgIdFromRequest(request);
    const eventId = request.nextUrl.searchParams.get("event_id");

    if (!eventId) {
      return NextResponse.json({ discount: null });
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ discount: null });
    }

    const now = new Date().toISOString();

    // Find active auto-apply discount that applies to this event
    // Priority: most specific (event-targeted) first, then most recent
    const { data: discounts } = await supabase
      .from(TABLES.DISCOUNTS)
      .select("id, code, type, value, expires_at, applicable_event_ids")
      .eq("org_id", orgId)
      .eq("auto_apply", true)
      .eq("status", "active")
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order("created_at", { ascending: false });

    if (!discounts || discounts.length === 0) {
      return NextResponse.json({ discount: null });
    }

    // Filter to discounts that apply to this event
    // Then prioritize: event-specific > all-events
    let match = null;

    // First pass: event-specific discounts
    for (const d of discounts) {
      if (
        d.applicable_event_ids &&
        d.applicable_event_ids.length > 0 &&
        d.applicable_event_ids.includes(eventId)
      ) {
        match = d;
        break;
      }
    }

    // Second pass: all-events discounts (applicable_event_ids is null/empty)
    if (!match) {
      for (const d of discounts) {
        if (!d.applicable_event_ids || d.applicable_event_ids.length === 0) {
          match = d;
          break;
        }
      }
    }

    if (!match) {
      return NextResponse.json({ discount: null });
    }

    return NextResponse.json({
      discount: {
        code: match.code,
        type: match.type,
        value: match.value,
        expires_at: match.expires_at,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ discount: null });
  }
}
