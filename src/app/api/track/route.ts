import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, ORG_ID } from "@/lib/constants";
import { createRateLimiter } from "@/lib/rate-limit";

// 60 tracking events per minute per IP — prevents analytics table flooding
const trackLimiter = createRateLimiter("track", {
  limit: 60,
  windowSeconds: 60,
});

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
      .insert({ ...sanitized, org_id: ORG_ID });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
