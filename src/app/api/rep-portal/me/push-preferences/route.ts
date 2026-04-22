import { NextRequest, NextResponse } from "next/server";
import { requireRepAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * PATCH /api/rep-portal/me/push-preferences
 *
 * Rep-level toggle: disable all push, or limit to quiet hours. Scope is
 * all of the rep's registered device tokens — we flip push_enabled on
 * every row (iOS, Android, web) in one UPDATE so the fanout in
 * lib/rep-notifications.ts naturally respects it.
 *
 * Request: { push_enabled?: boolean }
 *
 * Quiet-hours support is deferred until there's a rep UI for it —
 * right now a single on/off is the minimum viable control.
 *
 * Response: { data: { push_enabled, updated_count } }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    let body: { push_enabled?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.push_enabled !== "boolean") {
      return NextResponse.json(
        { error: "push_enabled must be a boolean" },
        { status: 400 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data, error } = await db
      .from("device_tokens")
      .update({ push_enabled: body.push_enabled })
      .eq("rep_id", auth.rep.id)
      .select("id");

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json(
        { error: "Failed to update push preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        push_enabled: body.push_enabled,
        updated_count: (data ?? []).length,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/me/push-preferences] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
