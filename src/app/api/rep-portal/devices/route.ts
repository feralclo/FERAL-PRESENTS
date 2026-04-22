import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/devices
 *
 * Register a device for push notifications. Upserts into device_tokens
 * keyed on (rep_id, token) so the same physical device re-registering
 * refreshes its metadata rather than creating duplicates.
 *
 * Request:
 *   {
 *     platform: 'ios' | 'android' | 'web',
 *     token: string (APNs device token / FCM registration / web-push endpoint),
 *     app_version?: string,
 *     os_version?: string,
 *     device_model?: string
 *   }
 *
 * Response (200): { data: { id, created_at, last_seen_at } }
 */
const ALLOWED_PLATFORMS = new Set(["ios", "android", "web"]);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    let body: {
      platform?: unknown;
      token?: unknown;
      app_version?: unknown;
      os_version?: unknown;
      device_model?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const platform = String(body.platform ?? "");
    if (!ALLOWED_PLATFORMS.has(platform)) {
      return NextResponse.json(
        { error: "platform must be 'ios', 'android', or 'web'" },
        { status: 400 }
      );
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (token.length > 4096) {
      return NextResponse.json(
        { error: "token exceeds 4096 character limit" },
        { status: 400 }
      );
    }

    const appVersion = typeof body.app_version === "string" ? body.app_version.slice(0, 64) : null;
    const osVersion = typeof body.os_version === "string" ? body.os_version.slice(0, 64) : null;
    const deviceModel = typeof body.device_model === "string" ? body.device_model.slice(0, 128) : null;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Upsert on (rep_id, token). Every register call bumps last_seen_at
    // so we can age-out stale tokens later.
    const { data, error } = await db
      .from("device_tokens")
      .upsert(
        {
          rep_id: auth.rep.id,
          platform,
          token,
          app_version: appVersion,
          os_version: osVersion,
          device_model: deviceModel,
          push_enabled: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "rep_id,token" }
      )
      .select("id, created_at, last_seen_at")
      .single();

    if (error) {
      Sentry.captureException(error, {
        extra: { repId: auth.rep.id, platform },
      });
      return NextResponse.json(
        { error: "Failed to register device" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/devices POST] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
