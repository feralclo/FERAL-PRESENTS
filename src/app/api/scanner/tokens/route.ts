import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES, scannerLiveTokensKey } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export interface ScannerToken {
  token: string;
  event_id: string;
  event_name: string;
  label: string;
  created_at: string;
  created_by: string;
}

/**
 * GET /api/scanner/tokens — List all scanner tokens for the org.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const key = scannerLiveTokensKey(auth.orgId);
    const { data } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    const tokens: ScannerToken[] = Array.isArray(data?.data) ? data.data : [];

    return NextResponse.json({ data: tokens });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/scanner/tokens — Create a new scanner token for an event.
 * Body: { event_id: string, label?: string }
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    let body: { event_id?: string; label?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.event_id) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }

    // Verify event belongs to this org
    const { data: event, error: eventErr } = await supabase
      .from(TABLES.EVENTS)
      .select("id, name")
      .eq("id", body.event_id)
      .eq("org_id", auth.orgId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Generate a unique token
    const token = crypto.randomBytes(16).toString("hex");

    const newToken: ScannerToken = {
      token,
      event_id: event.id,
      event_name: event.name,
      label: body.label || "",
      created_at: new Date().toISOString(),
      created_by: auth.user.email,
    };

    // Fetch existing tokens
    const key = scannerLiveTokensKey(auth.orgId);
    const { data: existing } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    const tokens: ScannerToken[] = Array.isArray(existing?.data) ? existing.data : [];
    tokens.push(newToken);

    // Upsert
    await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        { key, data: tokens, org_id: auth.orgId },
        { onConflict: "key" }
      );

    return NextResponse.json({ data: newToken });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/scanner/tokens — Revoke a scanner token.
 * Body: { token: string }
 */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    let body: { token?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const key = scannerLiveTokensKey(auth.orgId);
    const { data: existing } = await supabase
      .from(TABLES.SITE_SETTINGS)
      .select("data")
      .eq("key", key)
      .single();

    const tokens: ScannerToken[] = Array.isArray(existing?.data) ? existing.data : [];
    const filtered = tokens.filter((t) => t.token !== body.token);

    if (filtered.length === tokens.length) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    await supabase
      .from(TABLES.SITE_SETTINGS)
      .upsert(
        { key, data: filtered, org_id: auth.orgId },
        { onConflict: "key" }
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
