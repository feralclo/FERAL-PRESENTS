import { NextRequest, NextResponse } from "next/server";
import { fetchMarketingSettings, hashSHA256, sendMetaEvents } from "@/lib/meta";
import { getOrgIdFromRequest } from "@/lib/org";
import type { MetaCAPIRequest, MetaEventPayload } from "@/types/marketing";

/**
 * POST /api/meta/capi
 * Receives client-side event data, enriches with server-side signals
 * (IP, user agent), and forwards to Meta Conversions API.
 */
export async function POST(request: NextRequest) {
  try {
    const body: MetaCAPIRequest = await request.json();
    const { event_name, event_id, event_source_url, user_data, custom_data } = body;

    if (!event_name || !event_id) {
      return NextResponse.json(
        { error: "Missing event_name or event_id" },
        { status: 400 }
      );
    }

    // Fetch marketing settings (pixel ID + CAPI token)
    const orgId = getOrgIdFromRequest(request);
    const settings = await fetchMarketingSettings(orgId);
    if (!settings?.meta_tracking_enabled || !settings.meta_pixel_id || !settings.meta_capi_token) {
      return NextResponse.json({ skipped: true, reason: "Meta tracking not configured" });
    }

    // Extract server-side user data from request headers
    const forwarded = request.headers.get("x-forwarded-for");
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || undefined;
    const clientUa = request.headers.get("user-agent") || undefined;

    // Build the event payload
    const event: MetaEventPayload = {
      event_name,
      event_id,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: event_source_url || "",
      action_source: "website",
      user_data: {
        client_ip_address: clientIp,
        client_user_agent: clientUa,
        fbp: user_data?.fbp || undefined,
        fbc: user_data?.fbc || undefined,
        external_id: user_data?.external_id ? hashSHA256(user_data.external_id) : undefined,
        // Hash PII if provided
        em: user_data?.em ? hashSHA256(user_data.em) : undefined,
        ph: user_data?.ph ? hashSHA256(user_data.ph) : undefined,
        fn: user_data?.fn ? hashSHA256(user_data.fn) : undefined,
        ln: user_data?.ln ? hashSHA256(user_data.ln) : undefined,
      },
      custom_data,
    };

    // Strip undefined values from user_data
    const cleanUserData = Object.fromEntries(
      Object.entries(event.user_data).filter(([, v]) => v !== undefined)
    );
    event.user_data = cleanUserData as MetaEventPayload["user_data"];

    // Send to Meta
    const result = await sendMetaEvents(
      settings.meta_pixel_id,
      settings.meta_capi_token,
      [event],
      settings.meta_test_event_code || undefined
    );

    if (result?.error) {
      console.error("[Meta CAPI]", result.error);
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, events_received: result?.events_received });
  } catch (e) {
    console.error("[Meta CAPI] Route error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
