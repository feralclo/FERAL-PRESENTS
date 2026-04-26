import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * Rep block list — App Store Guideline 1.2 (UGC apps must let users block
 * others). One-way blocks; the read paths in feed / peer-activity / etc.
 * OR-check both directions so a block is mutually invisible.
 *
 * GET  /api/rep-portal/blocks       — list reps the auth'd rep has blocked
 * POST /api/rep-portal/blocks       — block a rep (body: { rep_id, reason? })
 * DELETE /api/rep-portal/blocks/[blockedRepId] — unblock (path param)
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MAX = 500;

export async function GET() {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    const { data, error } = await db
      .from("rep_blocks")
      .select(
        "id, blocked_rep_id, reason, created_at, blocked:reps!rep_blocks_blocked_rep_id_fkey(id, display_name, photo_url)",
      )
      .eq("blocker_rep_id", auth.rep.id)
      .order("created_at", { ascending: false });

    if (error) {
      Sentry.captureException(error, { extra: { repId: auth.rep.id } });
      return NextResponse.json(
        { error: "Failed to fetch blocks" },
        { status: 500 },
      );
    }

    type Row = {
      id: string;
      blocked_rep_id: string;
      reason: string | null;
      created_at: string;
      blocked:
        | { id: string; display_name: string | null; photo_url: string | null }
        | Array<{
            id: string;
            display_name: string | null;
            photo_url: string | null;
          }>
        | null;
    };
    const shaped = ((data ?? []) as Row[]).map((r) => {
      const b = Array.isArray(r.blocked) ? r.blocked[0] ?? null : r.blocked;
      return {
        id: r.id,
        blocked_rep_id: r.blocked_rep_id,
        reason: r.reason,
        created_at: r.created_at,
        rep: b
          ? {
              id: b.id,
              display_name: b.display_name,
              photo_url: b.photo_url,
            }
          : null,
      };
    });

    return NextResponse.json({ data: shaped });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/blocks] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth();
    if (auth.error) return auth.error;

    let body: { rep_id?: unknown; reason?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const blockedRepId = typeof body.rep_id === "string" ? body.rep_id : "";
    if (!blockedRepId || !UUID_RE.test(blockedRepId)) {
      return NextResponse.json(
        { error: "rep_id must be a valid UUID" },
        { status: 400 },
      );
    }

    if (blockedRepId === auth.rep.id) {
      return NextResponse.json(
        { error: "Cannot block yourself" },
        { status: 400 },
      );
    }

    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, REASON_MAX)
        : null;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    // Verify target rep exists (cleaner 404 than relying on FK violation
    // surfacing as a generic 500).
    const { data: target } = await db
      .from("reps")
      .select("id")
      .eq("id", blockedRepId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    // Upsert: re-blocking an already-blocked rep should refresh reason +
    // timestamp, not 409. Idempotent from iOS' perspective.
    const { data, error } = await db
      .from("rep_blocks")
      .upsert(
        {
          blocker_rep_id: auth.rep.id,
          blocked_rep_id: blockedRepId,
          reason,
        },
        { onConflict: "blocker_rep_id,blocked_rep_id" },
      )
      .select("id, blocked_rep_id, reason, created_at")
      .single();

    if (error) {
      Sentry.captureException(error, {
        extra: { repId: auth.rep.id, blockedRepId },
      });
      return NextResponse.json(
        { error: "Failed to block rep" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/blocks] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
