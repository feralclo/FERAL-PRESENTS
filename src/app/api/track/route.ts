import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/constants";
import { getOrgIdFromRequest } from "@/lib/org";
import { createRateLimiter } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

// 60 tracking events per minute per IP — prevents analytics table flooding
const trackLimiter = createRateLimiter("track", {
  limit: 60,
  windowSeconds: 60,
});

/** Common bot/crawler user-agent patterns */
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|Mediapartners|Googlebot|AdsBot|Baiduspider|bingbot|DuckDuckBot|YandexBot|Sogou|exabot|facebot|ia_archiver|MJ12bot|SemrushBot|AhrefsBot|DotBot|PetalBot|HeadlessChrome|PhantomJS|Puppeteer|Lighthouse/i;

/**
 * Allowed fields for traffic_events table.
 * Only these fields are accepted — everything else is silently dropped.
 */
const TRAFFIC_ALLOWED_FIELDS = new Set([
  "event_type",
  "page_path",
  "event_name",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "session_id",
  "user_agent",
  "theme",
  "product_name",
  "product_price",
  "product_qty",
]);

/**
 * Allowed fields for popup_events table.
 */
const POPUP_ALLOWED_FIELDS = new Set([
  "event_type",
  "page",
  "user_agent",
  "email",
]);

/**
 * Pick only allowed fields from the input, with basic type validation.
 */
function sanitizeFields(
  data: Record<string, unknown>,
  allowedFields: Set<string>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in data && data[field] !== undefined && data[field] !== null) {
      const value = data[field];
      // Only allow strings and numbers — no objects, arrays, or functions
      if (typeof value === "string" || typeof value === "number") {
        // Truncate strings to prevent oversized payloads
        sanitized[field] =
          typeof value === "string" ? value.slice(0, 2048) : value;
      }
    }
  }
  return sanitized;
}

/**
 * POST /api/track
 * Server-side traffic/popup event tracking.
 * Rate limited: 60 requests per minute per IP.
 * Fields are whitelisted — only known columns are inserted.
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = trackLimiter(request);
    if (blocked) return blocked;

    // Reject bot/crawler traffic to keep analytics clean
    const ua = request.headers.get("user-agent") || "";
    if (BOT_UA.test(ua)) {
      return NextResponse.json({ success: true }); // 200 but don't store
    }

    const orgId = getOrgIdFromRequest(request);
    const body = await request.json();
    const { table, ...eventData } = body;

    const isPopup = table === "popup";
    const tableName = isPopup ? TABLES.POPUP_EVENTS : TABLES.TRAFFIC_EVENTS;
    const allowedFields = isPopup ? POPUP_ALLOWED_FIELDS : TRAFFIC_ALLOWED_FIELDS;

    // Sanitize: only allow known fields, drop everything else
    const sanitized = sanitizeFields(eventData, allowedFields);

    // Require at least event_type
    if (!sanitized.event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    // Inject Vercel geo headers for popup events (only available on Vercel deployment)
    if (isPopup) {
      const city = request.headers.get("x-vercel-ip-city");
      const country = request.headers.get("x-vercel-ip-country");
      if (city) sanitized.city = decodeURIComponent(city);
      if (country) sanitized.country = country;
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const { error } = await supabase
      .from(tableName)
      .insert({ ...sanitized, org_id: orgId });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
